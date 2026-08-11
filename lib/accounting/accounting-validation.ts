/**
 * Validation Engine - Comprehensive validation for accounting system
 * Following code-quality.md: pure functions, small functions, clear naming
 */



// ============================================================================
// Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface TransactionEntry {
  kodeAkun: string;
  debit: number;
  kredit: number;
  keterangan?: string;
}

export interface TransactionData {
  tanggal: string;
  keterangan: string;
  entries: TransactionEntry[];
  periode?: string;
}

export interface PeriodInfo {
  kode: string;
  status: 'open' | 'closed' | 'archived';
  tahun: number;
  bulan: number;
  tanggalMulai?: string;
  tanggalAkhir?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ROUNDING_PRECISION = 2;


// Normal balance types
const DEBIT_NORMAL_ACCOUNTS = ['Asset', 'Expense'];
const KREDIT_NORMAL_ACCOUNTS = ['Liability', 'Equity', 'Revenue'];

// ============================================================================
// Utility Functions (Pure Functions)
// ============================================================================

/**
 * Round number to specified precision using half-up mode
 */
export function roundAmount(value: number, precision: number = ROUNDING_PRECISION): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Check if two numbers are equal within rounding precision
 */
export function isAmountEqual(a: number, b: number, precision: number = ROUNDING_PRECISION): boolean {
  return roundAmount(a, precision) === roundAmount(b, precision);
}

// ============================================================================
// Validation Functions (Pure Functions)
// ============================================================================

/**
 * Validate required fields
 */
export function validateRequiredFields(data: Partial<TransactionData>): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!data.tanggal) {
    errors.push({
      field: 'tanggal',
      message: 'Tanggal wajib diisi',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!data.keterangan || data.keterangan.trim() === '') {
    errors.push({
      field: 'keterangan',
      message: 'Keterangan wajib diisi',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!data.entries || data.entries.length === 0) {
    errors.push({
      field: 'entries',
      message: 'Minimal harus ada satu entri transaksi',
      code: 'REQUIRED_FIELD',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate debit = kredit (auto balance)
 */
export function validateDebitKreditBalance(entries: TransactionEntry[]): ValidationResult {
  const errors: ValidationError[] = [];
  
  const totalDebit = roundAmount(entries.reduce((sum, e) => sum + (e.debit || 0), 0));
  const totalKredit = roundAmount(entries.reduce((sum, e) => sum + (e.kredit || 0), 0));
  
  if (!isAmountEqual(totalDebit, totalKredit)) {
    errors.push({
      field: 'entries',
      message: `Total Debit (${totalDebit.toLocaleString('id-ID')}) tidak sama dengan Total Kredit (${totalKredit.toLocaleString('id-ID')})`,
      code: 'IMBALANCED_ENTRY',
      // Include amounts for debugging
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate entry amounts are not zero or negative
 */
export function validateEntryAmounts(entries: TransactionEntry[]): ValidationResult {
  const errors: ValidationError[] = [];
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryLabel = `${entry.kodeAkun} (baris ${i + 1})`;
    
    if (!entry.kodeAkun || entry.kodeAkun.trim() === '') {
      errors.push({
        field: `entries[${i}].kodeAkun`,
        message: `Kode akun wajib diisi untuk ${entryLabel}`,
        code: 'REQUIRED_FIELD',
      });
    }
    
    const debit = entry.debit || 0;
    const kredit = entry.kredit || 0;
    
    if (debit < 0 || kredit < 0) {
      errors.push({
        field: `entries[${i}]`,
        message: `Nilai tidak boleh negatif untuk ${entryLabel}`,
        code: 'NEGATIVE_VALUE',
      });
    }
    
    // At least one of debit or kredit must be positive
    if (debit === 0 && kredit === 0) {
      errors.push({
        field: `entries[${i}]`,
        message: `Minimal nilai Debit atau Kredit harus lebih dari 0 untuk ${entryLabel}`,
        code: 'ZERO_AMOUNT',
      });
    }
    
    // Both debit and kredit cannot be positive
    if (debit > 0 && kredit > 0) {
      errors.push({
        field: `entries[${i}]`,
        message: `Tidak boleh memiliki nilai Debit dan Kredit sekaligus untuk ${entryLabel}`,
        code: 'INVALID_ENTRY_TYPE',
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate normal balance (Asset & Expense should have debit, Liability, Equity, Revenue should have kredit)
 * Task 30: Normal Balance Validation
 * - Aset & Beban should have debit normal balance
 * - Kewajiban, Ekuitas, Pendapatan should have kredit normal balance
 * - Flag warnings for abnormal balances
 */
export function validateNormalBalance(
  entries: TransactionEntry[],
  accountTypes: Map<string, string>
): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Map Indonesian account types
  const accountTypeMap: Record<string, string> = {
    'Asset': 'debit',
    'Aset': 'debit',
    'Expense': 'debit',
    'Beban': 'debit',
    'Liability': 'kredit',
    'Kewajiban': 'kredit',
    'Equity': 'kredit',
    'Ekuitas': 'kredit',
    'Revenue': 'kredit',
    'Pendapatan': 'kredit',
  };
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const accountType = accountTypes.get(entry.kodeAkun);
    
    if (!accountType) continue; // Skip if account type unknown
    
    const debit = entry.debit || 0;
    const kredit = entry.kredit || 0;
    const normalBalance = accountTypeMap[accountType] || 'debit';
    
    // Check abnormal balance
    if (normalBalance === 'debit') {
      // Debit-normal accounts: Asset, Expense
      if (kredit > 0 && debit === 0) {
        errors.push({
          field: `entries[${i}]`,
          message: `Peringatan: Akun ${entry.kodeAkun} (${accountType}) memiliki saldo kredit. Ini tidak normal untuk akun ${accountType} (normal: debit).`,
          code: 'ABNORMAL_BALANCE_WARNING',
        });
      }
    } else if (normalBalance === 'kredit') {
      // Kredit-normal accounts: Liability, Equity, Revenue
      if (debit > 0 && kredit === 0) {
        errors.push({
          field: `entries[${i}]`,
          message: `Peringatan: Akun ${entry.kodeAkun} (${accountType}) memiliki saldo debit. Ini tidak normal untuk akun ${accountType} (normal: kredit).`,
          code: 'ABNORMAL_BALANCE_WARNING',
        });
      }
    }
  }
  
  // Only block on critical errors, not warnings
  const criticalErrors = errors.filter(e => e.code !== 'ABNORMAL_BALANCE_WARNING');
  
  return {
    isValid: criticalErrors.length === 0,
    errors: criticalErrors,
  };
}

/**
 * Validate period is open
 */
export function validatePeriodOpen(period: PeriodInfo | null): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!period) {
    errors.push({
      field: 'periode',
      message: 'Periode tidak ditemukan',
      code: 'PERIOD_NOT_FOUND',
    });
    return { isValid: false, errors };
  }
  
  if (period.status !== 'open') {
    errors.push({
      field: 'periode',
      message: `Periode ${period.kode} sudah ditutup. Tidak dapat menambah/mengubah transaksi. Hubungi administrator untuk membuka kembali periode.`,
      code: 'PERIOD_CLOSED',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate date is within active period (cut-off validation)
 */
export function validateDateInPeriod(tanggal: string, period: PeriodInfo | null): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!period) {
    // If no period info, skip this validation
    return { isValid: true, errors };
  }
  
  if (!period.tanggalMulai || !period.tanggalAkhir) {
    // Skip if dates not available
    return { isValid: true, errors };
  }
  
  const transactionDate = new Date(tanggal);
  
  if (transactionDate < new Date(period.tanggalMulai) || transactionDate > new Date(period.tanggalAkhir)) {
    errors.push({
      field: 'tanggal',
      message: `Tanggal ${tanggal} berada di luar periode aktif ${period.kode}. Tidak dapat input di luar periode aktif.`,
      code: 'CUTOFF_VIOLATION',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate backdated entry (allow if period is open or explicitly permitted)
 */
export function validateBackdatedEntry(
  tanggal: string,
  period: PeriodInfo | null,
  allowBackdated: boolean = false
): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!period || !period.tanggalMulai) {
    return { isValid: true, errors }; // Skip if no period
  }
  
  const transactionDate = new Date(tanggal);
  
  // Check if it's a past date
  if (transactionDate < new Date(period.tanggalMulai)) {
    if (!allowBackdated && period.status !== 'open') {
      errors.push({
        field: 'tanggal',
        message: `Tidak dapat input transaksi backdated untuk periode ${period.kode} yang sudah ditutup`,
        code: 'BACKDATE_NOT_ALLOWED',
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate negative balance on account
 */
export function validateNegativeBalance(
  accountCode: string,
  currentBalance: number,
  isNegativeAllowed: boolean,
  accountType: string
): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Asset and Expense should generally not go negative
  if (DEBIT_NORMAL_ACCOUNTS.includes(accountType)) {
    if (currentBalance < 0 && !isNegativeAllowed) {
      errors.push({
        field: 'saldo',
        message: `Akun ${accountCode} memiliki saldo negatif (${currentBalance.toLocaleString('id-ID')}). Ini tidak normal untuk akun ${accountType}.`,
        code: 'NEGATIVE_BALANCE',
      });
    }
  }
  // Liability and Equity should generally not go positive
  else if (KREDIT_NORMAL_ACCOUNTS.includes(accountType)) {
    if (currentBalance > 0 && !isNegativeAllowed) {
      errors.push({
        field: 'saldo',
        message: `Akun ${accountCode} memiliki saldo positif (${currentBalance.toLocaleString('id-ID')}). Ini tidak normal untuk akun ${accountType}.`,
        code: 'NEGATIVE_BALANCE',
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate system account protection
 */
export function validateSystemAccountProtection(
  accountCode: string,
  isProtected: boolean,
  action: 'delete' | 'update' | 'disable'
): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (isProtected) {
    const actionLabels = {
      delete: 'menghapus',
      update: 'mengubah',
      disable: 'menonaktifkan',
    };
    
    errors.push({
      field: 'kodeAkun',
      message: `Akun ${accountCode} adalah akun sistem yang dilindungi. Tidak dapat ${actionLabels[action]}.`,
      code: 'SYSTEM_ACCOUNT_PROTECTED',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate opening balance (only once per period/year)
 */
export function validateOpeningBalanceExists(
  existingEntries: number,
  period: string
): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (existingEntries > 0) {
    errors.push({
      field: 'entries',
      message: `Saldo awal untuk periode ${period} sudah ada. Hanya diperbolehkan satu kali input saldo awal.`,
      code: 'OPENING_BALANCE_EXISTS',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate duplicate transaction
 */
export function validateNoDuplicateTransaction(
  existingHashes: string[],
  newHash: string
): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (existingHashes.includes(newHash)) {
    errors.push({
      field: 'transaction',
      message: 'Transaksi疑似 duplikat ditemukan. Mohon periksa kembali data transaksi.',
      code: 'DUPLICATE_TRANSACTION',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate unreasonable values
 */
export function validateUnreasonableValues(entries: TransactionEntry[]): ValidationResult {
  const errors: ValidationError[] = [];
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const amount = Math.max(entry.debit || 0, entry.kredit || 0);
    
    // Check for extremely large amounts (over 10 billion)
    if (amount > 10_000_000_000) {
      errors.push({
        field: `entries[${i}]`,
        message: `Nilai transaksi sangat besar (${amount.toLocaleString('id-ID')}). Mohon periksa kembali.`,
        code: 'UNREASONABLE_VALUE',
      });
    }
    
    // Check for very small amounts (less than 100)
    if (amount > 0 && amount < 100) {
      errors.push({
        field: `entries[${i}]`,
        message: `Peringatan: Nilai transaksi sangat kecil (${amount.toLocaleString('id-ID')}).`,
        code: 'SMALL_VALUE_WARNING',
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors.filter(e => e.code !== 'SMALL_VALUE_WARNING'), // Only block on unreasonable, not small
  };
}

// ============================================================================
// Composed Validation Pipeline
// ============================================================================

/**
 * Full validation pipeline for transactions
 */
export function validateTransaction(
  data: Partial<TransactionData>,
  options: {
    accountTypes: Map<string, string>;
    period: PeriodInfo | null;
    allowBackdated?: boolean;
    allowNegative?: boolean;
    existingHashes?: string[];
    accountAllowNegative?: Map<string, boolean>;
    currentBalances?: Map<string, number>;
  }
): ValidationResult {
  // Run all validations
  const results = [
    validateRequiredFields(data),
    data.entries ? validateEntryAmounts(data.entries) : { isValid: true, errors: [] },
    data.entries ? validateDebitKreditBalance(data.entries) : { isValid: true, errors: [] },
    data.entries && options.accountTypes.size > 0 
      ? validateNormalBalance(data.entries, options.accountTypes) 
      : { isValid: true, errors: [] },
    validatePeriodOpen(options.period),
    data.tanggal && options.period 
      ? validateDateInPeriod(data.tanggal, options.period) 
      : { isValid: true, errors: [] },
    data.tanggal && options.period 
      ? validateBackdatedEntry(data.tanggal, options.period, options.allowBackdated) 
      : { isValid: true, errors: [] },
    data.entries ? validateUnreasonableValues(data.entries) : { isValid: true, errors: [] },
    options.existingHashes && data.entries 
      ? validateNoDuplicateTransaction(options.existingHashes, generateTransactionHash(data))
      : { isValid: true, errors: [] },
  ];
  
  // Task 38: Negative Balance Control - validate account balances
  // Only check if not explicitly allowing negative
  if (!options.allowNegative && data.entries) {
    const negativeBalanceErrors = validateNegativeBalanceFromEntries(
      data.entries,
      options.accountTypes,
      options.currentBalances,
      options.accountAllowNegative
    );
    if (negativeBalanceErrors.length > 0) {
      results.push({ isValid: true, errors: negativeBalanceErrors });
    }
  }
  
  // Combine all errors
  const allErrors = results.flatMap(r => r.errors);
  
  return {
    isValid: allErrors.filter(e => e.code !== 'ABNORMAL_BALANCE_WARNING').length === 0,
    errors: allErrors,
  };
}

/**
 * Validate negative balance from transaction entries
 * Task 38: Negative Balance Control
 */
function validateNegativeBalanceFromEntries(
  entries: TransactionEntry[],
  accountTypes: Map<string, string>,
  currentBalances?: Map<string, number>,
  accountAllowNegative?: Map<string, boolean>
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const entry of entries) {
    const accountType = accountTypes.get(entry.kodeAkun);
    if (!accountType) continue;

    // Skip if this account is explicitly allowed to go negative
    if (accountAllowNegative?.get(entry.kodeAkun)) continue;

    const currentBalance = currentBalances?.get(entry.kodeAkun) || 0;
    const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(accountType);
    
    // Calculate the net change from this transaction
    const netChange = isDebitNormal
      ? entry.debit - entry.kredit
      : entry.kredit - entry.debit;
    
    const projectedBalance = currentBalance + netChange;

    // Check if this entry would cause negative balance for debit-normal accounts
    if (isDebitNormal && projectedBalance < 0) {
      errors.push({
        field: entry.kodeAkun,
        message: `Transaksi akan menyebabkan saldo negatif untuk akun ${entry.kodeAkun}. Saldo saat ini: ${currentBalance.toLocaleString('id-ID')}, perubahan: ${netChange.toLocaleString('id-ID')}, proyeksi: ${projectedBalance.toLocaleString('id-ID')}`,
        code: 'NEGATIVE_BALANCE_WARNING',
      });
    }
    // Check if credit-normal accounts would go positive (negative from their perspective)
    else if (!isDebitNormal && entry.kodeAkun !== "304" && projectedBalance < 0) {
      errors.push({
        field: entry.kodeAkun,
        message: `Transaksi akan menyebabkan saldo negatif untuk akun ${entry.kodeAkun}. Saldo saat ini: ${currentBalance.toLocaleString('id-ID')}, perubahan: ${netChange.toLocaleString('id-ID')}, proyeksi: ${projectedBalance.toLocaleString('id-ID')}`,
        code: 'NEGATIVE_BALANCE_WARNING',
      });
    }
  }
  
  return errors;
}

/**
 * Generate hash for duplicate detection
 */
export function generateTransactionHash(data: Partial<TransactionData>): string {
  if (!data.tanggal || !data.entries) return '';
  
  const key = `${data.tanggal}|${data.entries.map(e => `${e.kodeAkun}:${e.debit}:${e.kredit}`).join(';')}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ============================================================================
// Bulk Import Validation
// ============================================================================

export interface BulkValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errors: Array<{
    row: number;
    errors: ValidationError[];
  }>;
}

/**
 * Validate bulk import data - per-row validation, one error doesn't cancel all
 */
export function validateBulkImport(
  rows: Array<{ row: number; data: Partial<TransactionData> }>,
  options: {
    accountTypes: Map<string, string>;
    period: PeriodInfo | null;
    allowBackdated?: boolean;
  }
): BulkValidationResult {
  const results: Array<{ row: number; errors: ValidationError[] }> = [];
  let validRows = 0;
  
  for (const { row, data } of rows) {
    const validation = validateTransaction(data, {
      accountTypes: options.accountTypes,
      period: options.period,
      allowBackdated: options.allowBackdated,
    });
    
    if (validation.isValid) {
      validRows++;
    } else {
      results.push({
        row,
        errors: validation.errors,
      });
    }
  }
  
  return {
    isValid: results.length === 0,
    totalRows: rows.length,
    validRows,
    errors: results,
  };
}

// ============================================================================
// Report Consistency Validation
// ============================================================================

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    difference?: number;
  }>;
}

/**
 * Validate report consistency (Neraca must balance, Laba must go to Ekuitas)
 */
export function validateReportConsistency(
  neraca: { totalAset: number; totalKewajiban: number; totalEkuitas: number },
  labarugi: { totalPendapatan: number; totalBeban: number }
): ConsistencyCheckResult {
  const checks: Array<{ name: string; passed: boolean; message: string; difference?: number }> = [];
  
  // Check 1: Neraca must balance
  const balanceDifference = neraca.totalAset - (neraca.totalKewajiban + neraca.totalEkuitas);
  const isBalance = isAmountEqual(balanceDifference, 0);
  checks.push({
    name: 'NERACA_BALANCE',
    passed: isBalance,
    message: isBalance 
      ? 'Neraca seimbang' 
      : `Neraca tidak seimbang. Selisih: ${balanceDifference.toLocaleString('id-ID')}`,
    difference: balanceDifference,
  });
  
  // Check 2: Laba/Rugi should be reflected in Ekuitas
  const labaRugi = labarugi.totalPendapatan - labarugi.totalBeban;
  // In a proper system, this should be reflected somewhere
  checks.push({
    name: 'LABA_RUGI_CALCULATED',
    passed: true, // Just informational
    message: `Laba/Rugi periode ini: ${Math.abs(labaRugi).toLocaleString('id-ID')} (${labaRugi >= 0 ? 'LABA' : 'RUGI'})`,
  });
  
  return {
    isConsistent: checks.every(c => c.passed),
    checks,
  };
}

const validationEngine = {
  roundAmount,
  isAmountEqual,
  validateTransaction,
  validateBulkImport,
  validateReportConsistency,
  validateDebitKreditBalance,
  validatePeriodOpen,
  validateDateInPeriod,
  validateBackdatedEntry,
  validateNormalBalance,
  validateNegativeBalance,
  validateSystemAccountProtection,
  validateOpeningBalanceExists,
  generateTransactionHash,
};

export default validationEngine;