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
  // Aktiva Lancar (101-106)
  {
    kodeAkun: '101',
    namaAkun: 'Kas',
    tipeAkun: 'Asset',
    kategori: 'Kas',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '102',
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
  {
    kodeAkun: '104',
    namaAkun: 'Piutang Lain-Lain',
    tipeAkun: 'Asset',
    kategori: 'Piutang',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '105',
    namaAkun: 'Piutang Periode Sebelumnya',
    tipeAkun: 'Asset',
    kategori: 'Piutang',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '106',
    namaAkun: 'Biaya Dibayar Dimuka',
    tipeAkun: 'Asset',
    kategori: 'Lancar Lainnya',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  // Aktiva Tetap (107-111)
  {
    kodeAkun: '107',
    namaAkun: 'Tanah',
    tipeAkun: 'Asset',
    kategori: 'Aset Tetap',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '108',
    namaAkun: 'Gedung',
    tipeAkun: 'Asset',
    kategori: 'Aset Tetap',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '109',
    namaAkun: 'Kendaraan',
    tipeAkun: 'Asset',
    kategori: 'Aset Tetap',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '110',
    namaAkun: 'Peralatan Kantor',
    tipeAkun: 'Asset',
    kategori: 'Aset Tetap',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '111',
    namaAkun: 'Akumulasi Penyusutan Aktiva Tetap',
    tipeAkun: 'Asset',
    kategori: 'Akumulasi Penyusutan',
    isSystem: true,
    isContra: true,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== LIABILITY (Normal: Credit) =====
  {
    kodeAkun: '200',
    namaAkun: 'Hutang Usaha',
    tipeAkun: 'Liability',
    kategori: 'Hutang Lancar',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '201',
    namaAkun: 'Hutang Lancar',
    tipeAkun: 'Liability',
    kategori: 'Hutang Bank',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== EQUITY (Normal: Credit) =====
  {
    kodeAkun: '300',
    namaAkun: 'Setoran Modal Pemilik',
    tipeAkun: 'Equity',
    kategori: 'Modal',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '301',
    namaAkun: 'Modal Awal',
    tipeAkun: 'Equity',
    kategori: 'Modal',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '302',
    namaAkun: 'Laba (Rugi) Periode Sebelumnya',
    tipeAkun: 'Equity',
    kategori: 'Laba',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '303',
    namaAkun: 'Laba (Rugi) Periode Berjalan',
    tipeAkun: 'Equity',
    kategori: 'Laba',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '304',
    namaAkun: 'Prive',
    tipeAkun: 'Equity',
    kategori: 'Prive',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '3201',
    namaAkun: 'Ekuitas Saldo Awal',
    tipeAkun: 'Equity',
    kategori: 'Modal',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== REVENUE (Normal: Credit) =====
  {
    kodeAkun: '400',
    namaAkun: 'Penerimaan Dana Pendaftaran',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '401',
    namaAkun: 'Penerimaan Uang Gedung',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '402',
    namaAkun: 'Penerimaan Uang Kegiatan',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '403',
    namaAkun: 'Penerimaan Uang Seragam',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '404',
    namaAkun: 'Penerimaan Uang ATK',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '405',
    namaAkun: 'Penerimaan Uang SPP',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '406',
    namaAkun: 'Pendapatan Lain-Lain',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '407',
    namaAkun: 'Penerimaan piutang siswa',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },
  {
    kodeAkun: '408',
    namaAkun: 'Penerimaan Uang Hibah',
    tipeAkun: 'Revenue',
    kategori: 'Pendapatan',
    isSystem: true,
    isContra: false,
    normalBalance: 'kredit',
    saldo: 0,
  },

  // ===== EXPENSE (Normal: Debit) =====
  {
    kodeAkun: '500',
    namaAkun: 'Biaya Gaji',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '501',
    namaAkun: 'Biaya Tunjangan',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '502',
    namaAkun: 'Biaya ATK Kantor',
    tipeAkun: 'Expense',
    kategori: 'Beban Administrasi',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '503',
    namaAkun: 'Biaya UKS',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '504',
    namaAkun: 'Biaya Listrik, Internet dan Telepon',
    tipeAkun: 'Expense',
    kategori: 'Beban Utilitas',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '505',
    namaAkun: 'Biaya iuran - iuran',
    tipeAkun: 'Expense',
    kategori: 'Beban Lainnya',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '506',
    namaAkun: 'Biaya Kebersihan & Kemanan Kantor',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '507',
    namaAkun: 'Biaya bahan bakar',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '508',
    namaAkun: 'Biaya Admin bank',
    tipeAkun: 'Expense',
    kategori: 'Beban Administrasi',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '509',
    namaAkun: 'Biaya PPDB',
    tipeAkun: 'Expense',
    kategori: 'Beban Pemasaran',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '510',
    namaAkun: 'Biaya Konsumsi dan Rumah tangga',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '511',
    namaAkun: 'Evaluasi Pembelajaran',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '512',
    namaAkun: 'Biaya Kegiatan Kesiswaan',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '513',
    namaAkun: 'Biaya Peningkatan SDM',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '514',
    namaAkun: 'Biaya Parenting',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '515',
    namaAkun: 'Biaya learning kit',
    tipeAkun: 'Expense',
    kategori: 'Beban Pemasaran',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '516',
    namaAkun: 'Biaya sarana dan prasarana',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '517',
    namaAkun: 'Biaya sewa',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '518',
    namaAkun: 'Biaya Kunjungan Dinas',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '519',
    namaAkun: 'Biaya owner',
    tipeAkun: 'Expense',
    kategori: 'Beban Prive',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '520',
    namaAkun: 'Biaya Seragam Siswa',
    tipeAkun: 'Expense',
    kategori: 'Beban Persediaan',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '521',
    namaAkun: 'Biaya ATK Siswa',
    tipeAkun: 'Expense',
    kategori: 'Beban Persediaan',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '522',
    namaAkun: 'Biaya Gedung',
    tipeAkun: 'Expense',
    kategori: 'Beban Operasional',
    isSystem: true,
    isContra: false,
    normalBalance: 'debit',
    saldo: 0,
  },
  {
    kodeAkun: '600',
    namaAkun: 'Beban Penyusutan Aktiva Tetap',
    tipeAkun: 'Expense',
    kategori: 'Beban Penyusutan',
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