/**
 * Depreciation Calculation Module
 * Pure functions for asset depreciation calculations
 * Based on straight-line depreciation method
 */

import type { Account } from '@prisma/client';

// Type for asset data used in depreciation calculations
export interface AssetDepreciationData {
  id: string;
  kodeAkun: string;
  nama: string;
  kategori: string;
  tanggalPerolehan: Date;
  hargaPerolehan: number;
  umurTeknis: number;
  nilaiResidu: number;
  isTanah: boolean;
  status: string;
  alreadyDepreciatedAmount?: number;
  alreadyDepreciatedYears?: number;
  sisaUmurTeknis?: number | null;
}

export interface DepreciationCalculation {
  assetId: string;
  annualDepreciation: number;
  nilaiPerolehan: number;
  nilaiResidu: number;
  umurTeknis: number;
  yearsElapsed: number;
  accumulatedDepreciation: number;
  remainingValue: number;
  currentYearDepreciation: number;
  remainingUsefulLife: number;
}

export interface DepreciationEntry {
  kodeAkun: string;
  debit: number;
  kredit: number;
  keterangan: string;
}

export interface DepreciationResult {
  success: boolean;
  assetsProcessed: number;
  totalDepreciation: number;
  entries: DepreciationEntry[];
  errors: string[];
}

/**
 * Calculate annual depreciation using straight-line method
 * Formula: (Acquisition Cost - Salvage Value) / Useful Life
 */
export function calculateAnnualDepreciation(
  nilaiPerolehan: number,
  nilaiResidu: number,
  umurTeknis: number
): number {
  if (umurTeknis <= 0) return 0;
  return (nilaiPerolehan - nilaiResidu) / umurTeknis;
}

/**
 * Add years to a date, preserving the day of month when possible.
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Get the anniversary date for a specific depreciation year index.
 * Year index 0 is the acquisition date itself, which is when the first
 * full-year depreciation is recognised.
 */
export function getDepreciationAnniversaryDate(
  tanggalPerolehan: Date,
  yearIndex: number
): Date {
  return addYears(new Date(tanggalPerolehan), yearIndex);
}

/**
 * Calculate depreciation amount for a specific year index using straight-line.
 * The last year absorbs any rounding remainder so the total equals the
 * depreciable base.
 */
export function calculateDepreciationForYearIndex(
  asset: AssetDepreciationData,
  yearIndex: number
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;
  if (yearIndex < 0 || yearIndex >= asset.umurTeknis) return 0;

  const depreciableBase = asset.hargaPerolehan - asset.nilaiResidu;
  const annualDepreciation = depreciableBase / asset.umurTeknis;

  // Last year takes the remainder to avoid rounding drift.
  if (yearIndex === asset.umurTeknis - 1) {
    const previousYearsTotal = annualDepreciation * (asset.umurTeknis - 1);
    return Math.max(0, depreciableBase - previousYearsTotal);
  }

  return annualDepreciation;
}

/**
 * Count how many depreciation anniversaries have occurred on or before capDate.
 * Anniversaries are at transaction date + 0, +1, +2 ... years.
 */
export function countDepreciatedYearsByDate(
  asset: AssetDepreciationData,
  capDate: Date
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;

  let count = 0;
  for (let n = 0; n < asset.umurTeknis; n++) {
    const anniversary = getDepreciationAnniversaryDate(asset.tanggalPerolehan, n);
    if (anniversary <= capDate) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Calculate total accumulated depreciation up to a given year count.
 */
export function calculateAccumulatedDepreciationForYears(
  asset: AssetDepreciationData,
  years: number
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;

  const cappedYears = Math.max(0, Math.min(years, asset.umurTeknis));
  let total = 0;
  for (let n = 0; n < cappedYears; n++) {
    total += calculateDepreciationForYearIndex(asset, n);
  }
  return total;
}

/**
 * Count the number of calendar months between two dates.
 * The start month is counted as a full month if the end day is >= start day.
 *
 * @deprecated Replaced by anniversary-based full-year depreciation.
 */
export function monthsBetween(startDate: Date, endDate: Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) return 0;

  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  let months = yearDiff * 12 + monthDiff;

  if (end.getDate() >= start.getDate()) {
    months += 1;
  }

  return Math.max(0, months);
}

/**
 * Calculate depreciation for a specific period using anniversary-based
 * full-year recognition. Returns the full annual amount for the next
 * unrecognised year.
 *
 * - Year 0 is recognised in the academic year that contains the purchase date,
 *   or in the first available academic year whose end is on/after the purchase
 *   date when the containing year is not present in the data.
 * - Year n > 0 is recognised in the academic year containing the n-th
 *   anniversary of the purchase date.
 */
export function calculateDepreciationForPeriod(
  asset: AssetDepreciationData,
  periodStart: Date,
  periodEnd: Date
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;

  const nextYearIndex = asset.alreadyDepreciatedYears ?? 0;
  if (nextYearIndex >= asset.umurTeknis) return 0;

  // Year 0: recognise in the academic year containing the purchase date, or
  // the first academic year that ends on/after the purchase date.
  if (nextYearIndex === 0) {
    if (periodEnd >= asset.tanggalPerolehan) {
      return calculateDepreciationForYearIndex(asset, 0);
    }
    return 0;
  }

  const anniversary = getDepreciationAnniversaryDate(
    asset.tanggalPerolehan,
    nextYearIndex
  );

  if (anniversary >= periodStart && anniversary <= periodEnd) {
    return calculateDepreciationForYearIndex(asset, nextYearIndex);
  }

  return 0;
}

/**
 * Calculate depreciation that should be recognised in a single academic year,
 * optionally capped at a cutoff date (defaults to today).
 *
 * This is a reporting helper: it determines which anniversary(ies) fall inside
 * the academic year and returns the corresponding full-year depreciation. It
 * does NOT depend on how much has already been posted.
 */
export function calculateDepreciationForAcademicYear(
  asset: AssetDepreciationData,
  academicYear: { tanggalMulai: Date; tanggalSelesai: Date },
  capDate: Date = new Date()
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;
  if (capDate < academicYear.tanggalMulai) return 0;

  const periodEnd = academicYear.tanggalSelesai < capDate
    ? academicYear.tanggalSelesai
    : capDate;

  if (periodEnd < asset.tanggalPerolehan) return 0;

  let total = 0;
  for (let yearIndex = 0; yearIndex < asset.umurTeknis; yearIndex++) {
    const anniversary = getDepreciationAnniversaryDate(asset.tanggalPerolehan, yearIndex);
    if (anniversary >= academicYear.tanggalMulai && anniversary <= periodEnd) {
      total += calculateDepreciationForYearIndex(asset, yearIndex);
    }
  }
  return total;
}

/**
 * Calculate how many years have passed since asset acquisition
 */
export function calculateYearsElapsed(tanggalPerolehan: Date): number {
  const now = new Date();
  const acquisition = new Date(tanggalPerolehan);
  const diffTime = now.getTime() - acquisition.getTime();
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(diffYears));
}

/**
 * Calculate complete depreciation data for an asset for a given academic year.
 * Uses anniversary-based full-year recognition: the first full year is
 * recognised in the academic year containing the acquisition date, the second
 * full year in the academic year containing the first anniversary, and so on.
 */
export function calculateDepreciation(
  asset: AssetDepreciationData,
  academicYear: { id?: string; tahunAjaran: string; tanggalMulai: Date; tanggalSelesai: Date },
  capDate: Date = new Date()
): DepreciationCalculation | null {
  // Skip land assets - they don't depreciate
  if (asset.isTanah) {
    return null;
  }

  const annualDepreciation = calculateAnnualDepreciation(
    asset.hargaPerolehan,
    asset.nilaiResidu,
    asset.umurTeknis
  );

  // Depreciation for this academic year, capped at today
  const currentYearDepreciation = calculateDepreciationForAcademicYear(
    asset,
    academicYear,
    capDate
  );

  // Projected up-to-date accumulated depreciation as of capDate.
  const depreciatedYearsByDate = countDepreciatedYearsByDate(asset, capDate);
  const accumulatedDepreciation = calculateAccumulatedDepreciationForYears(
    asset,
    depreciatedYearsByDate
  );

  const remainingValue = Math.max(
    asset.nilaiResidu,
    asset.hargaPerolehan - accumulatedDepreciation
  );

  const effectiveYears = Math.min(
    depreciatedYearsByDate,
    asset.umurTeknis
  );
  const remainingUsefulLife = Math.max(0, asset.umurTeknis - effectiveYears);

  return {
    assetId: asset.id,
    annualDepreciation,
    nilaiPerolehan: asset.hargaPerolehan,
    nilaiResidu: asset.nilaiResidu,
    umurTeknis: asset.umurTeknis,
    yearsElapsed: effectiveYears,
    accumulatedDepreciation,
    remainingValue,
    currentYearDepreciation,
    remainingUsefulLife,
  };
}

/**
 * Build double-entry journal entries for depreciation
 * Debit: Beban Penyusutan (Expense)
 * Credit: Akumulasi Penyusutan (Contra-Asset)
 */
export function buildDepreciationJournalEntries(
  assetName: string,
  depreciationAmount: number,
  year: number,
  bebanPenyusutanCode: string,
  akumulasiPenyusutanCode: string
): DepreciationEntry[] {
  if (depreciationAmount <= 0) return [];

  return [
    {
      kodeAkun: bebanPenyusutanCode,
      debit: depreciationAmount,
      kredit: 0,
      keterangan: `Beban Penyusutan ${assetName} Tahun ${year}`,
    },
    {
      kodeAkun: akumulasiPenyusutanCode,
      debit: 0,
      kredit: depreciationAmount,
      keterangan: `Akumulasi Penyusutan ${assetName} Tahun ${year}`,
    },
  ];
}

/**
 * Find account code by name (case-insensitive search)
 */
export function findAccountByName(
  accounts: Account[],
  searchName: string
): Account | null {
  return (
    accounts.find((a) =>
      a.namaAkun.toLowerCase().includes(searchName.toLowerCase())
    ) || null
  );
}

/**
 * Validate that required accounts exist for depreciation
 */
export function validateDepreciationAccounts(
  accounts: Account[]
): { valid: boolean; missing: string[] } {
  const requiredAccounts = [
    { name: 'Beban Penyusutan', type: 'Expense' },
    { name: 'Akumulasi Penyusutan', type: 'Asset' },
  ];

  const missing: string[] = [];

  for (const required of requiredAccounts) {
    const found = accounts.find(
      (a) =>
        a.namaAkun.toLowerCase().includes(required.name.toLowerCase()) &&
        a.tipeAkun === required.type
    );
    if (!found) {
      missing.push(required.name);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Filter depreciable assets (exclude land)
 */
export function filterDepreciableAssets(
  assets: AssetDepreciationData[]
): AssetDepreciationData[] {
  return assets.filter((asset) => !asset.isTanah && asset.status === 'Active');
}


