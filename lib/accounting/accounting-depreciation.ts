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
 * Count the number of calendar months between two dates.
 * The start month is counted as a full month if the end day is >= start day.
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
 * Calculate depreciation for a specific period using clean straight-line.
 *
 * Annual depreciation is always (hargaPerolehan - nilaiResidu) / umurTeknis.
 * The period is clipped to the asset's useful life and the amount is capped
 * to the remaining depreciable base. This avoids the drift that happens when
 * partial years are tracked through `alreadyDepreciatedYears`.
 */
export function calculateDepreciationForPeriod(
  asset: AssetDepreciationData,
  periodStart: Date,
  periodEnd: Date
): number {
  if (asset.isTanah || asset.umurTeknis <= 0) return 0;

  const depreciableBase = asset.hargaPerolehan - asset.nilaiResidu;
  const alreadyDepreciatedAmount = asset.alreadyDepreciatedAmount ?? 0;
  const remainingAmount = Math.max(0, depreciableBase - alreadyDepreciatedAmount);

  if (remainingAmount <= 0) return 0;

  const acquisitionDate = new Date(asset.tanggalPerolehan);
  const usefulLifeEndDate = addYears(acquisitionDate, asset.umurTeknis);

  const effectiveStart = new Date(Math.max(periodStart.getTime(), acquisitionDate.getTime()));
  const effectiveEnd = new Date(Math.min(periodEnd.getTime(), usefulLifeEndDate.getTime()));

  if (effectiveStart >= effectiveEnd) return 0;

  const annualDepreciation = depreciableBase / asset.umurTeknis;
  const months = monthsBetween(effectiveStart, effectiveEnd);
  const periodDepreciation = annualDepreciation * (months / 12);

  return Math.min(periodDepreciation, remainingAmount);
}

/**
 * Calculate depreciation for a single academic year, optionally capped at a
 * cutoff date (defaults to today). Past academic years are processed in full;
 future years return 0.
 */
export function calculateDepreciationForAcademicYear(
  asset: AssetDepreciationData,
  academicYear: { tanggalMulai: Date; tanggalSelesai: Date },
  capDate: Date = new Date()
): number {
  if (capDate < academicYear.tanggalMulai) return 0;

  const periodEnd = academicYear.tanggalSelesai < capDate
    ? academicYear.tanggalSelesai
    : capDate;

  return calculateDepreciationForPeriod(asset, academicYear.tanggalMulai, periodEnd);
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
 * Uses clean straight-line: annual depreciation is constant and the academic
 * year amount is prorated by the months the asset is held in that year.
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

  const alreadyDepreciatedAmount = asset.alreadyDepreciatedAmount ?? 0;

  // Depreciation for this academic year, capped at today
  const currentYearDepreciation = calculateDepreciationForAcademicYear(
    asset,
    academicYear,
    capDate
  );

  const depreciableBase = asset.hargaPerolehan - asset.nilaiResidu;
  const accumulatedDepreciation = Math.min(
    depreciableBase,
    alreadyDepreciatedAmount + currentYearDepreciation
  );

  const remainingValue = Math.max(
    asset.nilaiResidu,
    asset.hargaPerolehan - accumulatedDepreciation
  );

  const effectiveYears =
    annualDepreciation > 0
      ? Math.floor(accumulatedDepreciation / annualDepreciation)
      : 0;
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


