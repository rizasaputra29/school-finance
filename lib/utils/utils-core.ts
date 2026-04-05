import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format number with thousand separator (e.g., 1.000.000)
export function formatNumberInput(value: string | number): string {
  const numStr = String(value).replace(/\D/g, '');
  if (!numStr) return '';
  return new Intl.NumberFormat('id-ID').format(parseInt(numStr));
}

// Parse formatted number back to raw number (removes dots)
export function parseFormattedNumber(value: string): number {
  const numStr = value.replace(/\./g, '').replace(/,/g, '');
  return parseInt(numStr) || 0;
}

