import { z, ZodError } from "zod";
import type { NextApiResponse } from "next";
import type { AuthenticatedRequest } from "../auth/auth-middleware";
import { ErrorCodes } from "./api-errors";

/**
 * Validation utility for API routes
 * Provides type-safe request validation using Zod schemas
 * Updated for standard API response format
 */

export interface ValidationError {
	field: string;
	message: string;
}

/**
 * Validates request body against a Zod schema
 * Returns validation errors if invalid, null if valid
 */
export function validateBody<T extends z.ZodSchema>(
	body: unknown,
	schema: T,
): ValidationError[] | null {
	try {
		schema.parse(body);
		return null;
	} catch (error) {
		if (error instanceof ZodError) {
			return error.errors.map((err) => ({
				field: err.path.join("."),
				message: err.message,
			}));
		}
		return [{ field: "body", message: "Invalid request body" }];
	}
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T extends z.ZodSchema>(
	query: unknown,
	schema: T,
): ValidationError[] | null {
	try {
		schema.parse(query);
		return null;
	} catch (error) {
		if (error instanceof ZodError) {
			return error.errors.map((err) => ({
				field: err.path.join("."),
				message: err.message,
			}));
		}
		return [{ field: "query", message: "Invalid query parameters" }];
	}
}

/**
 * Sends validation error response (Pages Router)
 * @deprecated Use errors.validation() from api-response.ts for App Router
 */
export function sendValidationError(
	res: NextApiResponse,
	errors: ValidationError[],
): void {
	res.status(422).json({
		success: false,
		error: {
			code: ErrorCodes.VALIDATION_ERROR,
			message: "Validation failed",
			details: errors,
		},
	});
}

/**
 * Helper to parse and validate request body with type inference
 */
export async function parseBody<T extends z.ZodSchema>(
	req: AuthenticatedRequest,
	res: NextApiResponse,
	schema: T,
): Promise<z.infer<T> | null> {
	try {
		const body = await req.body;
		const result = schema.parse(body);
		return result;
	} catch (error) {
		if (error instanceof ZodError) {
			const errors = error.errors.map((err) => ({
				field: err.path.join("."),
				message: err.message,
			}));
			sendValidationError(res, errors);
			return null;
		}
		res.status(400).json({
			success: false,
			error: {
				code: ErrorCodes.INVALID_REQUEST_FORMAT,
				message: "Invalid request body",
			},
		});
		return null;
	}
}

/**
 * Helper to validate request query parameters
 */
export function validateRequestQuery<T extends z.ZodSchema>(
	query: Record<string, unknown>,
	schema: T,
): z.infer<T> | null {
	try {
		return schema.parse(query);
	} catch {
		return null;
	}
}

// ==================== Common Validation Schemas ====================

// Pagination schema
export const paginationSchema = z.object({
	page: z.union([z.string(), z.number()]).optional().default(1),
	limit: z.union([z.string(), z.number()]).optional().default(10),
	search: z.string().optional(),
});

// Date range schema
export const dateRangeSchema = z.object({
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

// ID parameter schema
export const idParamSchema = z.object({
	id: z.string().min(1, "ID is required"),
});

// Account ID schema
export const accountIdSchema = z.object({
	id: z.string().min(1, "Account ID is required"),
});

// ==================== Type Exports ====================

export type { AuthenticatedRequest };

// ==================== App Router Validation Helpers ====================

import { errors } from "./api-response";
import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "./api-types";

/**
 * Validates data against a Zod schema and returns validation errors
 * for use with App Router api-response helpers
 */
export function validateSchema<T extends z.ZodSchema>(
	data: unknown,
	schema: T,
):
	| { success: true; data: z.infer<T> }
	| { success: false; errors: ValidationError[] } {
	const result = schema.safeParse(data);

	if (result.success) {
		return { success: true, data: result.data };
	}

	const validationErrors = result.error.errors.map((err) => ({
		field: err.path.join("."),
		message: err.message,
	}));

	return { success: false, errors: validationErrors };
}

/**
 * Creates a standard validation error response for App Router
 */
export function createValidationErrorResponse(
	validationErrors: ValidationError[],
): NextResponse<ApiErrorResponse> {
	return errors.validation(validationErrors);
}
/**
 * Smart Validation - Detect duplicates, unreasonable values, invalid inputs
 * Task 39: Smart Validation
 */

import { roundAmount } from "@/lib/accounting/accounting-validation";
import prisma from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

export interface SmartValidationResult {
	isValid: boolean;
	warnings: SmartWarning[];
	errors: SmartError[];
}

export interface SmartWarning {
	type: "DUPLICATE" | "UNREASONABLE" | "SUSPICIOUS";
	field: string;
	message: string;
	severity: "low" | "medium" | "high";
}

export interface SmartError {
	type:
		| "INVALID_FORMAT"
		| "INVALID_DATE"
		| "INVALID_ACCOUNT"
		| "INVALID_AMOUNT";
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
	options: DuplicateCheckOptions = {},
): Promise<{
	isDuplicate: boolean;
	existingTransactions?: ExistingTransaction[];
}> {
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
			status: { in: ["approved", "posted"] },
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
			journal.entries.map((e) => ({
				kodeAkun: e.kodeAkun,
				debit: e.debit,
				kredit: e.kredit,
			})),
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
	entries: Array<{ kodeAkun: string; debit: number; kredit: number }>,
): string {
	// Sort by account code for consistent comparison
	const sorted = [...entries].sort((a, b) =>
		a.kodeAkun.localeCompare(b.kodeAkun),
	);

	// Create signature string
	return sorted
		.map(
			(e) => `${e.kodeAkun}:${roundAmount(e.debit)}:${roundAmount(e.kredit)}`,
		)
		.join("|");
}

// ============================================================================
// Unreasonable Value Detection
// ============================================================================

/**
 * Check for unreasonable transaction values
 */
export function detectUnreasonableValues(
	entries: Array<{
		kodeAkun: string;
		debit: number;
		kredit: number;
		keterangan?: string;
	}>,
): SmartWarning[] {
	const warnings: SmartWarning[] = [];

	for (const entry of entries) {
		const amount = Math.max(entry.debit || 0, entry.kredit || 0);
		const roundedAmount = roundAmount(amount);

		// Check for extremely large amounts
		if (roundedAmount > MAX_REASONABLE_AMOUNT) {
			warnings.push({
				type: "UNREASONABLE",
				field: `entries.${entry.kodeAkun}`,
				message: `Nilai transaksi sangat besar (${roundedAmount.toLocaleString("id-ID")}). Mohon periksa kembali.`,
				severity: "high",
			});
		}

		// Check for suspiciously small amounts
		if (roundedAmount > 0 && roundedAmount < MIN_SUSPICIOUS_AMOUNT) {
			warnings.push({
				type: "SUSPICIOUS",
				field: `entries.${entry.kodeAkun}`,
				message: `Nilai transaksi sangat kecil (${roundedAmount.toLocaleString("id-ID")}). Apakah ini disengaja?`,
				severity: "low",
			});
		}

		// Check for round numbers that might be errors (e.g., exactly 1,000,000)
		if (
			roundedAmount > 100000 &&
			roundedAmount % 100000 === 0 &&
			roundedAmount % 1000000 !== 0
		) {
			warnings.push({
				type: "SUSPICIOUS",
				field: `entries.${entry.kodeAkun}`,
				message: `Nilai ini adalah angka bulat (${roundedAmount.toLocaleString("id-ID")}). Pastikan ini bukan kesalahan input.`,
				severity: "medium",
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
				type: "INVALID_DATE",
				field: "tanggal",
				message: "Format tanggal tidak valid. Gunakan format YYYY-MM-DD",
			});
		} else {
			const parsed = new Date(data.tanggal);
			if (isNaN(parsed.getTime())) {
				errors.push({
					type: "INVALID_DATE",
					field: "tanggal",
					message: "Tanggal tidak valid",
				});
			}

			// Check for future dates
			const today = new Date();
			today.setHours(23, 59, 59, 999);
			if (parsed > today) {
				warnings.push({
					type: "SUSPICIOUS",
					field: "tanggal",
					message: "Tanggal transaksi di masa depan",
					severity: "medium",
				});
			}
		}
	}

	// Validate keterangan
	if (data.keterangan) {
		if (data.keterangan.length < 3) {
			errors.push({
				type: "INVALID_FORMAT",
				field: "keterangan",
				message: "Keterangan terlalu pendek",
			});
		}

		if (data.keterangan.length > 500) {
			errors.push({
				type: "INVALID_FORMAT",
				field: "keterangan",
				message: "Keterangan terlalu panjang (maksimal 500 karakter)",
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
					type: "SUSPICIOUS",
					field: "keterangan",
					message: "Keterangan mencurigakan, mohon periksa",
					severity: "low",
				});
			}
		}
	}

	// Validate entries
	if (data.entries && data.entries.length > 0) {
		// Check minimum entries (need at least 2 for double-entry)
		if (data.entries.length < 2) {
			errors.push({
				type: "INVALID_FORMAT",
				field: "entries",
				message: "Minimal harus ada 2 entri untuk sistem double-entry",
			});
		}

		// Check for duplicate account codes
		const accountCodes = data.entries.map((e) => e.kodeAkun);
		const uniqueCodes = new Set(accountCodes);

		if (accountCodes.length !== uniqueCodes.size) {
			const duplicates = accountCodes.filter(
				(code, index) => accountCodes.indexOf(code) !== index,
			);
			warnings.push({
				type: "SUSPICIOUS",
				field: "entries",
				message: `Akun duplikat ditemukan: ${[...new Set(duplicates)].join(", ")}`,
				severity: "medium",
			});
		}

		// Validate each entry
		for (let i = 0; i < data.entries.length; i++) {
			const entry = data.entries[i];

			if (!entry.kodeAkun) {
				errors.push({
					type: "INVALID_ACCOUNT",
					field: `entries[${i}].kodeAkun`,
					message: `Kode akun wajib diisi`,
				});
			}

			// Validate amounts
			const debit = entry.debit ?? 0;
			const kredit = entry.kredit ?? 0;

			if (debit < 0 || kredit < 0) {
				errors.push({
					type: "INVALID_AMOUNT",
					field: `entries[${i}]`,
					message: "Nilai tidak boleh negatif",
				});
			}

			if (debit > 0 && kredit > 0) {
				errors.push({
					type: "INVALID_AMOUNT",
					field: `entries[${i}]`,
					message: "Tidak boleh memiliki nilai Debit dan Kredit sekaligus",
				});
			}

			if (debit === 0 && kredit === 0) {
				errors.push({
					type: "INVALID_AMOUNT",
					field: `entries[${i}]`,
					message: "Minimal nilai Debit atau Kredit harus lebih dari 0",
				});
			}
		}
	} else {
		errors.push({
			type: "INVALID_FORMAT",
			field: "entries",
			message: "Entri transaksi wajib diisi",
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
		entries: Array<{
			kodeAkun: string;
			debit: number;
			kredit: number;
			keterangan?: string;
		}>;
	},
	options: {
		checkDuplicates?: boolean;
		excludeIds?: string[];
	} = {},
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
			{ excludeIds },
		);

		if (duplicateResult.isDuplicate && duplicateResult.existingTransactions) {
			const existing = duplicateResult.existingTransactions[0];
			duplicateWarning = {
				type: "DUPLICATE",
				field: "transaction",
				message: `Transaksi疑似 duplikat dengan ${existing.reference} pada ${new Date(existing.tanggal).toLocaleDateString("id-ID")}`,
				severity: "high",
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
	const criticalErrors = inputValidation.errors.filter(
		(e) => e.type !== "INVALID_FORMAT" || e.field !== "entries",
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
	}>,
): Promise<{
	valid: number;
	invalid: number;
	results: Array<{
		id?: string;
		status: "valid" | "invalid" | "warning";
		result: SmartValidationResult;
	}>;
}> {
	const results: Array<{
		id?: string;
		status: "valid" | "invalid" | "warning";
		result: SmartValidationResult;
	}> = [];

	let valid = 0;
	let invalid = 0;

	for (const tx of transactions) {
		const result = await smartValidateTransaction(tx, {
			excludeIds: tx.id ? [tx.id] : [],
		});

		let status: "valid" | "invalid" | "warning" = "valid";

		if (!result.isValid) {
			status = "invalid";
			invalid++;
		} else if (result.warnings.length > 0) {
			status = "warning";
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
