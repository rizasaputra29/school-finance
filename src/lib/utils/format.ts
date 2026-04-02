/**
 * Format Utilities - Currency formatting and number precision
 * Task 31: Rounding & Precision
 */

// ============================================================================
// Constants
// ============================================================================

const ROUNDING_PRECISION = 2;
export function roundHalfUp(value: number, decimals: number = ROUNDING_PRECISION): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format number as Indonesian Rupiah currency
 * Uses proper rounding (half-up) to 2 decimal places
 */
export function formatCurrency(
  amount: number | string,
  options: {
    decimals?: number;
    showCents?: boolean;
    prefix?: string;
    suffix?: string;
  } = {}
): string {
  const {
    decimals = ROUNDING_PRECISION,
    showCents = true,
    prefix = 'Rp',
    suffix = ''
  } = options;

  // Parse and round the amount
  const numericAmount = typeof amount === 'string' 
    ? parseFloat(amount) || 0 
    : amount;
  
  const roundedAmount = roundHalfUp(numericAmount, decimals);
  
  // Format with thousand separators (Indonesian format)
  const [integerPart, decimalPart] = roundedAmount.toFixed(decimals).split('.');
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  if (showCents && decimals > 0) {
    return `${prefix} ${formattedInteger},${decimalPart}${suffix}`.trim();
  }
  
  return `${prefix} ${formattedInteger}${suffix}`.trim();
}

/**
 * Format number with thousand separators (Indonesian format)
 */
export function formatNumber(value: number | string, decimals: number = ROUNDING_PRECISION): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
  const rounded = roundHalfUp(numericValue, decimals);
  
  if (decimals > 0) {
    const [integerPart, decimalPart] = rounded.toFixed(decimals).split('.');
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimalPart}`;
  }
  
  return rounded.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse formatted currency string back to number
 * Removes currency symbols, thousand separators, and decimal commas
 */
export function parseCurrency(value: string): number {
  if (!value) return 0;
  
  // Remove currency symbols and whitespace
  let cleaned = value.replace(/Rp\s?/i, '').trim();
  
  // Remove thousand separators (Indonesian dots)
  cleaned = cleaned.replace(/\./g, '');
  
  // Replace decimal comma with dot
  cleaned = cleaned.replace(/,/g, '.');
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : roundHalfUp(parsed);
}

/**
 * Format large numbers for display (e.g., in tables)
 * Shows: 1.5M, 250K, etc.
 */
export function formatCompact(value: number | string): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
  const absValue = Math.abs(numericValue);
  
  if (absValue >= 1_000_000_000) {
    return `${(numericValue / 1_000_000_000).toFixed(1)}M`;
  }
  
  if (absValue >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(1)}Jt`;
  }
  
  if (absValue >= 1_000) {
    return `${(numericValue / 1_000).toFixed(1)}K`;
  }
  
  return formatNumber(numericValue, 0);
}

/**
 * Validate if a value is a valid amount (not too large, not negative if required)
 */
export function isValidAmount(
  value: number | string,
  options: {
    allowNegative?: boolean;
    maxValue?: number;
    minValue?: number;
  } = {}
): boolean {
  const { allowNegative = false, maxValue, minValue = 0 } = options;
  
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numericValue)) return false;
  if (!allowNegative && numericValue < 0) return false;
  if (minValue !== undefined && numericValue < minValue) return false;
  if (maxValue !== undefined && numericValue > maxValue) return false;
  
  return true;
}

/**
 * Round to nearest specified interval (e.g., nearest 1000)
 */
export function roundToNearest(value: number, interval: number = 1): number {
  return Math.round(value / interval) * interval;
}

const formatUtils = {
  roundHalfUp,
  formatCurrency,
  formatNumber,
  parseCurrency,
  formatCompact,
  isValidAmount,
  roundToNearest,
};

export default formatUtils;