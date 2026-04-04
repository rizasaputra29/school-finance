/**
 * Smart Validation - Detect duplicates, unreasonable values, invalid inputs
 * Task 39: Smart Validation
 */

import { roundAmount } from '@/lib/accounting/validation';
import prisma from '@/lib/prisma';

// ============================================================================
// Types
// ============================================================================

export interface SmartValidationResult {
  isValid: boolean;
  warnings: SmartWarning[];
  errors: SmartError[];
}

export interface SmartWarning {
  type: 'DUPLICATE' | 'UNREASONABLE' | 'SUSPICIOUS';
  field: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SmartError {
  type: 'INVALID_FORMAT' | 'INVALID_DATE' | 'INVALID_ACCOUNT' | 'INVALID_AMOUNT';
  field: string;
  message: string;
}

export interface DuplicateCheckOptions {
  includeKeterangan?: boolean;
  lookbackDays?: number;
  excludeIds?: string[];
}

export interface ExistingTransaction {
  id: string;
  reference: string | null;
  tanggal: Date;
  keterangan: string | null;
  entries: Array<{
    id: string;
    kodeAkun: string;
    debit: number;
    kredit: number;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_REASONABLE_AMOUNT = 10_000_000_000; // 10 billion
const MIN_SUSPICIOUS_AMOUNT = 100; // Very small amounts might be errors

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Check for potential duplicate transactions
 * Compares: date, amounts, and accounts
 */
export async function checkDuplicateTransaction(
  entries: Array<{ kodeAkun: string; debit: number; kredit: number }>,
  tanggal: string,
  options: DuplicateCheckOptions = {}
): Promise<{ isDuplicate: boolean; existingTransactions?: ExistingTransaction[] }> {
  const { lookbackDays = 7, excludeIds = [] } = options;

  const startDate = new Date(tanggal);
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Get all journal entries in the lookback period
  const recentJournals = await prisma.journalEntry.findMany({
    where: {
      tanggal: {
        gte: startDate,
        lte: new Date(tanggal),
      },
      status: { in: ['approved', 'posted'] },
      id: { notIn: excludeIds },
    },
    include: {
      entries: true,
    },
  });

  // Create signature for new transaction
  const newSignature = createTransactionSignature(entries);

  // Compare with existing transactions
  for (const journal of recentJournals) {
    const existingSignature = createTransactionSignature(
      journal.entries.map(e => ({
        kodeAkun: e.kodeAkun,
        debit: e.debit,
        kredit: e.kredit,
      }))
    );

    if (newSignature === existingSignature) {
      return {
        isDuplicate: true,
        existingTransactions: [
          {
            id: journal.id,
            reference: journal.reference,
            tanggal: journal.tanggal,
            keterangan: journal.keterangan,
            entries: journal.entries,
          },
        ],
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Create a signature for transaction comparison
 */
function createTransactionSignature(
  entries: Array<{ kodeAkun: string; debit: number; kredit: number }>
): string {
  // Sort by account code for consistent comparison
  const sorted = [...entries].sort((a, b) => a.kodeAkun.localeCompare(b.kodeAkun));
  
  // Create signature string
  return sorted
    .map(e => `${e.kodeAkun}:${roundAmount(e.debit)}:${roundAmount(e.kredit)}`)
    .join('|');
}

// ============================================================================
// Unreasonable Value Detection
// ============================================================================

/**
 * Check for unreasonable transaction values
 */
export function detectUnreasonableValues(
  entries: Array<{ kodeAkun: string; debit: number; kredit: number; keterangan?: string }>
): SmartWarning[] {
  const warnings: SmartWarning[] = [];

  for (const entry of entries) {
    const amount = Math.max(entry.debit || 0, entry.kredit || 0);
    const roundedAmount = roundAmount(amount);

    // Check for extremely large amounts
    if (roundedAmount > MAX_REASONABLE_AMOUNT) {
      warnings.push({
        type: 'UNREASONABLE',
        field: `entries.${entry.kodeAkun}`,
        message: `Nilai transaksi sangat besar (${roundedAmount.toLocaleString('id-ID')}). Mohon periksa kembali.`,
        severity: 'high',
      });
    }

    // Check for suspiciously small amounts
    if (roundedAmount > 0 && roundedAmount < MIN_SUSPICIOUS_AMOUNT) {
      warnings.push({
        type: 'SUSPICIOUS',
        field: `entries.${entry.kodeAkun}`,
        message: `Nilai transaksi sangat kecil (${roundedAmount.toLocaleString('id-ID')}). Apakah ini disengaja?`,
        severity: 'low',
      });
    }

    // Check for round numbers that might be errors (e.g., exactly 1,000,000)
    if (roundedAmount > 100000 && roundedAmount % 100000 === 0 && roundedAmount % 1000000 !== 0) {
      warnings.push({
        type: 'SUSPICIOUS',
        field: `entries.${entry.kodeAkun}`,
        message: `Nilai ini adalah angka bulat (${roundedAmount.toLocaleString('id-ID')}). Pastikan ini bukan kesalahan input.`,
        severity: 'medium',
      });
    }
  }

  return warnings;
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate transaction input format and values
 */
export function validateTransactionInput(data: {
  tanggal?: string;
  keterangan?: string;
  entries?: Array<{ kodeAkun?: string; debit?: number; kredit?: number }>;
}): SmartValidationResult {
  const errors: SmartError[] = [];
  const warnings: SmartWarning[] = [];

  // Validate date format
  if (data.tanggal) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.tanggal)) {
      errors.push({
        type: 'INVALID_DATE',
        field: 'tanggal',
        message: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD',
      });
    } else {
      const parsed = new Date(data.tanggal);
      if (isNaN(parsed.getTime())) {
        errors.push({
          type: 'INVALID_DATE',
          field: 'tanggal',
          message: 'Tanggal tidak valid',
        });
      }

      // Check for future dates
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsed > today) {
        warnings.push({
          type: 'SUSPICIOUS',
          field: 'tanggal',
          message: 'Tanggal transaksi di masa depan',
          severity: 'medium',
        });
      }
    }
  }

  // Validate keterangan
  if (data.keterangan) {
    if (data.keterangan.length < 3) {
      errors.push({
        type: 'INVALID_FORMAT',
        field: 'keterangan',
        message: 'Keterangan terlalu pendek',
      });
    }

    if (data.keterangan.length > 500) {
      errors.push({
        type: 'INVALID_FORMAT',
        field: 'keterangan',
        message: 'Keterangan terlalu panjang (maksimal 500 karakter)',
      });
    }

    // Check for suspicious patterns in keterangan
    const suspiciousPatterns = [
      /^\s+$/, // Only whitespace
      /^test/i, // Starts with "test"
      /[0-9]{10,}/, // Very long number sequences
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(data.keterangan)) {
        warnings.push({
          type: 'SUSPICIOUS',
          field: 'keterangan',
          message: 'Keterangan mencurigakan, mohon periksa',
          severity: 'low',
        });
      }
    }
  }

  // Validate entries
  if (data.entries && data.entries.length > 0) {
    // Check minimum entries (need at least 2 for double-entry)
    if (data.entries.length < 2) {
      errors.push({
        type: 'INVALID_FORMAT',
        field: 'entries',
        message: 'Minimal harus ada 2 entri untuk sistem double-entry',
      });
    }

    // Check for duplicate account codes
    const accountCodes = data.entries.map(e => e.kodeAkun);
    const uniqueCodes = new Set(accountCodes);
    
    if (accountCodes.length !== uniqueCodes.size) {
      const duplicates = accountCodes.filter((code, index) => 
        accountCodes.indexOf(code) !== index
      );
      warnings.push({
        type: 'SUSPICIOUS',
        field: 'entries',
        message: `Akun duplikat ditemukan: ${[...new Set(duplicates)].join(', ')}`,
        severity: 'medium',
      });
    }

    // Validate each entry
    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];

      if (!entry.kodeAkun) {
        errors.push({
          type: 'INVALID_ACCOUNT',
          field: `entries[${i}].kodeAkun`,
          message: `Kode akun wajib diisi`,
        });
      }

      // Validate amounts
      const debit = entry.debit ?? 0;
      const kredit = entry.kredit ?? 0;

      if (debit < 0 || kredit < 0) {
        errors.push({
          type: 'INVALID_AMOUNT',
          field: `entries[${i}]`,
          message: 'Nilai tidak boleh negatif',
        });
      }

      if (debit > 0 && kredit > 0) {
        errors.push({
          type: 'INVALID_AMOUNT',
          field: `entries[${i}]`,
          message: 'Tidak boleh memiliki nilai Debit dan Kredit sekaligus',
        });
      }

      if (debit === 0 && kredit === 0) {
        errors.push({
          type: 'INVALID_AMOUNT',
          field: `entries[${i}]`,
          message: 'Minimal nilai Debit atau Kredit harus lebih dari 0',
        });
      }
    }
  } else {
    errors.push({
      type: 'INVALID_FORMAT',
      field: 'entries',
      message: 'Entri transaksi wajib diisi',
    });
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

// ============================================================================
// Comprehensive Smart Validation
// ============================================================================

/**
 * Run comprehensive smart validation on transaction data
 */
export async function smartValidateTransaction(
  data: {
    tanggal: string;
    keterangan: string;
    entries: Array<{ kodeAkun: string; debit: number; kredit: number; keterangan?: string }>;
  },
  options: {
    checkDuplicates?: boolean;
    excludeIds?: string[];
  } = {}
): Promise<SmartValidationResult> {
  const { checkDuplicates = true, excludeIds = [] } = options;

  // Step 1: Input validation
  const inputValidation = validateTransactionInput(data);

  if (!inputValidation.isValid) {
    return inputValidation;
  }

  // Step 2: Unreasonable values detection
  const unreasonableWarnings = detectUnreasonableValues(data.entries);

  // Step 3: Duplicate check (if enabled)
  let duplicateWarning: SmartWarning | null = null;
  
  if (checkDuplicates) {
    const duplicateResult = await checkDuplicateTransaction(
      data.entries,
      data.tanggal,
      { excludeIds }
    );

    if (duplicateResult.isDuplicate && duplicateResult.existingTransactions) {
      const existing = duplicateResult.existingTransactions[0];
      duplicateWarning = {
        type: 'DUPLICATE',
        field: 'transaction',
        message: `Transaksi疑似 duplikat dengan ${existing.reference} pada ${new Date(existing.tanggal).toLocaleDateString('id-ID')}`,
        severity: 'high',
      };
    }
  }

  // Combine all results
  const allWarnings = [
    ...inputValidation.warnings,
    ...unreasonableWarnings,
    ...(duplicateWarning ? [duplicateWarning] : []),
  ];

  // Filter to only errors (not warnings) for isValid check
  const criticalErrors = inputValidation.errors.filter(e => 
    e.type !== 'INVALID_FORMAT' || e.field !== 'entries'
  );

  return {
    isValid: criticalErrors.length === 0,
    warnings: allWarnings,
    errors: inputValidation.errors,
  };
}

// ============================================================================
// Batch Smart Validation
// ============================================================================

/**
 * Run smart validation on multiple transactions
 */
export async function smartValidateBatch(
  transactions: Array<{
    id?: string;
    tanggal: string;
    keterangan: string;
    entries: Array<{ kodeAkun: string; debit: number; kredit: number }>;
  }>
): Promise<{
  valid: number;
  invalid: number;
  results: Array<{
    id?: string;
    status: 'valid' | 'invalid' | 'warning';
    result: SmartValidationResult;
  }>;
}> {
  const results: Array<{
    id?: string;
    status: 'valid' | 'invalid' | 'warning';
    result: SmartValidationResult;
  }> = [];

  let valid = 0;
  let invalid = 0;

  for (const tx of transactions) {
    const result = await smartValidateTransaction(tx, {
      excludeIds: tx.id ? [tx.id] : [],
    });

    let status: 'valid' | 'invalid' | 'warning' = 'valid';
    
    if (!result.isValid) {
      status = 'invalid';
      invalid++;
    } else if (result.warnings.length > 0) {
      status = 'warning';
      valid++;
    } else {
      valid++;
    }

    results.push({
      id: tx.id,
      status,
      result,
    });
  }

  return { valid, invalid, results };
}

const smartValidationService = {
  checkDuplicateTransaction,
  detectUnreasonableValues,
  validateTransactionInput,
  smartValidateTransaction,
  smartValidateBatch,
};

export default smartValidationService;