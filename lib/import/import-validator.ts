/**
 * Import Validator - CSV/Excel validation with batch processing
 * Validates column mapping, data types, required fields, and format
 */

import type { PrismaClient } from '@prisma/client';
import { parseExcelDate } from '@/lib/utils/utils-date';

// ============================================
// Type Definitions
// ============================================

export interface ValidationError {
  row: number;
  sheet: string;
  field?: string;
  error: string;
  value?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  validatedData: ValidatedRow[];
}

export interface ValidatedRow {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
}

export interface BatchProgress {
  processed: number;
  total: number;
  percentage: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{ row: number; error: string }>;
}

export interface ImportResults {
  accounts: ImportResult;
  students: ImportResult;
  cashflow: ImportResult;
  billings: ImportResult;
}

export interface ColumnMapping {
  [sourceColumn: string]: string;
}

export interface FieldValidation {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'boolean';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: unknown, row: Record<string, unknown>) => string | null;
}

export interface SheetConfig {
  sheetName: string;
  columnMapping: ColumnMapping;
  fieldValidations: FieldValidation[];
  uniqueField?: string;
  uniqueFieldName?: string;
}

// ============================================
// Pure Validation Functions
// ============================================

/**
 * Validate a single field against its rules
 */
export function validateField(
  value: unknown,
  fieldConfig: FieldValidation,
  rowData: Record<string, unknown>
): string | null {
  // Required check
  if (fieldConfig.required) {
    if (value === undefined || value === null || value === '') {
      return `${fieldConfig.field} wajib diisi`;
    }
  }

  // Skip further validation if empty and not required
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // Type validation
  if (fieldConfig.type) {
    const typeError = validateType(value, fieldConfig.type, fieldConfig.field);
    if (typeError) return typeError;
  }

  // String length validation
  if (typeof value === 'string') {
    if (fieldConfig.minLength !== undefined && value.length < fieldConfig.minLength) {
      return `${fieldConfig.field} minimal ${fieldConfig.minLength} karakter`;
    }
    if (fieldConfig.maxLength !== undefined && value.length > fieldConfig.maxLength) {
      return `${fieldConfig.field} maksimal ${fieldConfig.maxLength} karakter`;
    }
    if (fieldConfig.pattern && !fieldConfig.pattern.test(value)) {
      return `${fieldConfig.field} format tidak valid`;
    }
  }

  // Number range validation
  if (typeof value === 'number') {
    if (fieldConfig.min !== undefined && value < fieldConfig.min) {
      return `${fieldConfig.field} minimal ${fieldConfig.min}`;
    }
    if (fieldConfig.max !== undefined && value > fieldConfig.max) {
      return `${fieldConfig.field} maksimal ${fieldConfig.max}`;
    }
  }

  // Custom validation
  if (fieldConfig.custom) {
    return fieldConfig.custom(value, rowData);
  }

  return null;
}

/**
 * Validate value type
 */
function validateType(
  value: unknown,
  expectedType: 'string' | 'number' | 'date' | 'boolean',
  fieldName: string
): string | null {
  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string' && typeof value !== 'number') {
        return `${fieldName} harus berupa teks`;
      }
      break;
    case 'number':
      if (typeof value !== 'number' && isNaN(Number(value))) {
        return `${fieldName} harus berupa angka`;
      }
      break;
    case 'date':
      if (!isValidDate(value)) {
        return `${fieldName} harus berupa tanggal yang valid`;
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean' && !isValidBoolean(value)) {
        return `${fieldName} harus berupa benar/salah`;
      }
      break;
  }
  return null;
}

/**
 * Check if value is a valid date
 */
function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  return false;
}

/**
 * Check if value can be converted to boolean
 */
function isValidBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return ['true', 'false', '1', '0', 'yes', 'no'].includes(lower);
  }
  return false;
}

/**
 * Validate a single row against all field configurations
 */
export function validateRow(
  row: Record<string, unknown>,
  rowNum: number,
  sheetConfig: SheetConfig
): ValidatedRow {
  const errors: string[] = [];
  const mappedData: Record<string, unknown> = {};

  // Apply column mapping and validate each field
  for (const fieldConfig of sheetConfig.fieldValidations) {
    // Find source column for this field
    const sourceColumn = Object.entries(sheetConfig.columnMapping).find(
      ([, target]) => target === fieldConfig.field
    )?.[0];

    if (!sourceColumn) continue;

    // Get value from row (try both original and mapped column names)
    const value = row[sourceColumn] ?? row[fieldConfig.field];

    // Validate the field
    const fieldError = validateField(value, fieldConfig, row);
    if (fieldError) {
      errors.push(fieldError);
    }

    // Store mapped value
    mappedData[fieldConfig.field] = value;
  }

  return {
    row: rowNum,
    data: mappedData,
    errors,
  };
}

/**
 * Validate entire dataset with column mapping
 */
export function validateDataset(
  data: Record<string, unknown>[],
  sheetConfig: SheetConfig
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const validatedData: ValidatedRow[] = [];
  const seen = new Set<unknown>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2; // Excel rows start at 1, header at row 1, data at row 2

    const validatedRow = validateRow(row, rowNum, sheetConfig);

    // Check for duplicates if unique field configured
    if (sheetConfig.uniqueField && validatedRow.data[sheetConfig.uniqueField]) {
      const uniqueValue = validatedRow.data[sheetConfig.uniqueField];
      if (seen.has(uniqueValue)) {
        validatedRow.errors.push(
          `${sheetConfig.uniqueFieldName || sheetConfig.uniqueField} duplikat: ${uniqueValue}`
        );
      } else {
        seen.add(uniqueValue);
      }
    }

    // Add errors
    for (const error of validatedRow.errors) {
      errors.push({
        row: rowNum,
        sheet: sheetConfig.sheetName,
        error,
      });
    }

    // Only include valid or partially valid rows
    const uniqueFieldValue = sheetConfig.uniqueField ? validatedRow.data[sheetConfig.uniqueField] : null;
    if (validatedRow.errors.length === 0 || uniqueFieldValue) {
      validatedData.push(validatedRow);
    }
  }

  return {
    isValid: errors.filter(e => e.error.includes('wajib')).length === 0,
    errors,
    warnings,
    validatedData,
  };
}

// ============================================
// Sheet Configurations
// ============================================

export const SHEET_CONFIGS: Record<string, SheetConfig> = {
  accounts: {
    sheetName: 'Akun',
    columnMapping: {
      'Kode Akun': 'kodeAkun',
      'Nama Akun': 'namaAkun',
      'Tipe Akun': 'tipeAkun',
      'Saldo': 'saldo',
    },
    fieldValidations: [
      { field: 'kodeAkun', required: true, type: 'string', minLength: 1, maxLength: 20 },
      { field: 'namaAkun', required: true, type: 'string', minLength: 1, maxLength: 100 },
      { field: 'tipeAkun', type: 'string' },
      { field: 'saldo', type: 'number' },
    ],
    uniqueField: 'kodeAkun',
    uniqueFieldName: 'Kode Akun',
  },
  students: {
    sheetName: 'Data Siswa',
    columnMapping: {
      'NIS': 'nis',
      'Nama': 'nama',
      'Kelas': 'kelas',
      'Tahun Masuk': 'tahunMasuk',
      'Status Bayar': 'statusBayar',
      'Total Tagihan': 'totalTagihan',
      'Total Bayar': 'totalBayar',
    },
    fieldValidations: [
      { field: 'nis', required: true, type: 'string', minLength: 1, maxLength: 50 },
      { field: 'nama', required: true, type: 'string', minLength: 1, maxLength: 100 },
      { field: 'kelas', type: 'string', maxLength: 20 },
      { field: 'tahunMasuk', type: 'number', min: 2000, max: 2100 },
      { field: 'statusBayar', type: 'string' },
      { field: 'totalTagihan', type: 'number', min: 0 },
      { field: 'totalBayar', type: 'number', min: 0 },
    ],
    uniqueField: 'nis',
    uniqueFieldName: 'NIS',
  },
  cashflow: {
    sheetName: 'Cashflow',
    columnMapping: {
      'Tanggal': 'tanggal',
      'Keterangan': 'keterangan',
      'Kode Akun': 'kodeAkun',
      'Debit': 'debit',
      'Kredit': 'kredit',
    },
    fieldValidations: [
      { field: 'tanggal', required: true, type: 'date' },
      { field: 'keterangan', type: 'string', maxLength: 500 },
      { field: 'kodeAkun', required: true, type: 'string', minLength: 1, maxLength: 20 },
      { field: 'debit', type: 'number', min: 0 },
      { field: 'kredit', type: 'number', min: 0 },
    ],
  },
  billings: {
    sheetName: 'Biaya Siswa',
    columnMapping: {
      'NIS': 'nis',
      'Jenis Biaya': 'jenisBiaya',
      'Jumlah': 'jumlah',
      'Periode Bulan': 'periodeBulan',
      'Status Bayar': 'statusBayar',
      'Tanggal Bayar': 'tanggalBayar',
    },
    fieldValidations: [
      { field: 'nis', required: true, type: 'string', minLength: 1, maxLength: 50 },
      { field: 'jenisBiaya', required: true, type: 'string', minLength: 1, maxLength: 100 },
      { field: 'jumlah', required: true, type: 'number', min: 0 },
      { field: 'periodeBulan', type: 'string', maxLength: 20 },
      { field: 'statusBayar', type: 'string' },
      { field: 'tanggalBayar', type: 'date' },
    ],
  },
};

// ============================================
// Batch Processing
// ============================================

/**
 * Process data in batches
 */
export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  onProgress?: (progress: BatchProgress) => void
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);

    if (onProgress) {
      onProgress({
        processed: Math.min(i + batchSize, total),
        total,
        percentage: Math.round(((i + batchSize) / total) * 100),
      });
    }
  }

  return results;
}

/**
 * Default batch processor - processes each item individually
 */
export async function defaultBatchProcessor<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  return Promise.all(items.map(processor));
}

// ============================================
// Duplicate Detection
// ============================================

/**
 * Check for duplicates in database
 */
export async function checkDuplicateInDB(
  prisma: PrismaClient,
  model: 'account' | 'student' | 'cashflow',
  field: string,
  value: string
): Promise<boolean> {
  if (!field || !value) return false;

  switch (model) {
    case 'account':
      return (await prisma.account.findUnique({ where: { kodeAkun: value } })) !== null;
    case 'student':
      return (await prisma.student.findUnique({ where: { nis: value } })) !== null;
    case 'cashflow':
      return (await prisma.cashflow.findUnique({ where: { id: value } })) !== null;
    default:
      return false;
  }
}

/**
 * Find duplicate cashflow transaction
 */
export async function findDuplicateCashflow(
  prisma: PrismaClient,
  data: {
    tanggal: Date;
    kodeAkun: string;
    debit: number;
    kredit: number;
    keterangan: string;
  }
): Promise<string | null> {
  const startOfDay = new Date(data.tanggal);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(data.tanggal);
  endOfDay.setHours(23, 59, 59, 999);

  const existing = await prisma.cashflow.findFirst({
    where: {
      kodeAkun: data.kodeAkun,
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
      OR: [
        { debit: data.debit, kredit: data.kredit },
      ],
      keterangan: { equals: data.keterangan, mode: 'insensitive' },
    },
    select: { id: true },
  });

  return existing?.id || null;
}

// ============================================
// Transaction Rollback Support
// ============================================

/**
 * Create import transaction with rollback capability
 */
export async function runWithTransaction<T>(
  prisma: PrismaClient,
  operation: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const result = await prisma.$transaction(operation);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction failed',
    };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse value to appropriate type
 */
export function parseValue(value: unknown, type: string): unknown {
  if (value === undefined || value === null || value === '') return null;

  switch (type) {
    case 'number':
      return parseFloat(String(value)) || 0;
    case 'string':
      return String(value);
    case 'date':
      if (value instanceof Date) return value;
      if (typeof value === 'number') return parseExcelDate(value);
      return new Date(String(value));
    default:
      return value;
  }
}

/**
 * Build error response format
 */
export function buildErrorResponse(
  errors: ValidationError[]
): Array<{ row: number; sheet: string; error: string }> {
  return errors.map(e => ({
    row: e.row,
    sheet: e.sheet,
    error: e.error,
  }));
}

/**
 * Build import results summary
 */
export function buildResultsSummary(results: ImportResults): {
  accounts: { inserted: number; updated: number; errors: number };
  students: { inserted: number; updated: number; errors: number };
  cashflow: { inserted: number; skipped: number; errors: number };
  billings: { inserted: number; errors: number };
} {
  return {
    accounts: {
      inserted: results.accounts.inserted,
      updated: results.accounts.updated,
      errors: results.accounts.errors,
    },
    students: {
      inserted: results.students.inserted,
      updated: results.students.updated,
      errors: results.students.errors,
    },
    cashflow: {
      inserted: results.cashflow.inserted,
      skipped: results.cashflow.skipped,
      errors: results.cashflow.errors,
    },
    billings: {
      inserted: results.billings.inserted,
      errors: results.billings.errors,
    },
  };
}
