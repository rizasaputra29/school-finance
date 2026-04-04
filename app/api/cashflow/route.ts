import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { validateBody } from '@/lib/validation';

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Transaction type enum - extended with ekuitas
type TransactionType = 'pemasukan' | 'pengeluaran' | 'aset' | 'hutang' | 'piutang' | 'ekuitas';

// Full schema for double-entry transactions with special options
const createCashflowSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  keterangan: z.string().min(1, 'Keterangan wajib diisi').max(500, 'Keterangan maksimal 500 karakter'),
  kodeAkun: z.string().optional(),
  kategori: z.string().optional(),
  debit: z.union([z.number(), z.string()]).optional().default(0),
  kredit: z.union([z.number(), z.string()]).optional().default(0),
  source: z.enum(['kas', 'bank']).optional(),
  // New transaction type fields
  transactionType: z.enum(['pemasukan', 'pengeluaran', 'aset', 'hutang', 'piutang', 'ekuitas']).optional(),
  entries: z.array(z.object({
    kodeAkun: z.string(),
    debit: z.number(),
    kredit: z.number(),
    keterangan: z.string(),
  })).optional(),
  // Asset options
  namaAset: z.string().optional(),
  kategoriAset: z.string().optional(),
  lokasiAset: z.string().optional(),
  umurTeknis: z.number().optional(),
  nilaiResidu: z.number().optional(),
  isTanah: z.boolean().optional(),
  // Debt/Kewajiban options
  tenor: z.number().optional(),
  dueDate: z.string().optional(),
  kreditur: z.string().optional(),
  // Equity options
  jenisEkuitas: z.string().optional(),
  // Piutang options
  studentName: z.string().optional(),
  nis: z.string().optional(),
});

function sendValidationErrorResponse(errors: Array<{ field: string; message: string }>) {
  return NextResponse.json({
    error: 'Validation failed',
    validationErrors: errors,
  }, { status: 400 });
}

// Process double-entry transaction
async function processDoubleEntry(
  tx: PrismaTransactionClient,
  entries: Array<{
    kodeAkun: string;
    debit: number;
    kredit: number;
    keterangan: string;
  }>,
  transactionType: TransactionType,
): Promise<{ cashflows: Array<{
  id: string;
  tanggal: Date;
  keterangan: string;
  kodeAkun: string;
  kategori: string | null;
  debit: number;
  kredit: number;
}>; summary: { totalDebit: number; totalKredit: number } }> {
  const createdCashflows = [];
  let totalDebit = 0;
  let totalKredit = 0;

  for (const entry of entries) {
    // Validate account exists
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

    // Determine source based on account code (111x = bank, 110x = kas)
    const isBankAccount = entry.kodeAkun.startsWith('111') || entry.kodeAkun === '102';
    const source = isBankAccount ? 'bank' : 'kas';

    // Create cashflow record
    const cashflow = await tx.cashflow.create({
      data: {
        tanggal: new Date(),
        keterangan: entry.keterangan,
        kodeAkun: entry.kodeAkun,
        kategori: transactionType,
        debit: entry.debit,
        kredit: entry.kredit,
        source,
        status: 'draft',
      } as never,
    });

    createdCashflows.push(cashflow);
    totalDebit += entry.debit;
    totalKredit += entry.kredit;
  }

  return { cashflows: createdCashflows, summary: { totalDebit, totalKredit } };
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const kodeAkun = searchParams.get('kodeAkun');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const transactionType = searchParams.get('transactionType');
    const status = searchParams.get('status');
    
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};
    if (startDate && endDate) {
      where.tanggal = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }
    if (kodeAkun) {
      where.kodeAkun = kodeAkun;
    }
    
    // Filter by status (draft, approved, posted, rejected)
    if (status) {
      where.status = status;
    }
    
    // Filter by transaction type (kategori)
    if (transactionType) {
      where.kategori = transactionType;
    }
    
    // Legacy filters
    if (type === 'income') {
      where.debit = { gt: 0 };
    } else if (type === 'expense') {
      where.kredit = { gt: 0 };
    }
    
    // Search by keterangan or kodeAkun
    if (search) {
      where.OR = [
        { keterangan: { contains: search, mode: 'insensitive' } },
        { kodeAkun: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [cashflows, total, summaryAgg] = await Promise.all([
      prisma.cashflow.findMany({
        where,
        orderBy: { tanggal: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.cashflow.count({ where }),
      prisma.cashflow.aggregate({
        where,
        _sum: {
          debit: true,
          kredit: true,
        },
      }),
    ]);

    const totalDebit = summaryAgg._sum.debit || 0;
    const totalKredit = summaryAgg._sum.kredit || 0;

    return NextResponse.json({
      data: cashflows,
      summary: {
        totalDebit,
        totalKredit,
        saldo: totalDebit - totalKredit,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const ip = getClientIp(request);
    
    // Rate limiting for create operations
    const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
    if (!rateLimitResult.success) {
      return NextResponse.json({ 
        error: formatRateLimitError(rateLimitResult),
        code: 'RATE_LIMIT_EXCEEDED'
      }, { 
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString()
        }
      });
    }

    const body = await request.json();

    // Validate request body
    const validationErrors = validateBody(body, createCashflowSchema);
    if (validationErrors) {
      return sendValidationErrorResponse(validationErrors);
    }

    const { 
      tanggal, 
      keterangan, 
      kodeAkun, 
      kategori, 
      debit, 
      kredit,
      source,
      transactionType,
      entries,
      // Asset options
      namaAset,
      kategoriAset,
      lokasiAset,
      umurTeknis,
      nilaiResidu,
      isTanah,
      // Debt options
      tenor,
      dueDate,
      kreditur,
      // Equity options
      // Piutang options
    } = body as z.infer<typeof createCashflowSchema>;

    // Handle double-entry transactions
    if (transactionType && entries && entries.length > 0) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Process double entries
          const processResult = await processDoubleEntry(
            tx,
            entries,
            transactionType
          );

          // Create Asset record if this is an asset transaction with penyusutan options
          if (transactionType === 'aset' && kodeAkun && namaAset) {
            const amount = entries[0]?.debit || entries[0]?.kredit || 0;
            await tx.asset.create({
              data: {
                kodeAkun: kodeAkun,
                nama: namaAset,
                kategori: kategoriAset || 'Inventaris',
                lokasi: lokasiAset || '',
                tanggalPerolehan: new Date(tanggal),
                hargaPerolehan: typeof amount === 'number' ? amount : parseFloat(String(amount)),
                umurTeknis: typeof umurTeknis === 'number' ? umurTeknis : 5,
                nilaiResidu: typeof nilaiResidu === 'number' ? nilaiResidu : 0,
                isTanah: isTanah || false,
                status: 'Active',
              },
            });
          }

          // Create Debt record if this is a kewajiban (hutang) transaction
          if (transactionType === 'hutang' && kodeAkun) {
            const kreditAmount = entries[0]?.kredit || 0;
            const jumlahAwal = typeof kreditAmount === 'number' ? kreditAmount : parseFloat(String(kreditAmount));
            const tenorNum = typeof tenor === 'number' ? tenor : parseInt(String(tenor || '12'));
            await tx.debt.create({
              data: {
                kodeAkun: kodeAkun,
                nama: `${keterangan} - ${kreditur || 'Hutang'}`,
                kreditur: kreditur || null,
                jumlahAwal: jumlahAwal,
                jumlahSisa: -Math.abs(jumlahAwal),
                tenor: tenorNum,
                tanggalMulai: new Date(tanggal),
                tanggalJatuhTempo: dueDate ? new Date(dueDate) : new Date(new Date(tanggal).setMonth(new Date(tanggal).getMonth() + tenorNum)),
                cicilanPerBulan: tenorNum ? jumlahAwal / tenorNum : jumlahAwal / 12,
                status: 'Aktif',
              },
            });
          }

          return processResult;
        }, {
          maxWait: 10000,
          timeout: 30000,
        });

        return NextResponse.json({
          success: true,
          data: result.cashflows,
          summary: result.summary,
          message: `Transaksi ${transactionType} berhasil dibuat dengan ${result.cashflows.length} entri`,
        });
      } catch (error) {
        console.error('Double-entry transaction error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // Legacy single entry handling
    const debitAmount = typeof debit === 'string' ? parseFloat(debit) : Number(debit) || 0;
    const kreditAmount = typeof kredit === 'string' ? parseFloat(kredit) : Number(kredit) || 0;

    try {
      // First check if transaction with this hash already exists
      const existingTransaction = await prisma.cashflow.findFirst({
        where: {
          kodeAkun,
          tanggal: {
            gte: new Date(new Date(tanggal).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(tanggal).setHours(23, 59, 59, 999)),
          },
          OR: [
            { debit: debitAmount, kredit: kreditAmount },
          ],
          keterangan: { equals: keterangan, mode: 'insensitive' },
        },
      });

      if (existingTransaction) {
        return NextResponse.json({
          ...existingTransaction,
          isDuplicate: true,
          message: 'Transaksi sudah ada, menggunakan data yang sudah ada',
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Get the account to determine type and current balance
        const account = await tx.account.findUnique({
          where: { kodeAkun },
        });

        if (!account) {
          throw new Error(`Akun dengan kode ${kodeAkun} tidak ditemukan`);
        }

        // 2. Calculate balance adjustment based on account type
        let saldoChange = 0;
        const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);

        if (isDebitNormal) {
          saldoChange = debitAmount - kreditAmount;
        } else {
          saldoChange = kreditAmount - debitAmount;
        }

        // 3. Update account balance
        await tx.account.update({
          where: { kodeAkun },
          data: {
            saldo: { increment: saldoChange },
          },
        });

        // 4. Create cashflow record
        if (!kodeAkun) {
          throw new Error('Kode akun wajib diisi');
        }
        const cashflow = await tx.cashflow.create({
          data: {
            tanggal: new Date(tanggal),
            keterangan,
            kodeAkun,
            kategori: kategori || null,
            debit: debitAmount,
            kredit: kreditAmount,
            source: source as 'kas' | 'bank' | undefined,
            status: 'draft',
          },
        } as never);

        return cashflow;
      }, {
        maxWait: 10000,
        timeout: 30000,
      });

      return NextResponse.json({
        ...result,
        isNew: true,
        message: 'Transaksi berhasil dibuat',
      }, { status: 201 });
    } catch (error) {
      console.error('Transaction error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
