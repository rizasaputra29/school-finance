/**
 * Asset Purchase API
 * Handles purchase of fixed assets (equipment, vehicles, buildings, land)
 * and non-asset expenses (supplies, services, maintenance)
 * 
 * Double-entry logic:
 * - Asset purchase: Debit Aset (Asset account), Credit Kas/Bank (payment)
 * - Non-asset: Debit Beban (Expense account), Credit Kas/Bank (payment)
 */

import type { NextApiResponse } from 'next';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Asset categories that are true fixed assets (tracked in Asset model)
const ASSET_CATEGORIES = ['Peralatan', 'Kendaraan', 'Bangunan', 'Tanah'];

// Non-asset categories that go directly to expense
const NON_ASSET_CATEGORIES = ['Supplies', 'Services', 'Maintenance', 'Perlengkapan', 'Jasa', 'Perawatan'];

// Validation schema for asset purchase
const purchaseSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  nama: z.string().min(1, 'Nama item wajib diisi'),
  kategori: z.string().min(1, 'Kategori wajib diisi'),
  jumlah: z.number().positive('Jumlah harus lebih dari 0'),
  kodeAkun: z.string().optional(), // Specific account code if provided
  metodePembayaran: z.enum(['kas', 'bank']).default('kas'),
  lokasi: z.string().optional(),
  umurTeknis: z.number().int().min(0).max(50).optional(), // Years for depreciation
  nilaiResidu: z.number().min(0).optional().default(0),
  keterangan: z.string().optional(),
});

// Response type
interface PurchaseResponse {
  success: boolean;
  message: string;
  data?: {
    cashflows: Array<{
      id: string;
      kodeAkun: string;
      debit: number;
      kredit: number;
      keterangan: string;
    }>;
    asset?: {
      id: string;
      nama: string;
      kategori: string;
      hargaPerolehan: number;
      tanggalPerolehan: Date;
    };
    journalEntry?: {
      id: string;
      tanggal: Date;
      keterangan: string;
    };
    entries: Array<{
      kodeAkun: string;
      debit: number;
      kredit: number;
      keterangan: string;
    }>;
  };
}

/**
 * Find cash or bank account for payment
 */
async function findPaymentAccount(tx: PrismaTransactionClient, metodePembayaran: 'kas' | 'bank'): Promise<string | null> {
  const account = await tx.account.findFirst({
    where: {
      tipeAkun: 'Asset',
      OR: metodePembayaran === 'bank'
        ? [{ namaAkun: { contains: 'Bank', mode: 'insensitive' } }]
        : [{ namaAkun: { contains: 'Kas', mode: 'insensitive' } }],
    },
  });
  return account?.kodeAkun || null;
}

/**
 * Find or create asset account based on category
 */
async function findOrCreateAssetAccount(
  tx: PrismaTransactionClient,
  kategori: string
): Promise<string> {
  // Map category to typical account code
  const categoryAccountMap: Record<string, { kode: string; nama: string }> = {
    'Peralatan': { kode: '1501', nama: 'Peralatan' },
    'Kendaraan': { kode: '1502', nama: 'Kendaraan' },
    'Bangunan': { kode: '1503', nama: 'Bangunan' },
    'Tanah': { kode: '1504', nama: 'Tanah' },
    'Supplies': { kode: '1601', nama: 'Perlengkapan' },
    'Services': { kode: '6101', nama: 'Beban Jasa' },
    'Maintenance': { kode: '6201', nama: 'Beban Perawatan' },
    'Perlengkapan': { kode: '1601', nama: 'Perlengkapan' },
    'Jasa': { kode: '6101', nama: 'Beban Jasa' },
    'Perawatan': { kode: '6201', nama: 'Beban Perawatan' },
  };

  const mapping = categoryAccountMap[kategori];
  if (!mapping) {
    throw new Error(`Kategori tidak valid: ${kategori}`);
  }

  // Try to find existing account
  let account = await tx.account.findUnique({
    where: { kodeAkun: mapping.kode },
  });

  if (!account) {
    // Create the account
    const isAssetCategory = ASSET_CATEGORIES.includes(kategori);
    account = await tx.account.create({
      data: {
        kodeAkun: mapping.kode,
        namaAkun: mapping.nama,
        tipeAkun: isAssetCategory ? 'Asset' : 'Expense',
        saldo: 0,
      },
    });
  }

  return account.kodeAkun;
}

/**
 * Find expense account for non-asset purchases
 */
async function findExpenseAccount(tx: PrismaTransactionClient, kategori: string): Promise<string> {
  // Find existing expense account or use default
  const categoryExpenseMap: Record<string, { kode: string; nama: string }> = {
    'Supplies': { kode: '1601', nama: 'Beban Perlengkapan' },
    'Perlengkapan': { kode: '1601', nama: 'Beban Perlengkapan' },
    'Services': { kode: '6101', nama: 'Beban Jasa' },
    'Jasa': { kode: '6101', nama: 'Beban Jasa' },
    'Maintenance': { kode: '6201', nama: 'Beban Perawatan' },
    'Perawatan': { kode: '6201', nama: 'Beban Perawatan' },
  };

  const mapping = categoryExpenseMap[kategori];
  if (!mapping) {
    throw new Error(`Kategori expense tidak valid: ${kategori}`);
  }

  let account = await tx.account.findUnique({
    where: { kodeAkun: mapping.kode },
  });

  if (!account) {
    // Create the expense account
    account = await tx.account.create({
      data: {
        kodeAkun: mapping.kode,
        namaAkun: mapping.nama,
        tipeAkun: 'Expense',
        saldo: 0,
      },
    });
  }

  return account.kodeAkun;
}

/**
 * Determine if category is an asset or expense
 */
function isAssetCategory(kategori: string): boolean {
  return ASSET_CATEGORIES.includes(kategori);
}

/**
 * Process asset purchase transaction
 */
async function processPurchase(
  tx: PrismaTransactionClient,
  data: {
    tanggal: string;
    nama: string;
    kategori: string;
    jumlah: number;
    kodeAkun?: string;
    metodePembayaran: 'kas' | 'bank';
    lokasi?: string;
    umurTeknis?: number;
    nilaiResidu?: number;
    keterangan?: string;
  }
): Promise<PurchaseResponse['data']> {
  const isAsset = isAssetCategory(data.kategori);
  
  // Find payment account (Kas or Bank)
  const paymentAccountCode = await findPaymentAccount(tx, data.metodePembayaran);
  if (!paymentAccountCode) {
    throw new Error('Akun Kas/Bank tidak ditemukan');
  }

  // Get the target account (asset or expense)
  let targetAccountCode: string;
  if (data.kodeAkun) {
    // Use provided account code
    targetAccountCode = data.kodeAkun;
  } else if (isAsset) {
    targetAccountCode = await findOrCreateAssetAccount(tx, data.kategori);
  } else {
    targetAccountCode = await findExpenseAccount(tx, data.kategori);
  }

  // Verify target account exists
  const targetAccount = await tx.account.findUnique({
    where: { kodeAkun: targetAccountCode },
  });

  if (!targetAccount) {
    throw new Error(`Akun dengan kode ${targetAccountCode} tidak ditemukan`);
  }

  // Build double-entry transactions
  const entries = isAsset
    ? [
        // Asset purchase: Debit Aset, Credit Kas/Bank
        {
          kodeAkun: targetAccountCode,
          debit: data.jumlah,
          kredit: 0,
          keterangan: `${data.nama} - Pembelian ${data.kategori}`,
        },
        {
          kodeAkun: paymentAccountCode,
          debit: 0,
          kredit: data.jumlah,
          keterangan: `Pembayaran pembelian ${data.nama}`,
        },
      ]
    : [
        // Non-asset: Debit Beban, Credit Kas/Bank
        {
          kodeAkun: targetAccountCode,
          debit: data.jumlah,
          kredit: 0,
          keterangan: `${data.nama} - ${data.kategori}`,
        },
        {
          kodeAkun: paymentAccountCode,
          debit: 0,
          kredit: data.jumlah,
          keterangan: `Pembayaran ${data.nama}`,
        },
      ];

  // Process all entries and update account balances
  const createdCashflows = [];

  for (const entry of entries) {
    // Get account for balance calculation
    const account = await tx.account.findUnique({
      where: { kodeAkun: entry.kodeAkun },
    });

    if (!account) {
      throw new Error(`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`);
    }

    // Calculate balance adjustment based on account type
    const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);
    let saldoChange = 0;

    if (isDebitNormal) {
      saldoChange = entry.debit - entry.kredit;
    } else {
      saldoChange = entry.kredit - entry.debit;
    }

    // Update account balance
    await tx.account.update({
      where: { kodeAkun: entry.kodeAkun },
      data: {
        saldo: { increment: saldoChange },
      },
    });

    // Create cashflow record
    const cashflow = await tx.cashflow.create({
      data: {
        tanggal: new Date(data.tanggal),
        keterangan: entry.keterangan,
        kodeAkun: entry.kodeAkun,
        kategori: isAsset ? 'aset' : 'pengeluaran',
        debit: entry.debit,
        kredit: entry.kredit,
        source: data.metodePembayaran,
      } as never,
    });

    createdCashflows.push({
      id: cashflow.id,
      kodeAkun: cashflow.kodeAkun,
      debit: cashflow.debit,
      kredit: cashflow.kredit,
      keterangan: cashflow.keterangan,
    });
  }

  // Create journal entry for proper double-entry bookkeeping
  const journalEntry = await tx.journalEntry.create({
    data: {
      tanggal: new Date(data.tanggal),
      keterangan: data.keterangan || `Pembelian ${isAsset ? 'Aktiva' : 'Beban'}: ${data.nama}`,
      reference: 'asset-purchase',
    },
  });

  // Create journal entry lines
  for (const entry of entries) {
    await tx.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        kodeAkun: entry.kodeAkun,
        debit: entry.debit,
        kredit: entry.kredit,
      },
    });
  }

  // If it's an asset, create Asset record for tracking
  let assetRecord = null;
  if (isAsset) {
    const isTanah = data.kategori === 'Tanah';
    const umur = isTanah ? 0 : (data.umurTeknis || getDefaultUmurTeknis(data.kategori));

    const asset = await tx.asset.create({
      data: {
        kodeAkun: targetAccountCode,
        nama: data.nama,
        kategori: data.kategori,
        lokasi: data.lokasi || null,
        tanggalPerolehan: new Date(data.tanggal),
        hargaPerolehan: data.jumlah,
        umurTeknis: umur,
        nilaiResidu: data.nilaiResidu || 0,
        isTanah: isTanah,
        status: 'Active',
      },
    });

    assetRecord = {
      id: asset.id,
      nama: asset.nama,
      kategori: asset.kategori,
      hargaPerolehan: asset.hargaPerolehan,
      tanggalPerolehan: asset.tanggalPerolehan,
    };
  }

  return {
    cashflows: createdCashflows,
    asset: assetRecord || undefined,
    journalEntry: {
      id: journalEntry.id,
      tanggal: journalEntry.tanggal,
      keterangan: journalEntry.keterangan,
    },
    entries,
  };
}

/**
 * Get default technical life based on category
 */
function getDefaultUmurTeknis(kategori: string): number {
  const defaultUmurMap: Record<string, number> = {
    'Peralatan': 5,
    'Kendaraan': 10,
    'Bangunan': 20,
  };
  return defaultUmurMap[kategori] || 5;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const ip = getClientIp(req);

  try {
    switch (req.method) {
      case 'GET': {
        // GET: List all purchases (filtered by asset/expense)
        const { page = '1', limit = '20', isAsset, startDate, endDate, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        // Build where clause
        const where: Record<string, unknown> = {};
        
        // Filter by asset purchases
        if (isAsset === 'true') {
          where.kategori = { in: ASSET_CATEGORIES };
        } else if (isAsset === 'false') {
          where.kategori = { in: NON_ASSET_CATEGORIES };
        }

        // Date range filter
        if (startDate && endDate) {
          where.tanggal = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }

        // Search filter
        if (search) {
          where.OR = [
            { nama: { contains: search as string, mode: 'insensitive' } },
            { kategori: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        // Get all purchases (both Asset records and Cashflows)
        const [assetPurchases, nonAssetPurchases, totalAssets, totalNonAssets]: [
          Awaited<ReturnType<typeof prisma.asset.findMany>> | [],
          Awaited<ReturnType<typeof prisma.cashflow.findMany>> | [],
          number,
          number
        ] = await Promise.all([
          // Asset purchases from Asset table
          isAsset !== 'false' 
            ? prisma.asset.findMany({
                where,
                orderBy: { tanggalPerolehan: 'desc' },
                skip,
                take: parseInt(limit as string),
                include: { account: true },
              })
            : Promise.resolve([]),
          // Non-asset purchases from Cashflow (expense categories)
          isAsset !== 'true'
            ? prisma.cashflow.findMany({
                where: {
                  kategori: 'pengeluaran',
                  ...(startDate && endDate ? { tanggal: { gte: new Date(startDate as string), lte: new Date(endDate as string) } } : {}),
                },
                orderBy: { tanggal: 'desc' },
                take: parseInt(limit as string),
              })
            : Promise.resolve([]),
          isAsset !== 'false' ? prisma.asset.count({ where }) : Promise.resolve(0),
          isAsset !== 'true' ? prisma.cashflow.count({ where: { kategori: 'pengeluaran' } }) : Promise.resolve(0),
        ]);

        // Determine total count
        let total = 0;
        if (isAsset === 'true') total = totalAssets;
        else if (isAsset === 'false') total = totalNonAssets;
        else total = totalAssets + totalNonAssets;

        return res.status(200).json({
          data: {
            assets: assetPurchases.map((a) => ({
              id: a.id,
              nama: a.nama,
              kategori: a.kategori,
              jumlah: a.hargaPerolehan,
              tanggal: a.tanggalPerolehan,
              lokasi: a.lokasi,
              isAsset: true,
            })),
            expenses: nonAssetPurchases.map((c) => ({
              id: c.id,
              nama: c.keterangan,
              kategori: c.kategori,
              jumlah: c.debit,
              tanggal: c.tanggal,
              isAsset: false,
            })),
          },
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
          categories: {
            assets: ASSET_CATEGORIES,
            nonAssets: NON_ASSET_CATEGORIES,
          },
        });
      }

      case 'POST': {
        // POST: Create new purchase
        const rateLimitResult = rateLimit(`purchase:${ip}`, RATE_LIMITS.create);
        if (!rateLimitResult.success) {
          res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
          return res.status(429).json({
            error: formatRateLimitError(rateLimitResult),
            code: 'RATE_LIMIT_EXCEEDED',
          });
        }

        // Validate request body
        const errors = validateBodySchema(req.body, purchaseSchema);
        if (errors) {
          return res.status(400).json({
            error: 'Validation failed',
            validationErrors: errors,
          });
        }

        const data = req.body as z.infer<typeof purchaseSchema>;

        // Process the purchase in a transaction
        try {
          const result = await prisma.$transaction(async (tx) => {
            return processPurchase(tx, data);
          });

          return res.status(201).json({
            success: true,
            message: isAssetCategory(data.kategori)
              ? `Pembelian aktiva "${data.nama}" berhasil`
              : `Pengeluaran "${data.nama}" berhasil dicatat`,
            data: result,
          });
        } catch (error) {
          console.error('Purchase transaction error:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';
          return res.status(400).json({ error: message });
        }
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Asset Purchase API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

/**
 * Validate body against schema - returns array of errors or null
 */
function validateBodySchema(
  body: unknown,
  schema: z.ZodSchema
): Array<{ field: string; message: string }> | null {
  try {
    schema.parse(body);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
    }
    return [{ field: 'body', message: 'Invalid request body' }];
  }
}

export default withAuth(handler, { requireAdmin: true });