/**
 * Chart of Accounts - Standard account structure for double-entry bookkeeping
 * Following code-quality.md: pure functions, modular, clear naming
 */

// ============================================================================
// Types
// ============================================================================

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export type NormalBalance = 'debit' | 'kredit';

export interface ChartAccount {
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: AccountType;
  kategori?: string;
  isSystem: boolean;
  isContra: boolean;
  normalBalance: NormalBalance;
  saldo?: number;
}

// Type for Prisma create input (will match after client regeneration)
export interface AccountCreateInput {
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  kategori: string | null;
  saldo: number;
  isSystem: boolean;
  isContra: boolean;
  normalBalance: string;
  isSystemProtected: boolean;
  allowNegative: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Get normal balance by account type
 */
export function getNormalBalanceByType(tipeAkun: AccountType): NormalBalance {
  switch (tipeAkun) {
    case 'Asset':
    case 'Expense':
      return 'debit';
    case 'Liability':
    case 'Equity':
    case 'Revenue':
      return 'kredit';
  }
}

/**
 * Get account type label (Indonesian)
 */
export function getAccountTypeLabel(tipeAkun: AccountType): string {
  const labels: Record<AccountType, string> = {
    Asset: 'Aset',
    Liability: 'Kewajiban',
    Equity: 'Ekuitas',
    Revenue: 'Pendapatan',
    Expense: 'Beban',
  };
  return labels[tipeAkun];
}

/**
 * Check if account type is debit-normal
 */
export function isDebitNormalAccount(tipeAkun: AccountType): boolean {
  return tipeAkun === 'Asset' || tipeAkun === 'Expense';
}

/**
 * Check if account type is credit-normal
 */
export function isCreditNormalAccount(tipeAkun: AccountType): boolean {
  return tipeAkun === 'Liability' || tipeAkun === 'Equity' || tipeAkun === 'Revenue';
}

// ============================================================================
// Chart of Accounts Data
// ============================================================================

/**
 * Standard Chart of Accounts for school finance
 * Based on Indonesian accounting standards for educational institutions
 */
export const CHART_OF_ACCOUNTS: ChartAccount[] = [
  // ===== ASSET (Normal: Debit) =====
  // 1000 - Aset Lancar
  {
    kodeAkun: '1100',
    namaAkun: 'Kas',
    tipeAkun: 'Asset',
    kategori: 'Kas',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '1110',
    namaAkun: 'Bank',
    tipeAkun: 'Asset',
    kategori: 'Bank',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '103',
    namaAkun: 'Piutang Siswa',
    tipeAkun: 'Asset',
    kategori: 'Piutang',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },

  // 1500 - Aset Tetap
  {
    kodeAkun: '1500',
    namaAkun: 'Peralatan',
    tipeAkun: 'Asset',
    kategori: 'AsetTetap',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '1501',
    namaAkun: 'Akumulasi Penyusutan',
    tipeAkun: 'Asset',
    kategori: 'AsetTetap',
    isSystem: true,
    isContra: true, // Contra account - reduces the value of equipment
    normalBalance: 'kredit', // Contra accounts have opposite normal balance
    saldo: 0,
  },

  // ===== LIABILITY (Normal: Credit) =====
  // 2000 - Kewajiban Lancar
  {
    kodeAkun: '2100',
    namaAkun: 'Hutang Dagang',
    tipeAkun: 'Liability',
    kategori: 'Hutang',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '2110',
    namaAkun: 'Hutang Bank',
    tipeAkun: 'Liability',
    kategori: 'Hutang',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== EQUITY (Normal: Credit) =====
  // 3000 - Ekuitas
  {
    kodeAkun: '3100',
    namaAkun: 'Modal',
    tipeAkun: 'Equity',
    kategori: 'Ekuitas',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '3200',
    namaAkun: 'Saldo Berjalan',
    tipeAkun: 'Equity',
    kategori: 'Ekuitas',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '3201',
    namaAkun: 'Laba/Rugi Tahun Berjalan',
    tipeAkun: 'Equity',
    kategori: 'Ekuitas',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== REVENUE (Normal: Credit) =====
  // 4000 - Pendapatan
  {
    kodeAkun: '401',
    namaAkun: 'Pendapatan SPP',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '402',
    namaAkun: 'Pendapatan Uang Gedung',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '403',
    namaAkun: 'Pendapatan Kegiatan',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '404',
    namaAkun: 'Pendapatan Seragam',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '405',
    namaAkun: 'Pendapatan ATK',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== EXPENSE (Normal: Debit) =====
  // 5000 - Beban
  {
    kodeAkun: '501',
    namaAkun: 'Beban Gaji',
    tipeAkun: 'Expense',
    kategori: 'Beban',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '502',
    namaAkun: 'Beban Operasional',
    tipeAkun: 'Expense',
    kategori: 'Beban',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '503',
    namaAkun: 'Beban Pemeliharaan',
    tipeAkun: 'Expense',
    kategori: 'Beban',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '504',
    namaAkun: 'Beban Penyusutan',
    tipeAkun: 'Expense',
    kategori: 'Beban',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
];

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Get all system accounts (isSystem = true)
 */
export function getSystemAccounts(): ChartAccount[] {
  return CHART_OF_ACCOUNTS.filter(account => account.isSystem);
}

/**
 * Get contra accounts
 */
export function getContraAccounts(): ChartAccount[] {
  return CHART_OF_ACCOUNTS.filter(account => account.isContra);
}

/**
 * Find account by kodeAkun
 */
export function findAccountByCode(kodeAkun: string): ChartAccount | undefined {
  return CHART_OF_ACCOUNTS.find(account => account.kodeAkun === kodeAkun);
}

/**
 * Get accounts by type
 */
export function getAccountsByType(tipeAkun: AccountType): ChartAccount[] {
  return CHART_OF_ACCOUNTS.filter(account => account.tipeAkun === tipeAkun);
}

/**
 * Get all asset accounts
 */
export function getAssetAccounts(): ChartAccount[] {
  return getAccountsByType('Asset');
}

/**
 * Get all liability accounts
 */
export function getLiabilityAccounts(): ChartAccount[] {
  return getAccountsByType('Liability');
}

/**
 * Get all equity accounts
 */
export function getEquityAccounts(): ChartAccount[] {
  return getAccountsByType('Equity');
}

/**
 * Get all revenue accounts
 */
export function getRevenueAccounts(): ChartAccount[] {
  return getAccountsByType('Revenue');
}

/**
 * Get all expense accounts
 */
export function getExpenseAccounts(): ChartAccount[] {
  return getAccountsByType('Expense');
}

// ============================================================================
// Prisma Data Creation
// ============================================================================

/**
 * Convert ChartAccount to Prisma create input
 */
export function toPrismaCreateInput(account: ChartAccount): AccountCreateInput {
  return {
    kodeAkun: account.kodeAkun,
    namaAkun: account.namaAkun,
    tipeAkun: account.tipeAkun,
    kategori: account.kategori || null,
    saldo: account.saldo || 0,
    isSystem: account.isSystem,
    isContra: account.isContra,
    normalBalance: account.normalBalance,
    isSystemProtected: false,
    allowNegative: false,
  };
}

/**
 * Get all accounts as Prisma create inputs
 */
export function getAllAccountsAsPrismaInput(): AccountCreateInput[] {
  return CHART_OF_ACCOUNTS.map(toPrismaCreateInput);
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if account is system protected (cannot delete or change type)
 */
export function isAccountProtected(kodeAkun: string): boolean {
  const account = findAccountByCode(kodeAkun);
  return account?.isSystem ?? false;
}

/**
 * Check if account is contra account
 */
export function isContraAccount(kodeAkun: string): boolean {
  const account = findAccountByCode(kodeAkun);
  return account?.isContra ?? false;
}

/**
 * Get expected normal balance for an account code
 */
export function getExpectedNormalBalance(kodeAkun: string): NormalBalance | null {
  const account = findAccountByCode(kodeAkun);
  return account?.normalBalance ?? null;
}

/**
 * Validate if a transaction entry follows normal balance rules
 */
export function validateNormalBalanceForEntry(
  kodeAkun: string,
  debit: number,
  kredit: number
): { isValid: boolean; message?: string } {
  const normalBalance = getExpectedNormalBalance(kodeAkun);
  if (!normalBalance) {
    return { isValid: true }; // Unknown account, skip validation
  }

  const account = findAccountByCode(kodeAkun);
  if (account?.isContra) {
    // Contra accounts work opposite to normal
    if (normalBalance === 'debit') {
      // Normal debit account becomes credit normal for contra
      if (debit > 0 && kredit === 0) {
        return {
          isValid: false,
          message: `Akun ${kodeAkun} (${account.namaAkun}) adalah akun kontra. Gunakan kredit untuk menambah.`,
        };
      }
    } else {
      // Normal credit account becomes debit normal for contra
      if (kredit > 0 && debit === 0) {
        return {
          isValid: false,
          message: `Akun ${kodeAkun} (${account.namaAkun}) adalah akun kontra. Gunakan debit untuk menambah.`,
        };
      }
    }
  }

  return { isValid: true };
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Seed default chart of accounts to database
 * Returns the number of accounts created
 */
export async function seedChartOfAccounts(prisma: typeof import('@/lib/prisma').default): Promise<number> {
  let createdCount = 0;

  for (const account of CHART_OF_ACCOUNTS) {
    const existing = await prisma.account.findUnique({
      where: { kodeAkun: account.kodeAkun },
    });

    if (!existing) {
      await prisma.account.create({
        data: toPrismaCreateInput(account),
      });
      createdCount++;
    }
  }

  return createdCount;
}

const chartOfAccountsService = {
  CHART_OF_ACCOUNTS,
  getSystemAccounts,
  getContraAccounts,
  findAccountByCode,
  getAccountsByType,
  getAssetAccounts,
  getLiabilityAccounts,
  getEquityAccounts,
  getRevenueAccounts,
  getExpenseAccounts,
  toPrismaCreateInput,
  getAllAccountsAsPrismaInput,
  isAccountProtected,
  isContraAccount,
  getExpectedNormalBalance,
  validateNormalBalanceForEntry,
  getNormalBalanceByType,
  getAccountTypeLabel,
  isDebitNormalAccount,
  isCreditNormalAccount,
  seedChartOfAccounts,
};

export default chartOfAccountsService;