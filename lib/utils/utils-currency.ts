/**
 * Currency utilities for Indonesian Rupiah.
 *
 * Provides formatting, parsing, and conversion functions for
 * Indonesian currency. Includes support for compact formats
 * and terbilang (number to words conversion).
 *
 * @example
 * ```typescript
 * import { formatRupiah, formatCompact, toWords } from '@/lib/utils/utils-currency';
 *
 * // Format currency
 * formatRupiah(1500000); // 'Rp 1.500.000'
 *
 * // Compact format
 * formatCompact(1500000); // 'Rp 1,5 juta'
 *
 * // Convert to words
 * toWords(1500000); // 'satu juta lima ratus ribu rupiah'
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for formatting Rupiah currency.
 */
export interface RupiahOptions {
  /**
   * Whether to show 'Rp' symbol.
   * @defaultValue true
   */
  symbol?: boolean;

  // NOTE: Decimal formatting disabled - this project doesn't use ,00 format
  // /**
  //  * Whether to show decimal places.
  //  * @defaultValue false
  //  */
  // decimal?: boolean;

  /**
   * Thousands separator character.
   * @defaultValue '.'
   */
  separator?: string;

  // NOTE: Decimal separator disabled - this project doesn't use ,00 format
  // /**
  //  * Decimal separator character.
  //  * @defaultValue ','
  //  */
  // decimalSeparator?: string;

  // NOTE: Precision disabled - this project doesn't use ,00 format
  // /**
  //  * Number of decimal places to show.
  //  * @defaultValue 0
  //  */
  // precision?: number;

  /**
   * Whether to add space after 'Rp' symbol.
   * @defaultValue true
   */
  spaceAfterSymbol?: boolean;
}

/**
 * Options for converting numbers to Indonesian words (terbilang).
 */
export interface WordOptions {
  /**
   * Whether to capitalize the first letter.
   * @defaultValue false
   */
  uppercase?: boolean;

  /**
   * Whether to add 'rupiah' at the end.
   * @defaultValue true
   */
  withCurrency?: boolean;

  // NOTE: Decimal words disabled - this project doesn't use ,00 format
  // /**
  //  * Whether to include decimal words with 'koma' separator.
  //  * @defaultValue false
  //  */
  // withDecimals?: boolean;
}

/**
 * Unit for rounding currency amounts.
 */
export type RoundUnit = 'ribu' | 'ratus-ribu' | 'juta';

/**
 * Options for compact currency formatting.
 */
export interface CompactOptions {
  /**
   * Whether to show 'Rp' symbol.
   * @defaultValue true
   */
  symbol?: boolean;

  /**
   * Whether to add space after 'Rp' symbol.
   * @defaultValue true
   */
  spaceAfterSymbol?: boolean;
}

/**
 * Options for splitting an amount into parts.
 */
export interface SplitOptions {
  /**
   * Custom percentage ratios (must sum to 100).
   * Length must match `parts` count.
   */
  ratios?: number[];

  /**
   * Round each part to a clean amount.
   */
  roundTo?: RoundUnit;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Formats a number as Indonesian Rupiah currency.
 * NOTE: This project uses whole number format only (no ,00 decimals).
 *
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted Rupiah string
 *
 * @example
 * ```typescript
 * formatRupiah(1500000); // 'Rp 1.500.000'
 * formatRupiah(1500000, { symbol: false }); // '1.500.000'
 * ```
 */
export function formatRupiah(amount: number, options?: RupiahOptions): string {
  const {
    symbol = true,
    // NOTE: Decimal formatting disabled - this project doesn't use ,00 format
    // decimal = false,
    separator = '.',
    // decimalSeparator = ',',
    spaceAfterSymbol = true,
  } = options || {};

  // NOTE: Decimal precision disabled - this project doesn't use ,00 format
  // Default precision: 2 for decimals, 0 otherwise
  // const precision =
  //   options?.precision !== undefined ? options.precision : decimal ? 2 : 0;

  const isNegative = amount < 0 && amount !== 0;
  const absAmount = Math.abs(amount);

  let result: string;

  // NOTE: Decimal formatting block disabled - this project doesn't use ,00 format
  // if (decimal) {
  //   const factor = Math.pow(10, precision);
  //   const rounded = Math.round(absAmount * factor) / factor;
  //
  //   if (precision > 0) {
  //     const [intPart, decPart] = rounded.toFixed(precision).split('.');
  //     const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  //     result = `${formattedInt}${decimalSeparator}${decPart}`;
  //   } else {
  //     const intPart = rounded.toString();
  //     result = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  //   }
  // } else {
  //   const intAmount = Math.floor(absAmount);
  //   result = intAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  // }

  // Always use whole number formatting (no decimals)
  const intAmount = Math.floor(absAmount);
  result = intAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);

  if (symbol) {
    const space = spaceAfterSymbol ? ' ' : '';
    if (isNegative) {
      result = `-Rp${space}${result}`;
    } else {
      result = `Rp${space}${result}`;
    }
  } else if (isNegative) {
    result = `-${result}`;
  }

  return result;
}

/**
 * Formats a number in compact Indonesian format.
 *
 * Uses Indonesian units: ribu, juta, miliar, triliun.
 *
 * @param amount - The amount to format
 * @param options - Compact formatting options
 * @returns Compact formatted string
 *
 * @example
 * ```typescript
 * formatCompact(1500000); // 'Rp 1,5 juta'
 * formatCompact(1000000); // 'Rp 1 juta'
 * formatCompact(500000); // 'Rp 500 ribu'
 * ```
 */
export function formatCompact(
  amount: number,
  options?: CompactOptions
): string {
  const { symbol = true, spaceAfterSymbol = true } = options || {};

  const isNegative = amount < 0 && amount !== 0;
  const abs = Math.abs(amount);

  let result: string;

  if (abs >= 1_000_000_000_000) {
    result = formatCompactValue(abs / 1_000_000_000_000, 'triliun');
  } else if (abs >= 1_000_000_000) {
    result = formatCompactValue(abs / 1_000_000_000, 'miliar');
  } else if (abs >= 1_000_000) {
    result = formatCompactValue(abs / 1_000_000, 'juta');
  } else if (abs >= 100_000) {
    result = formatCompactValue(abs / 1000, 'ribu');
  } else if (abs >= 1_000) {
    result = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  } else {
    result = abs.toString();
  }

  if (symbol) {
    const space = spaceAfterSymbol ? ' ' : '';
    if (isNegative) {
      result = `-Rp${space}${result}`;
    } else {
      result = `Rp${space}${result}`;
    }
  } else if (isNegative) {
    result = `-${result}`;
  }

  return result;
}

/**
 * Formats a value with Indonesian unit, applying grammar rules.
 * @internal
 */
function formatCompactValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;

  if (rounded % 1 === 0) {
    return `${rounded.toFixed(0)} ${unit}`;
  }

  return `${rounded.toString().replace('.', ',')} ${unit}`;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parses a formatted Rupiah string back to a number.
 * NOTE: This project uses whole number format only (no ,00 decimals).
 *
 * Handles multiple formats:
 * - Standard: "Rp 1.500.000"
 * - No symbol: "1.500.000"
 * - Compact: "Rp 1,5 juta", "Rp 500 ribu"
 *
 * @param formatted - The formatted Rupiah string to parse
 * @returns Parsed number, or null if invalid
 *
 * @example
 * ```typescript
 * parseRupiah('Rp 1.500.000'); // 1500000
 * parseRupiah('Rp 1,5 juta'); // 1500000
 * ```
 */
export function parseRupiah(formatted: string): number | null {
  if (!formatted || typeof formatted !== 'string') {
    return null;
  }

  const cleaned = formatted.trim().toLowerCase();

  // Check for compact units (juta, ribu, miliar, triliun)
  const compactUnits = {
    triliun: 1_000_000_000_000,
    miliar: 1_000_000_000,
    juta: 1_000_000,
    ribu: 1_000,
  };

  for (const [unit, multiplier] of Object.entries(compactUnits)) {
    if (cleaned.includes(unit)) {
      const match = cleaned.match(/(-?\d+[,]?\d*)/);
      if (match) {
        const num = parseFloat(match[1].replace(',', '.'));
        return num * multiplier;
      }
    }
  }

  // Standard format: remove 'Rp' and spaces
  let numStr = cleaned.replace(/rp/gi, '').trim();

  const hasDot = numStr.includes('.');
  const hasComma = numStr.includes(',');

  // NOTE: Decimal parsing disabled - this project doesn't use ,00 format
  // if (hasDot && hasComma) {
  //   // Determine format based on last separator position
  //   const lastDot = numStr.lastIndexOf('.');
  //   const lastComma = numStr.lastIndexOf(',');
  //
  //   if (lastComma > lastDot) {
  //     numStr = numStr.replace(/\./g, '').replace(',', '.');
  //   } else {
  //     numStr = numStr.replace(/,/g, '');
  //   }
  // } else if (hasComma) {
  //   const parts = numStr.split(',');
  //   // Decimal if only 1-2 digits after comma
  //   if (parts.length === 2 && parts[1].length <= 2) {
  //     numStr = numStr.replace(',', '.');
  //   } else {
  //     numStr = numStr.replace(/,/g, '');
  //   }
  // } else if (hasDot) {
  //   const parts = numStr.split('.');
  //   // If not decimal format, remove dots (thousands separator)
  //   if (parts.length > 2 || (parts.length === 2 && parts[1].length > 2)) {
  //     numStr = numStr.replace(/\./g, '');
  //   }
  // }

  // Always parse as whole number - remove all separators
  if (hasDot || hasComma) {
    // Remove thousand separators (dots) and treat comma as thousand separator too
    numStr = numStr.replace(/\./g, '').replace(/,/g, '');
  }

  const parsed = parseFloat(numStr);
  return isNaN(parsed) ? null : parsed;
}

// ============================================================================
// Word Conversion (Terbilang)
// ============================================================================

/**
 * Basic Indonesian number words (0-9).
 * @internal
 */
const BASIC_NUMBERS = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
];

/**
 * Indonesian words for 10-19.
 * @internal
 */
const TEENS = [
  'sepuluh',
  'sebelas',
  'dua belas',
  'tiga belas',
  'empat belas',
  'lima belas',
  'enam belas',
  'tujuh belas',
  'delapan belas',
  'sembilan belas',
];

/**
 * Indonesian words for tens (20, 30, 40, etc).
 * @internal
 */
const TENS = [
  '',
  '',
  'dua puluh',
  'tiga puluh',
  'empat puluh',
  'lima puluh',
  'enam puluh',
  'tujuh puluh',
  'delapan puluh',
  'sembilan puluh',
];

/**
 * Converts a number to Indonesian words (terbilang).
 *
 * Supports numbers up to trillions (triliun).
 * Follows Indonesian language rules for number pronunciation.
 *
 * @param amount - The number to convert
 * @param options - Conversion options
 * @returns Indonesian words representation
 *
 * @example
 * ```typescript
 * toWords(123); // 'seratus dua puluh tiga rupiah'
 * toWords(1500000); // 'satu juta lima ratus ribu rupiah'
 * toWords(1500000, { uppercase: true }); // 'Satu juta lima ratus ribu rupiah'
 * ```
 */
export function toWords(amount: number, options?: WordOptions): string {
  const {
    uppercase = false,
    withCurrency = true,
    // NOTE: Decimal words disabled - this project doesn't use ,00 format
    // withDecimals = false,
  } = options || {};

  if (amount === 0) {
    let result = 'nol';
    if (withCurrency) result += ' rupiah';
    return uppercase ? capitalize(result) : result;
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const intPart = Math.floor(absAmount);

  let words = convertInteger(intPart);

  if (isNegative) {
    words = 'minus ' + words;
  }

  if (withCurrency) {
    words += ' rupiah';
  }

  // NOTE: Decimal words disabled - this project doesn't use ,00 format
  // if (withDecimals) {
  //   const decimalPart = Math.round((absAmount - intPart) * 100);
  //   if (decimalPart > 0) {
  //     words += ' koma ' + convertDecimal(decimalPart);
  //   }
  // }

  return uppercase ? capitalize(words) : words;
}

/**
 * Converts the integer part to Indonesian words.
 * @internal
 */
function convertInteger(num: number): string {
  if (num === 0) return 'nol';

  let words = '';

  const triliun = Math.floor(num / 1_000_000_000_000);
  const miliar = Math.floor((num % 1_000_000_000_000) / 1_000_000_000);
  const juta = Math.floor((num % 1_000_000_000) / 1_000_000);
  const ribu = Math.floor((num % 1_000_000) / 1_000);
  const sisa = num % 1_000;

  if (triliun > 0) {
    words += convertGroup(triliun) + ' triliun';
  }

  if (miliar > 0) {
    if (words) words += ' ';
    words += convertGroup(miliar) + ' miliar';
  }

  if (juta > 0) {
    if (words) words += ' ';
    words += convertGroup(juta) + ' juta';
  }

  if (ribu > 0) {
    if (words) words += ' ';
    words += ribu === 1 ? 'seribu' : convertGroup(ribu) + ' ribu';
  }

  if (sisa > 0) {
    if (words) words += ' ';
    words += convertGroup(sisa);
  }

  return words;
}

// NOTE: Decimal conversion disabled - this project doesn't use ,00 format
// /**
//  * Converts decimal part (0-99) to Indonesian words.
//  * @internal
//  */
// function convertDecimal(num: number): string {
//   if (num === 0) return '';
//   if (num < 10) return BASIC_NUMBERS[num];
//   if (num < 20) return TEENS[num - 10];
//
//   const tens = Math.floor(num / 10);
//   const ones = num % 10;
//
//   let result = TENS[tens];
//   if (ones > 0) {
//     result += ' ' + BASIC_NUMBERS[ones];
//   }
//
//   return result;
// }

/**
 * Converts a group of 1-3 digits (0-999) to Indonesian words.
 * @internal
 */
function convertGroup(num: number): string {
  if (num === 0) return '';

  let result = '';

  const hundreds = Math.floor(num / 100);
  if (hundreds > 0) {
    // Special rule: 100 = "seratus" not "satu ratus"
    result = hundreds === 1 ? 'seratus' : BASIC_NUMBERS[hundreds] + ' ratus';
  }

  const remainder = num % 100;
  if (remainder > 0) {
    if (result) result += ' ';
    result += convertTwoDigits(remainder);
  }

  return result;
}

/**
 * Converts numbers 1-99 to Indonesian words.
 * @internal
 */
function convertTwoDigits(num: number): string {
  if (num === 0) return '';
  if (num < 10) return BASIC_NUMBERS[num];
  if (num >= 10 && num < 20) return TEENS[num - 10];

  const tens = Math.floor(num / 10);
  const ones = num % 10;

  let result = TENS[tens];
  if (ones > 0) {
    result += ' ' + BASIC_NUMBERS[ones];
  }

  return result;
}

/**
 * Capitalizes the first letter of a string.
 * @internal
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Rounds a number to a clean currency amount.
 *
 * @param amount - The amount to round
 * @param unit - The unit to round to (default: 'ribu')
 * @returns Rounded amount
 *
 * @example
 * ```typescript
 * roundToClean(1234567, 'ribu'); // 1235000
 * roundToClean(1234567, 'ratus-ribu'); // 1200000
 * roundToClean(1234567, 'juta'); // 1000000
 * ```
 */
export function roundToClean(amount: number, unit: RoundUnit = 'ribu'): number {
  const divisors: Record<RoundUnit, number> = {
    ribu: 1000,
    'ratus-ribu': 100000,
    juta: 1000000,
  };

  const divisor = divisors[unit];
  return Math.round(amount / divisor) * divisor;
}

/**
 * Formats a number as Indonesian Rupiah in accounting style.
 * Negative numbers are wrapped in parentheses.
 *
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted accounting string
 *
 * @example
 * ```typescript
 * formatAccounting(-1500000); // '(Rp 1.500.000)'
 * formatAccounting(1500000); // 'Rp 1.500.000'
 * ```
 */
export function formatAccounting(
  amount: number,
  options?: RupiahOptions
): string {
  const isNegative = amount < 0;
  const formatted = formatRupiah(Math.abs(amount), options);

  if (isNegative) {
    return `(${formatted})`;
  }

  return formatted;
}

/**
 * Calculates tax (PPN) for a given amount.
 *
 * @param amount - The base amount
 * @param rate - The tax rate (e.g., 0.11 for 11% PPN)
 * @returns The calculated tax amount
 *
 * @example
 * ```typescript
 * calculateTax(1000000, 0.11); // 110000
 * ```
 */
export function calculateTax(amount: number, rate: number): number {
  return amount * rate;
}

/**
 * Helper to ensure a string or number has the 'Rp ' prefix.
 * If already prefixed, it returns the input as is.
 *
 * @param amount - The amount or formatted string
 * @returns String with Rupiah prefix
 */
export function addRupiahSymbol(amount: string | number): string {
  if (typeof amount === 'number') {
    const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `Rp ${formatted}`;
  }

  if (amount.trim().startsWith('Rp')) {
    return amount.trim();
  }

  return `Rp ${amount.trim()}`;
}

// ============================================================================
// Calculation Functions
// ============================================================================

/**
 * Invalid split error thrown when split parameters are invalid.
 */
export class InvalidSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSplitError';
  }
}

/**
 * Splits an amount into equal or custom-ratio parts.
 *
 * @param amount - The amount to split
 * @param parts - Number of parts to split into
 * @param options - Split options (ratios, rounding)
 * @returns Array of split amounts
 *
 * @example
 * ```typescript
 * splitAmount(1500000, 3); // [500000, 500000, 500000]
 * splitAmount(1000000, 2, { ratios: [70, 30] }); // [700000, 300000]
 * splitAmount(1234567, 3, { roundTo: 'ribu' }); // [412000, 411000, 411000]
 * ```
 */
export function splitAmount(
  amount: number,
  parts: number,
  options?: SplitOptions
): number[] {
  if (parts < 1) {
    throw new InvalidSplitError('Parts must be at least 1');
  }

  if (parts === 1) {
    return [amount];
  }

  const { ratios, roundTo } = options || {};

  if (ratios) {
    if (ratios.length !== parts) {
      throw new InvalidSplitError(
        `Ratios length (${ratios.length}) must match parts count (${parts})`
      );
    }

    const sum = ratios.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new InvalidSplitError(`Ratios must sum to 100 (got ${sum})`);
    }

    let result = ratios.map((r) => amount * (r / 100));

    if (roundTo) {
      result = result.map((v) => roundToClean(v, roundTo));
    }

    return result;
  }

  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;

  const result: number[] = [];
  for (let i = 0; i < parts; i++) {
    result.push(base + (i < remainder ? 1 : 0));
  }

  if (roundTo) {
    return result.map((v) => roundToClean(v, roundTo));
  }

  return result;
}

/**
 * Calculates what percentage a part is of a total.
 *
 * @param part - The part value
 * @param total - The total value
 * @returns Percentage as number (e.g., 15 for 15%)
 *
 * @example
 * ```typescript
 * percentageOf(150000, 1000000); // 15
 * percentageOf(0, 1000000); // 0
 * percentageOf(100, 0); // 0 (not NaN)
 * ```
 */
export function percentageOf(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Calculates absolute and percentage difference between two amounts.
 *
 * @param amount1 - The new/current amount
 * @param amount2 - The original/reference amount
 * @returns Object with absolute difference, percentage, and direction
 *
 * @example
 * ```typescript
 * difference(1200000, 1000000);
 * // { absolute: 200000, percentage: 20, direction: 'increase' }
 *
 * difference(0, 1000000);
 * // { absolute: -1000000, percentage: null, direction: 'decrease' }
 * ```
 */
export function difference(
  amount1: number,
  amount2: number
): {
  absolute: number;
  percentage: number | null;
  direction: 'increase' | 'decrease' | 'same';
} {
  const absolute = amount1 - amount2;

  let percentage: number | null;
  if (amount2 === 0) {
    percentage = amount1 === 0 ? 0 : null;
  } else {
    percentage = (absolute / amount2) * 100;
  }

  const direction: 'increase' | 'decrease' | 'same' =
    absolute > 0 ? 'increase' : absolute < 0 ? 'decrease' : 'same';

  return { absolute, percentage, direction };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates whether a string is a valid Rupiah format.
 *
 * Accepts standard, compact, and negative formats.
 *
 * @param formatted - The string to validate
 * @returns `true` if valid Rupiah format, `false` otherwise
 *
 * @example
 * ```typescript
 * validateRupiah('Rp 1.500.000'); // true
 * validateRupiah('1.500.000'); // true
 * validateRupiah('Rp 1,5 juta'); // true
 * validateRupiah('abc'); // false
 * ```
 */
export function validateRupiah(formatted: string): boolean {
  if (!formatted || typeof formatted !== 'string') {
    return false;
  }

  const trimmed = formatted.trim();

  if (!trimmed) return false;

  const compactUnits = ['triliun', 'miliar', 'juta', 'ribu'];

  // Check for compact format
  for (const unit of compactUnits) {
    if (trimmed.toLowerCase().includes(unit)) {
      return /-?\d+[,]?\d*\s*(ribu|juta|miliar|triliun)/i.test(trimmed);
    }
  }

  // Standard format: remove optional Rp prefix and optional negative sign
  let cleaned = trimmed.replace(/^(-?\s*)?Rp\s*/i, '');

  // Remove negative sign if still present
  cleaned = cleaned.replace(/^\s*-/, '');

  cleaned = cleaned.trim();

  if (!cleaned) return false;

  // Must be digits with dots and/or commas
  if (!/^[0-9.,]+$/.test(cleaned)) return false;

  // Must have at least one digit
  if (!/\d/.test(cleaned)) return false;

  return true;
}
