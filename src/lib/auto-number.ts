/**
 * Auto Numbering - Automatic journal number generation
 * Task 40: Auto Numbering & Consistency Check
 * Format: JNL-YYYY-XXXX
 */

import prisma from '@/lib/prisma';

/**
 * Generate journal number in format: JNL-YYYY-XXXX
 */
export async function generateJournalNumber(): Promise<string> {
  const tahun = new Date().getFullYear();
  const prefix = `JNL-${tahun}-`;
  
  // Get latest journal for this year
  const latest = await prisma.journalEntry.findFirst({
    where: {
      reference: { startsWith: prefix },
    },
    orderBy: { reference: 'desc' },
  });
  
  let sequence = 1;
  if (latest && latest.reference) {
    const parts = latest.reference.split('-');
    const lastSeq = parseInt(parts[2] || '0', 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate cashflow number in format: CF-YYYYMMDD-XXXX
 */
export async function generateCashflowNumber(tanggal: Date): Promise<string> {
  const year = tanggal.getFullYear();
  const month = String(tanggal.getMonth() + 1).padStart(2, '0');
  const day = String(tanggal.getDate()).padStart(2, '0');
  const prefix = `CF-${year}${month}${day}-`;
  
  // Get latest cashflow for this date
  const latest = await prisma.cashflow.findFirst({
    where: {
      referenceId: { startsWith: prefix },
    },
    orderBy: { referenceId: 'desc' },
  });
  
  let sequence = 1;
  if (latest && latest.referenceId) {
    const parts = latest.referenceId.split('-');
    const lastSeq = parseInt(parts[2] || '0', 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate billing number in format: INV-YYYYMM-XXXX
 */
export async function generateBillingNumber(periode: string): Promise<string> {
  const prefix = `INV-${periode.replace('-', '')}-`;
  
  // Get latest billing for this period
  const latest = await prisma.billing.findFirst({
    where: {
      id: { startsWith: prefix },
    },
    orderBy: { id: 'desc' },
  });
  
  let sequence = 1;
  if (latest) {
    const parts = latest.id.split('-');
    const lastSeq = parseInt(parts[2] || '0', 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate account code based on type and existing codes
 * Asset: 1xxx, Liability: 2xxx, Equity: 3xxx, Revenue: 4xxx, Expense: 5xxx
 */
export async function generateAccountCode(tipeAkun: string): Promise<string> {
  const typePrefix: Record<string, string> = {
    'Asset': '1',
    'Liability': '2',
    'Equity': '3',
    'Revenue': '4',
    'Expense': '5',
  };
  
  const prefix = typePrefix[tipeAkun] || '1';
  
  // Get existing codes with this prefix
  const existingAccounts = await prisma.account.findMany({
    where: {
      kodeAkun: { startsWith: prefix },
    },
    orderBy: { kodeAkun: 'desc' },
  });
  
  let sequence = 1;
  if (existingAccounts.length > 0) {
    const lastCode = existingAccounts[0].kodeAkun;
    const lastSeq = parseInt(lastCode.substring(1), 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${sequence.toString().padStart(3, '0')}`;
}

/**
 * Validate journal number format
 */
export function validateJournalNumberFormat(reference: string): boolean {
  const regex = /^JNL-\d{4}-\d{4}$/;
  return regex.test(reference);
}

/**
 * Parse journal number to get year and sequence
 */
export function parseJournalNumber(reference: string): { tahun: number; sequence: number } | null {
  if (!validateJournalNumberFormat(reference)) {
    return null;
  }
  
  const parts = reference.split('-');
  const tahun = parseInt(parts[1], 10);
  const sequence = parseInt(parts[2], 10);
  
  return { tahun, sequence };
}

/**
 * Get next journal sequence for a given year
 */
export async function getNextJournalSequence(tahun: number): Promise<number> {
  const prefix = `JNL-${tahun}-`;
  
  const latest = await prisma.journalEntry.findFirst({
    where: {
      reference: { startsWith: prefix },
    },
    orderBy: { reference: 'desc' },
  });
  
  if (!latest || !latest.reference) {
    return 1;
  }
  
  const parts = latest.reference.split('-');
  return (parseInt(parts[2], 10) || 0) + 1;
}

/**
 * Check if journal number exists
 */
export async function isJournalNumberExists(reference: string): Promise<boolean> {
  const existing = await prisma.journalEntry.findUnique({
    where: { reference },
  });
  return !!existing;
}

const autoNumberService = {
  generateJournalNumber,
  generateCashflowNumber,
  generateBillingNumber,
  generateAccountCode,
  validateJournalNumberFormat,
  parseJournalNumber,
  getNextJournalSequence,
  isJournalNumberExists,
};

export default autoNumberService;