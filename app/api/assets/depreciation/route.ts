/**
 * Asset Depreciation API
 * Auto-generates depreciation journal entries for fixed assets
 * Double-entry: Debit "Beban Penyusutan", Credit "Akumulasi Penyusutan"
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import {
  calculateDepreciation,
  buildDepreciationJournalEntries,
  filterDepreciableAssets,
  type AssetDepreciationData,
  type DepreciationCalculation,
} from '@/lib/accounting/depreciation';

// Validation schema for manual depreciation trigger
const depreciateSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  assetId: z.string().optional(),
  force: z.boolean().optional().default(false),
});

// Response types
interface AssetWithDepreciation extends AssetDepreciationData {
  depreciation?: DepreciationCalculation;
}

interface DepreciationApiResponse {
  success: boolean;
  year: number;
  assetsProcessed: number;
  totalDepreciation: number;
  message: string;
  details?: {
    assets: AssetWithDepreciation[];
    entries: Array<{
      kodeAkun: string;
      debit: number;
      kredit: number;
      keterangan: string;
    }>;
  };
}

/**
 * Get all accounts needed for depreciation
 */
async function getDepreciationAccounts() {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { namaAkun: { contains: 'Beban Penyusutan', mode: 'insensitive' } },
        { namaAkun: { contains: 'Akumulasi Penyusutan', mode: 'insensitive' } },
      ],
    },
  });

  return accounts;
}

/**
 * Find or create the required depreciation accounts
 */
async function findOrCreateDepreciationAccounts() {
  let accounts = await getDepreciationAccounts();

  // If accounts don't exist, create them
  if (accounts.length < 2) {
    const bebanPenyusutan = accounts.find((a) =>
      a.namaAkun.toLowerCase().includes('beban')
    );
    const akumulasi = accounts.find((a) =>
      a.namaAkun.toLowerCase().includes('akumulasi')
    );

    if (!bebanPenyusutan) {
      await prisma.account.create({
        data: {
          kodeAkun: '600',
          namaAkun: 'Beban Penyusutan Aktiva Tetap',
          tipeAkun: 'Expense',
          saldo: 0,
        },
      });
    }

    if (!akumulasi) {
      await prisma.account.create({
        data: {
          kodeAkun: '111',
          namaAkun: 'Akumulasi Penyusutan Aktiva Tetap',
          tipeAkun: 'Asset',
          saldo: 0,
        },
      });
    }

    // Refresh accounts list
    accounts = await getDepreciationAccounts();
  }

  const bebanCode = accounts.find(
    (a) =>
      a.tipeAkun === 'Expense' &&
      a.namaAkun.toLowerCase().includes('penyusutan')
  );
  const akumulasiCode = accounts.find(
    (a) =>
      a.tipeAkun === 'Asset' &&
      a.namaAkun.toLowerCase().includes('akumulasi')
  );

  return {
    bebanPenyusutanCode: bebanCode?.kodeAkun || '600',
    akumulasiPenyusutanCode: akumulasiCode?.kodeAkun || '111',
  };
}

/**
 * Get all assets for depreciation calculation
 */
async function getAllAssets(): Promise<AssetDepreciationData[]> {
  const assets = await prisma.asset.findMany({
    where: { status: 'Active' },
    include: { account: true },
    orderBy: { tanggalPerolehan: 'asc' },
  });

  return assets.map((asset) => ({
    id: asset.id,
    kodeAkun: asset.kodeAkun,
    nama: asset.nama,
    kategori: asset.kategori,
    tanggalPerolehan: asset.tanggalPerolehan,
    hargaPerolehan: asset.hargaPerolehan,
    umurTeknis: asset.umurTeknis,
    nilaiResidu: asset.nilaiResidu,
    isTanah: asset.isTanah,
    status: asset.status,
  }));
}

/**
 * Check if depreciation for a given year has already been processed
 */
async function isDepreciationAlreadyProcessed(year: number): Promise<boolean> {
  const existingEntry = await prisma.journalEntry.findFirst({
    where: {
      reference: 'depreciation',
      tanggal: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31),
      },
    },
  });
  return !!existingEntry;
}

/**
 * Process depreciation for a single asset or all assets
 */
async function processDepreciation(
  year: number,
  assetId?: string,
  force: boolean = false
): Promise<DepreciationApiResponse> {
  // Check if depreciation already processed for this year
  const alreadyProcessed = await isDepreciationAlreadyProcessed(year);
  
  if (alreadyProcessed && !force) {
    return {
      success: true,
      year,
      assetsProcessed: 0,
      totalDepreciation: 0,
      message: `Depreciation for year ${year} already processed. Use force: true to reprocess.`,
      details: {
        assets: [],
        entries: [],
      },
    };
  }

  // Get depreciation account codes
  const { bebanPenyusutanCode, akumulasiPenyusutanCode } =
    await findOrCreateDepreciationAccounts();

  // Get all active assets
  let assets = await getAllAssets();

  // Filter by assetId if specified
  if (assetId) {
    assets = assets.filter((a) => a.id === assetId);
  }

  // Filter out land assets (they don't depreciate)
  const depreciableAssets = filterDepreciableAssets(assets);

  if (depreciableAssets.length === 0) {
    return {
      success: true,
      year,
      assetsProcessed: 0,
      totalDepreciation: 0,
      message: 'No depreciable assets found',
      details: {
        assets: [],
        entries: [],
      },
    };
  }

  // Calculate depreciation for each asset
  const assetsWithDepreciation: AssetWithDepreciation[] = [];
  const allEntries: Array<{
    kodeAkun: string;
    debit: number;
    kredit: number;
    keterangan: string;
  }> = [];
  let totalDepreciation = 0;
  let assetsProcessed = 0;

  for (const asset of depreciableAssets) {
    const calc = calculateDepreciation(asset, year);

    const assetWithDepreciation: AssetWithDepreciation = {
      ...asset,
      depreciation: calc || undefined,
    };

    assetsWithDepreciation.push(assetWithDepreciation);

    // Generate journal entries if there's depreciation for this year
    if (calc && calc.currentYearDepreciation > 0) {
      const entries = buildDepreciationJournalEntries(
        asset.nama,
        calc.currentYearDepreciation,
        year,
        bebanPenyusutanCode,
        akumulasiPenyusutanCode
      );

      allEntries.push(...entries);
      totalDepreciation += calc.currentYearDepreciation;
      assetsProcessed++;
    }
  }

  // If no depreciation entries generated, return early
  if (allEntries.length === 0) {
    return {
      success: true,
      year,
      assetsProcessed: 0,
      totalDepreciation: 0,
      message: 'No depreciation to process - all assets fully depreciated',
      details: {
        assets: assetsWithDepreciation,
        entries: [],
      },
    };
  }

  // Create journal entries in database
  try {
    await prisma.$transaction(async (tx) => {
      // Create journal entry header
      const journalEntry = await tx.journalEntry.create({
        data: {
          tanggal: new Date(year, 11, 31), // End of year
          keterangan: `Penyusutan Aktiva Tetap Tahun ${year}`,
          reference: 'depreciation',
        },
      });

      // Create journal entry lines using createMany for better performance
      const journalLineData = allEntries.map(entry => ({
        journalEntryId: journalEntry.id,
        kodeAkun: entry.kodeAkun,
        debit: entry.debit,
        kredit: entry.kredit,
      }));
      
      await tx.journalEntryLine.createMany({
        data: journalLineData,
      });

      // Fetch accounts needed for balance updates
      const entryKodeAkuns = [...new Set(allEntries.map(e => e.kodeAkun))];
      const accounts = await tx.account.findMany({
        where: { kodeAkun: { in: entryKodeAkuns } },
      });
      const accountMap = new Map(accounts.map(a => [a.kodeAkun, a]));

      // Update account balances in parallel
      const accountUpdates = allEntries.map(entry => {
        const account = accountMap.get(entry.kodeAkun);
        if (!account) return null;

        const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);
        let saldoChange = 0;

        if (isDebitNormal) {
          saldoChange = entry.debit - entry.kredit;
        } else {
          saldoChange = entry.kredit - entry.debit;
        }

        return tx.account.update({
          where: { kodeAkun: entry.kodeAkun },
          data: {
            saldo: { increment: saldoChange },
          },
        });
      }).filter(Boolean);

      await Promise.all(accountUpdates);

      // Create cashflow entries using createMany for better performance
      const cashflowData: Prisma.CashflowCreateManyInput[] = allEntries.map(entry => {
        const isBankAccount =
          entry.kodeAkun.startsWith('111') || entry.kodeAkun === '102';
        const source = isBankAccount ? 'bank' : 'kas';

        return {
          tanggal: new Date(year, 11, 31),
          keterangan: entry.keterangan,
          kodeAkun: entry.kodeAkun,
          kategori: 'penyusutan',
          debit: entry.debit,
          kredit: entry.kredit,
          source,
        };
      });
      
      await tx.cashflow.createMany({
        data: cashflowData,
      });
    });

    return {
      success: true,
      year,
      assetsProcessed,
      totalDepreciation,
      message: `Depreciation processed for ${assetsProcessed} asset(s)`,
      details: {
        assets: assetsWithDepreciation,
        entries: allEntries,
      },
    };
  } catch (error) {
    console.error('Depreciation transaction error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const queryYear = searchParams.get('year');
      const assetId = searchParams.get('assetId');
      const year = queryYear
        ? parseInt(queryYear, 10)
        : new Date().getFullYear();

      // Get depreciation account codes
      const { bebanPenyusutanCode, akumulasiPenyusutanCode } =
        await findOrCreateDepreciationAccounts();

      // Get assets
      let assets = await getAllAssets();

      if (assetId) {
        assets = assets.filter((a) => a.id === assetId);
      }

      // Calculate depreciation for each asset
      const assetsWithDepreciation = assets.map((asset) => {
        const calc = calculateDepreciation(asset, year);
        return {
          ...asset,
          depreciation: calc,
          isDepreciable: !asset.isTanah && asset.status === 'Active',
        };
      });

      // Get account info
      const bebanAccount = await prisma.account.findUnique({
        where: { kodeAkun: bebanPenyusutanCode },
      });
      const akumulasiAccount = await prisma.account.findUnique({
        where: { kodeAkun: akumulasiPenyusutanCode },
      });

      // Calculate totals
      const depreciableAssets = assetsWithDepreciation.filter(
        (a) => a.isDepreciable
      );
      const totalAcquisition = depreciableAssets.reduce(
        (sum, a) => sum + a.hargaPerolehan,
        0
      );
      const totalCurrentDepreciation = depreciableAssets.reduce(
        (sum, a) => sum + (a.depreciation?.currentYearDepreciation || 0),
        0
      );
      const totalAccumulated = depreciableAssets.reduce(
        (sum, a) => sum + (a.depreciation?.accumulatedDepreciation || 0),
        0
      );
      const totalRemainingLife = depreciableAssets.reduce(
        (sum, a) => sum + (a.depreciation?.remainingUsefulLife || 0),
        0
      );

      return NextResponse.json({
        year,
        accounts: {
          bebanPenyusutan: {
            kodeAkun: bebanPenyusutanCode,
            namaAkun: bebanAccount?.namaAkun,
            tipeAkun: bebanAccount?.tipeAkun,
          },
          akumulasiPenyusutan: {
            kodeAkun: akumulasiPenyusutanCode,
            namaAkun: akumulasiAccount?.namaAkun,
            tipeAkun: akumulasiAccount?.tipeAkun,
          },
        },
        summary: {
          totalAssets: assets.length,
          depreciableAssets: depreciableAssets.length,
          totalAcquisition,
          totalCurrentYearDepreciation: totalCurrentDepreciation,
          totalAccumulatedDepreciation: totalAccumulated,
          totalRemainingUsefulLife: totalRemainingLife,
        },
        assets: assetsWithDepreciation,
      });
    } catch (error) {
      console.error('Depreciation API error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }, { requireAdmin: true });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const body = await request.json();
      
      // Validate request body
      const validationResult = depreciateSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json({ 
          errors: validationResult.error 
        }, { status: 400 });
      }

      const { year, assetId, force } = validationResult.data;

      // Default to current year if not specified
      const targetYear = year || new Date().getFullYear();

      // Process depreciation
      const result = await processDepreciation(targetYear, assetId, force);

      if (!result.success) {
        return NextResponse.json(result, { status: 400 });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('Depreciation API error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }, { requireAdmin: true });
}
