/**
 * Date Utilities - Comprehensive date handling for School Finance System
 * 
 * Uses date-fns for robust, immutable date operations
 * Indonesian locale (id-ID) as default for all formatting
 * 
 * @module lib/utils/utils-date
 * @requires date-fns
 */

import {
	// Validation
	isValid,
	isBefore,
	isAfter,
	isEqual,
	isSameDay,
	isSameMonth,
	isSameYear,
	
	// Parsing
	parseISO,
	parse,
	
	// Formatting
	format,
	
	// Manipulation
	startOfMonth,
	endOfMonth,
	startOfYear,
	endOfYear,
	startOfDay,
	endOfDay,
	addDays,
	addMonths,
	addYears,
	subDays,
	subMonths,
	subYears,
	setYear,
	setMonth,
	setDate,
	
	// Calculations
	differenceInDays,
	differenceInMonths,
	differenceInYears,
	compareAsc,
	compareDesc,
	
	// Utilities
	min as dateMin,
	max as dateMax,
	clamp as dateClamp,
} from "date-fns";
import { id } from "date-fns/locale";

// ============================================
// Types & Constants
// ============================================

/** Input types accepted by date utility functions */
export type DateInput = Date | string | number | null | undefined;

/** Predefined date formats */
export type DateFormat =
	| "full"
	| "short"
	| "monthYear"
	| "period"
	| "iso"
	| "filename"
	| "datetime"
	| "time"
	| "shortWithTime"
	| "compact";

/** Date range object */
export interface DateRange {
	start: Date;
	end: Date;
}

/** Period object (year and month) */
export interface Period {
	year: number;
	month: number;
}

/** Indonesian locale constant */
export const ID_LOCALE = id;

/** Default locale string */
export const LOCALE_STRING = "id-ID";

// ============================================
// Validation Utilities
// ============================================

/**
 * Check if a date is valid
 * @param date - Date to validate
 * @returns True if valid Date object
 * 
 * @example
 * isValidDate(new Date()) // true
 * isValidDate("invalid") // false
 * isValidDate(null) // false
 */
export function isValidDate(date: DateInput): boolean {
	if (date === null || date === undefined) return false;
	const d = toDate(date);
	return isValid(d);
}

/**
 * Check if a date is before another date
 * @param date - Date to check
 * @param compareDate - Date to compare against
 * @returns True if date is before compareDate
 * 
 * @example
 * isDateBefore(new Date(2024, 0, 1), new Date(2024, 0, 15)) // true
 */
export function isDateBefore(date: DateInput, compareDate: DateInput): boolean {
	const d1 = toDate(date);
	const d2 = toDate(compareDate);
	if (!isValid(d1) || !isValid(d2)) return false;
	return isBefore(d1, d2);
}

/**
 * Check if a date is after another date
 * @param date - Date to check
 * @param compareDate - Date to compare against
 * @returns True if date is after compareDate
 */
export function isDateAfter(date: DateInput, compareDate: DateInput): boolean {
	const d1 = toDate(date);
	const d2 = toDate(compareDate);
	if (!isValid(d1) || !isValid(d2)) return false;
	return isAfter(d1, d2);
}

/**
 * Check if two dates are the same day
 * @param date - First date
 * @param compareDate - Second date
 * @returns True if both dates represent the same day
 */
export function isSameDate(date: DateInput, compareDate: DateInput): boolean {
	const d1 = toDate(date);
	const d2 = toDate(compareDate);
	if (!isValid(d1) || !isValid(d2)) return false;
	return isSameDay(d1, d2);
}

/**
 * Check if two dates are in the same month
 * @param date - First date
 * @param compareDate - Second date
 * @returns True if both dates are in the same month
 */
export function isSameMonthYear(date: DateInput, compareDate: DateInput): boolean {
	const d1 = toDate(date);
	const d2 = toDate(compareDate);
	if (!isValid(d1) || !isValid(d2)) return false;
	return isSameMonth(d1, d2) && isSameYear(d1, d2);
}

/**
 * Check if a date is within a range (inclusive)
 * @param date - Date to check
 * @param start - Start of range
 * @param end - End of range
 * @returns True if date is within range
 * 
 * @example
 * isDateInRange(new Date(2024, 0, 15), new Date(2024, 0, 1), new Date(2024, 0, 31)) // true
 */
export function isDateInRange(
	date: DateInput,
	start: DateInput,
	end: DateInput,
): boolean {
	const d = toDate(date);
	const s = toDate(start);
	const e = toDate(end);
	if (!isValid(d) || !isValid(s) || !isValid(e)) return false;
	return (isEqual(d, s) || isAfter(d, s)) && (isEqual(d, e) || isBefore(d, e));
}

/**
 * Check if a date is today
 * @param date - Date to check
 * @returns True if date is today
 */
export function isToday(date: DateInput): boolean {
	const d = toDate(date);
	if (!isValid(d)) return false;
	return isSameDay(d, new Date());
}

/**
 * Check if a date is in the future
 * @param date - Date to check
 * @returns True if date is in the future
 */
export function isFuture(date: DateInput): boolean {
	const d = toDate(date);
	if (!isValid(d)) return false;
	return isAfter(d, new Date());
}

/**
 * Check if a date is in the past
 * @param date - Date to check
 * @returns True if date is in the past
 */
export function isPast(date: DateInput): boolean {
	const d = toDate(date);
	if (!isValid(d)) return false;
	return isBefore(d, new Date());
}

/**
 * Check if a due date is overdue (past date and not today)
 * @param dueDate - The due date to check
 * @returns True if overdue
 */
export function isOverdue(dueDate: DateInput): boolean {
	const d = toDate(dueDate);
	if (!isValid(d)) return false;
	const today = startOfDay(new Date());
	return isBefore(startOfDay(d), today);
}

// ============================================
// Parsing Utilities
// ============================================

/**
 * Convert various date inputs to a Date object
 * @param date - Date input (Date, string, number, or ISO string)
 * @returns Date object (may be invalid if input is invalid)
 * 
 * @example
 * toDate("2024-01-15") // Date object for Jan 15, 2024
 * toDate(1705276800000) // Date from timestamp
 * toDate(new Date()) // Returns same Date
 */
export function toDate(date: DateInput): Date {
	if (date === null || date === undefined) {
		return new Date(NaN);
	}
	if (date instanceof Date) {
		return date;
	}
	if (typeof date === "number") {
		return new Date(date);
	}
	if (typeof date === "string") {
		// Try ISO parsing first (most common)
		const parsed = parseISO(date);
		if (isValid(parsed)) return parsed;
		// Fallback to native parsing
		return new Date(date);
	}
	return new Date(NaN);
}

/**
 * Parse a date string with a specific format
 * @param dateString - String to parse
 * @param formatString - Format pattern (date-fns format)
 * @param referenceDate - Reference date for parsing ambiguous values
 * @returns Parsed Date or invalid Date if parsing fails
 * 
 * @example
 * parseDateString("15/01/2024", "dd/MM/yyyy") // Date for Jan 15, 2024
 * parseDateString("Jan 15, 2024", "MMM dd, yyyy") // Date for Jan 15, 2024
 */
export function parseDateString(
	dateString: string,
	formatString: string,
	referenceDate: DateInput = new Date(),
): Date {
	const ref = toDate(referenceDate);
	return parse(dateString, formatString, ref, { locale: id });
}

/**
 * Convert Excel serial date number to JavaScript Date
 * Excel dates are counted from 1900-01-01 (with a known bug for 1900 leap year)
 * @param excelSerial - Excel serial date number
 * @returns JavaScript Date object
 * 
 * @example
 * parseExcelDate(45000) // Date for Feb 15, 2023
 */
export function parseExcelDate(excelSerial: number): Date {
	// Excel's epoch is 1900-01-01, but has a bug treating 1900 as a leap year
	// We adjust by subtracting 25569 days (Excel epoch to Unix epoch)
	const milliseconds = (excelSerial - 25569) * 86400 * 1000;
	return new Date(milliseconds);
}

/**
 * Parse period string (YYYY-MM format)
 * @param period - Period string in format "YYYY-MM"
 * @returns Period object or null if invalid
 * 
 * @example
 * parsePeriod("2024-01") // { year: 2024, month: 1 }
 * parsePeriod("invalid") // null
 */
export function parsePeriod(period: string): Period | null {
	const match = period.match(/^(\d{4})-(\d{2})$/);
	if (!match) return null;

	const year = parseInt(match[1], 10);
	const month = parseInt(match[2], 10);

	if (month < 1 || month > 12 || year < 1900 || year > 2100) return null;

	return { year, month };
}

/**
 * Parse HTML input[type="date"] value to Date
 * @param inputValue - Value from date input (YYYY-MM-DD format)
 * @returns Date object or null if invalid
 * 
 * @example
 * parseInputDate("2024-01-15") // Date for Jan 15, 2024
 */
export function parseInputDate(inputValue: string): Date | null {
	if (!inputValue) return null;
	const date = parseISO(inputValue);
	return isValid(date) ? date : null;
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format a date using predefined formats or custom pattern
 * @param date - Date to format
 * @param formatType - Predefined format type or custom date-fns pattern
 * @returns Formatted date string (empty string if invalid date)
 * 
 * @example
 * formatDate(new Date(), "full") // "15 Januari 2024"
 * formatDate(new Date(), "short") // "15/01/2024"
 * formatDate(new Date(), "dd MMM yyyy") // "15 Jan 2024"
 */
export function formatDate(
	date: DateInput,
	formatType: DateFormat | string = "full",
): string {
	const d = toDate(date);
	if (!isValid(d)) return "";

	// Predefined formats
	const formats: Record<DateFormat, string> = {
		full: "dd MMMM yyyy", // 15 Januari 2024
		short: "dd/MM/yyyy", // 15/01/2024
		monthYear: "MMMM yyyy", // Januari 2024
		period: "yyyy-MM", // 2024-01
		iso: "yyyy-MM-dd", // 2024-01-15
		filename: "yyyy-MM-dd", // 2024-01-15
		datetime: "dd MMMM yyyy, HH:mm", // 15 Januari 2024, 14:30
		time: "HH:mm", // 14:30
		shortWithTime: "dd/MM/yyyy HH:mm", // 15/01/2024 14:30
		compact: "dd MMM yyyy", // 15 Jan 2024
	};

	const pattern = formats[formatType as DateFormat] || formatType;
	return format(d, pattern, { locale: id });
}

/**
 * Format date in full format: "15 Januari 2024"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatDateFull(date: DateInput): string {
	return formatDate(date, "full");
}

/**
 * Format date in short format: "15/01/2024"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatDateShort(date: DateInput): string {
	return formatDate(date, "short");
}

/**
 * Format date as month and year: "Januari 2024"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatMonthYear(date: DateInput): string {
	return formatDate(date, "monthYear");
}

/**
 * Format date as period: "2024-01"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatPeriod(date: DateInput): string {
	return formatDate(date, "period");
}

/**
 * Format date as ISO date: "2024-01-15"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatISODate(date: DateInput): string {
	return formatDate(date, "iso");
}

/**
 * Format date for filename: "2024-01-15"
 * @param date - Date to format
 * @returns Formatted string (safe for filenames)
 */
export function formatFilenameDate(date: DateInput): string {
	return formatDate(date, "filename");
}

/**
 * Format date with time: "15 Januari 2024, 14:30"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatDateTime(date: DateInput): string {
	return formatDate(date, "datetime");
}

/**
 * Format time only: "14:30"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatTime(date: DateInput): string {
	return formatDate(date, "time");
}

/**
 * Format date in compact format: "15 Jan 2024"
 * @param date - Date to format
 * @returns Formatted string
 */
export function formatDateCompact(date: DateInput): string {
	return formatDate(date, "compact");
}

/**
 * Format a period range: "1 Januari 2024 - 31 Januari 2024"
 * @param start - Start date
 * @param end - End date
 * @returns Formatted period string
 */
export function formatPeriodRange(start: DateInput, end: DateInput): string {
	const s = toDate(start);
	const e = toDate(end);

	if (!isValid(s) || !isValid(e)) return "";

	const startStr = format(s, "d MMMM yyyy", { locale: id });
	const endStr = format(e, "d MMMM yyyy", { locale: id });

	return `${startStr} - ${endStr}`;
}

/**
 * Format date for display with fallback
 * @param date - Date to format
 * @param fallback - Fallback string if date is invalid
 * @returns Formatted date or fallback
 */
export function formatDateOrFallback(
	date: DateInput,
	fallback = "-",
): string {
	const formatted = formatDate(date, "full");
	return formatted || fallback;
}

// ============================================
// Date Manipulation
// ============================================

/**
 * Get start of month for a date
 * @param date - Input date
 * @returns Date at start of month (00:00:00)
 */
export function getStartOfMonth(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return startOfMonth(d);
}

/**
 * Get end of month for a date
 * @param date - Input date
 * @returns Date at end of month (last day, 23:59:59)
 */
export function getEndOfMonth(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return endOfMonth(d);
}

/**
 * Get start of year for a date
 * @param date - Input date
 * @returns Date at start of year (Jan 1, 00:00:00)
 */
export function getStartOfYear(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return startOfYear(d);
}

/**
 * Get end of year for a date
 * @param date - Input date
 * @returns Date at end of year (Dec 31, 23:59:59)
 */
export function getEndOfYear(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return endOfYear(d);
}

/**
 * Get start of day for a date
 * @param date - Input date
 * @returns Date at start of day (00:00:00)
 */
export function getStartOfDay(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return startOfDay(d);
}

/**
 * Get end of day for a date
 * @param date - Input date
 * @returns Date at end of day (23:59:59)
 */
export function getEndOfDay(date: DateInput): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return endOfDay(d);
}

/**
 * Add days to a date
 * @param date - Input date
 * @param days - Number of days to add (can be negative)
 * @returns New date with days added
 */
export function addDaysToDate(date: DateInput, days: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return addDays(d, days);
}

/**
 * Add months to a date
 * @param date - Input date
 * @param months - Number of months to add (can be negative)
 * @returns New date with months added
 */
export function addMonthsToDate(date: DateInput, months: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return addMonths(d, months);
}

/**
 * Add years to a date
 * @param date - Input date
 * @param years - Number of years to add (can be negative)
 * @returns New date with years added
 */
export function addYearsToDate(date: DateInput, years: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return addYears(d, years);
}

/**
 * Subtract days from a date
 * @param date - Input date
 * @param days - Number of days to subtract
 * @returns New date with days subtracted
 */
export function subtractDaysFromDate(date: DateInput, days: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return subDays(d, days);
}

/**
 * Subtract months from a date
 * @param date - Input date
 * @param months - Number of months to subtract
 * @returns New date with months subtracted
 */
export function subtractMonthsFromDate(date: DateInput, months: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return subMonths(d, months);
}

/**
 * Subtract years from a date
 * @param date - Input date
 * @param years - Number of years to subtract
 * @returns New date with years subtracted
 */
export function subtractYearsFromDate(date: DateInput, years: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return subYears(d, years);
}

/**
 * Set year on a date
 * @param date - Input date
 * @param year - Year to set
 * @returns New date with year changed
 */
export function setDateYear(date: DateInput, year: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return setYear(d, year);
}

/**
 * Set month on a date (0-11)
 * @param date - Input date
 * @param month - Month to set (0-11)
 * @returns New date with month changed
 */
export function setDateMonth(date: DateInput, month: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return setMonth(d, month);
}

/**
 * Set day of month on a date
 * @param date - Input date
 * @param day - Day to set (1-31)
 * @returns New date with day changed
 */
export function setDateDay(date: DateInput, day: number): Date {
	const d = toDate(date);
	if (!isValid(d)) return new Date(NaN);
	return setDate(d, day);
}

/**
 * Get first day of a specific month
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Date for first day of month
 */
export function createFirstDayOfMonth(year: number, month: number): Date {
	return new Date(year, month - 1, 1);
}

/**
 * Get last day of a specific month
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Date for last day of month
 */
export function createLastDayOfMonth(year: number, month: number): Date {
	return new Date(year, month, 0);
}

// ============================================
// Date Calculations
// ============================================

/**
 * Calculate difference in days between two dates
 * @param from - Start date
 * @param to - End date
 * @returns Number of days (positive if to > from, negative if to < from)
 */
export function getDifferenceInDays(from: DateInput, to: DateInput): number {
	const f = toDate(from);
	const t = toDate(to);
	if (!isValid(f) || !isValid(t)) return 0;
	return differenceInDays(t, f);
}

/**
 * Calculate difference in months between two dates
 * @param from - Start date
 * @param to - End date
 * @returns Number of months
 */
export function getDifferenceInMonths(from: DateInput, to: DateInput): number {
	const f = toDate(from);
	const t = toDate(to);
	if (!isValid(f) || !isValid(t)) return 0;
	return differenceInMonths(t, f);
}

/**
 * Calculate difference in years between two dates
 * @param from - Start date
 * @param to - End date
 * @returns Number of years
 */
export function getDifferenceInYears(from: DateInput, to: DateInput): number {
	const f = toDate(from);
	const t = toDate(to);
	if (!isValid(f) || !isValid(t)) return 0;
	return differenceInYears(t, f);
}

/**
 * Calculate age from birth date
 * @param birthDate - Birth date
 * @returns Age in years
 */
export function calculateAge(birthDate: DateInput): number {
	return getDifferenceInYears(birthDate, new Date());
}

/**
 * Get days from today until a date
 * @param date - Target date
 * @returns Number of days (negative if in past)
 */
export function daysFromNow(date: DateInput): number {
	return getDifferenceInDays(new Date(), date);
}

/**
 * Get days overdue from a due date
 * @param dueDate - Due date
 * @returns Number of days overdue (0 if not overdue, positive if overdue)
 */
export function getDaysOverdue(dueDate: DateInput): number {
	const d = toDate(dueDate);
	if (!isValid(d)) return 0;

	const today = startOfDay(new Date());
	const due = startOfDay(d);

	if (isBefore(due, today)) {
		return differenceInDays(today, due);
	}
	return 0;
}

// ============================================
// Date Range Utilities
// ============================================

/**
 * Create a date range for a specific year and optional month
 * @param year - Year
 * @param month - Optional month (1-12), if not provided uses full year
 * @returns Date range with start and end dates
 */
export function createDateRange(year: number, month?: number): DateRange {
	if (month !== undefined) {
		return {
			start: createFirstDayOfMonth(year, month),
			end: createLastDayOfMonth(year, month),
		};
	}
	return {
		start: new Date(year, 0, 1),
		end: new Date(year, 11, 31, 23, 59, 59),
	};
}

/**
 * Get current month date range
 * @returns Date range for current month
 */
export function getCurrentMonthRange(): DateRange {
	const now = new Date();
	return createDateRange(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Get current year date range
 * @returns Date range for current year
 */
export function getCurrentYearRange(): DateRange {
	const now = new Date();
	return createDateRange(now.getFullYear());
}

/**
 * Get yesterday's date range (for filtering)
 * @returns Date range for yesterday
 */
export function getYesterdayRange(): DateRange {
	const yesterday = subDays(new Date(), 1);
	return {
		start: startOfDay(yesterday),
		end: endOfDay(yesterday),
	};
}

/**
 * Get today's date range (for filtering)
 * @returns Date range for today
 */
export function getTodayRange(): DateRange {
	const today = new Date();
	return {
		start: startOfDay(today),
		end: endOfDay(today),
	};
}

/**
 * Get last N days date range
 * @param days - Number of days
 * @returns Date range for last N days (including today)
 */
export function getLastNDaysRange(days: number): DateRange {
	const end = new Date();
	const start = subDays(end, days - 1);
	return {
		start: startOfDay(start),
		end: endOfDay(end),
	};
}

/**
 * Get academic year range (Indonesian format: July - June)
 * @param year - Academic year start year
 * @returns Date range for academic year
 */
export function getAcademicYearRange(year: number): DateRange {
	return {
		start: new Date(year, 6, 1), // July 1
		end: new Date(year + 1, 5, 30, 23, 59, 59), // June 30
	};
}

// ============================================
// Sorting & Comparison
// ============================================

/**
 * Compare two dates (ascending order)
 * @param a - First date
 * @param b - Second date
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDatesAsc(a: DateInput, b: DateInput): number {
	const d1 = toDate(a);
	const d2 = toDate(b);
	if (!isValid(d1) || !isValid(d2)) return 0;
	return compareAsc(d1, d2);
}

/**
 * Compare two dates (descending order)
 * @param a - First date
 * @param b - Second date
 * @returns 1 if a < b, 0 if equal, -1 if a > b
 */
export function compareDatesDesc(a: DateInput, b: DateInput): number {
	const d1 = toDate(a);
	const d2 = toDate(b);
	if (!isValid(d1) || !isValid(d2)) return 0;
	return compareDesc(d1, d2);
}

/**
 * Sort dates in ascending order
 * @param dates - Array of dates
 * @returns Sorted array (new array)
 */
export function sortDatesAsc(dates: DateInput[]): Date[] {
	return dates
		.map(toDate)
		.filter(isValid)
		.sort(compareAsc);
}

/**
 * Sort dates in descending order
 * @param dates - Array of dates
 * @returns Sorted array (new array)
 */
export function sortDatesDesc(dates: DateInput[]): Date[] {
	return dates
		.map(toDate)
		.filter(isValid)
		.sort(compareDesc);
}

/**
 * Get minimum date from array
 * @param dates - Array of dates
 * @returns Earliest date or null if empty/invalid
 */
export function minDate(dates: DateInput[]): Date | null {
	const validDates = dates.map(toDate).filter(isValid);
	if (validDates.length === 0) return null;
	return dateMin(validDates);
}

/**
 * Get maximum date from array
 * @param dates - Array of dates
 * @returns Latest date or null if empty/invalid
 */
export function maxDate(dates: DateInput[]): Date | null {
	const validDates = dates.map(toDate).filter(isValid);
	if (validDates.length === 0) return null;
	return dateMax(validDates);
}

/**
 * Clamp a date to a range
 * @param date - Date to clamp
 * @param min - Minimum date
 * @param max - Maximum date
 * @returns Clamped date
 */
export function clampDate(
	date: DateInput,
	min: DateInput,
	max: DateInput,
): Date {
	const d = toDate(date);
	const minDate = toDate(min);
	const maxDate = toDate(max);

	if (!isValid(d)) return new Date(NaN);
	if (!isValid(minDate) || !isValid(maxDate)) return d;

	return dateClamp(d, { start: minDate, end: maxDate });
}

// ============================================
// Utility Helpers
// ============================================

/**
 * Get current date and time
 * @returns Current Date object
 */
export function now(): Date {
	return new Date();
}

/**
 * Get today (start of current day)
 * @returns Date for start of today
 */
export function today(): Date {
	return startOfDay(new Date());
}

/**
 * Convert date to HTML input[type="date"] value format
 * @param date - Date to convert
 * @returns String in YYYY-MM-DD format or empty string if invalid
 */
export function toInputValue(date: DateInput): string {
	const d = toDate(date);
	if (!isValid(d)) return "";
	return format(d, "yyyy-MM-dd");
}

/**
 * Convert date to HTML input[type="datetime-local"] value format
 * @param date - Date to convert
 * @returns String in YYYY-MM-DDTHH:mm format or empty string if invalid
 */
export function toDateTimeInputValue(date: DateInput): string {
	const d = toDate(date);
	if (!isValid(d)) return "";
	return format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Check if date falls on a weekend
 * @param date - Date to check
 * @returns True if Saturday or Sunday
 */
export function isWeekend(date: DateInput): boolean {
	const d = toDate(date);
	if (!isValid(d)) return false;
	const day = d.getDay();
	return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if date falls on a weekday
 * @param date - Date to check
 * @returns True if Monday-Friday
 */
export function isWeekday(date: DateInput): boolean {
	return !isWeekend(date);
}

/**
 * Get relative time description in Indonesian
 * @param date - Date to describe
 * @returns Relative description like "Hari ini", "Kemarin", "Besok", or formatted date
 */
export function getRelativeDateDescription(date: DateInput): string {
	const d = toDate(date);
	if (!isValid(d)) return "";

	if (isToday(d)) return "Hari ini";

	const yesterday = subDays(today(), 1);
	if (isSameDay(d, yesterday)) return "Kemarin";

	const tomorrow = addDays(today(), 1);
	if (isSameDay(d, tomorrow)) return "Besok";

	const daysDiff = Math.abs(differenceInDays(d, new Date()));
	if (daysDiff < 7 && isBefore(d, new Date())) {
		return `${daysDiff} hari yang lalu`;
	}
	if (daysDiff < 7 && isAfter(d, new Date())) {
		return `${daysDiff} hari lagi`;
	}

	return formatDate(d, "full");
}

// ============================================
// Export backward compatibility aliases
// ============================================

/** @deprecated Use formatDateShort instead */
export { formatDateShort as formatShortDate };

/** @deprecated Use formatDateFull instead */
export { formatDateFull as formatLongDate };

/** @deprecated Use getDifferenceInDays instead */
export { getDifferenceInDays as diffInDays };

/** @deprecated Use isSameDate instead */
export { isSameDate as isSameDayDate };

/** @deprecated Use parseExcelDate instead */
export { parseExcelDate as excelDateToJSDate };
