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
 * Calculate complete depreciation data for an asset
 * Handles existing assets by calculating accumulated depreciation
 */
export function calculateDepreciation(
  asset: AssetDepreciationData,
  currentYear: number
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

  // Calculate years elapsed from acquisition to current year
  const acquisitionDate = new Date(asset.tanggalPerolehan);
  const yearsElapsed = Math.max(0, currentYear - acquisitionDate.getFullYear());

  // Cap at useful life
  const effectiveYears = Math.min(yearsElapsed, asset.umurTeknis);

  // Calculate accumulated depreciation
  const accumulatedDepreciation = annualDepreciation * effectiveYears;

  // Calculate remaining book value
  const remainingValue = Math.max(
    asset.nilaiResidu,
    asset.hargaPerolehan - accumulatedDepreciation
  );

  // Current year depreciation (only if within useful life)
  const currentYearDepreciation = effectiveYears < asset.umurTeknis ? annualDepreciation : 0;

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
    remainingUsefulLife: Math.max(0, asset.umurTeknis - effectiveYears),
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

/**
 * Calculate total depreciation for a list of assets in a given year
 */
export function calculateTotalDepreciation(
  assets: AssetDepreciationData[],
  currentYear: number,
  bebanPenyusutanCode: string,
  akumulasiPenyusutanCode: string
): DepreciationResult {
  const entries: DepreciationEntry[] = [];
  const errors: string[] = [];
  let totalDepreciation = 0;
  let assetsProcessed = 0;

  // Filter depreciable assets
  const depreciableAssets = filterDepreciableAssets(assets);

  for (const asset of depreciableAssets) {
    const calc = calculateDepreciation(asset, currentYear);

    if (!calc || calc.currentYearDepreciation <= 0) {
      continue;
    }

    // Add journal entries for this asset
    const assetEntries = buildDepreciationJournalEntries(
      asset.nama,
      calc.currentYearDepreciation,
      currentYear,
      bebanPenyusutanCode,
      akumulasiPenyusutanCode
    );

    entries.push(...assetEntries);
    totalDepreciation += calc.currentYearDepreciation;
    assetsProcessed++;
  }

  return {
    success: errors.length === 0,
    assetsProcessed,
    totalDepreciation,
    entries,
    errors,
  };
}
