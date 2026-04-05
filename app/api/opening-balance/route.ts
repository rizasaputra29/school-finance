/**
 * Opening Balance API
 * Supports initial balance from old system using journal entries:
 * - Debit: Aset accounts
 * - Kredit: Ekuitas Saldo Awal (3201)
 * - Only one opening balance per period/year
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	formatPeriode,
	roundAmount,
} from "@/lib/accounting/accounting-validation";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

type PrismaTransactionClient = Parameters<
	Parameters<typeof prisma.$transaction>[0]
>[0];

// ============================================================================
// Constants
// ============================================================================

const EQUITAS_SALDO_AWAL_ACCOUNT = "3201";
const OPENING_BALANCE_REFERENCE_PREFIX = "OB-";

// ============================================================================
// Validation Schemas
// ============================================================================

const openingBalanceEntrySchema = z.object({
	kodeAkun: z.string().min(1, "Kode akun wajib diisi"),
	debit: z.number().min(0, "Debit tidak boleh negatif").default(0),
	kredit: z.number().min(0, "Kredit tidak boleh negatif").default(0),
});

const createOpeningBalanceSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	entries: z
		.array(openingBalanceEntrySchema)
		.min(1, "Minimal harus ada 1 entri aset"),
	periode: z.string().optional(), // Format: YYYY-MM or YYYY (year)
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if opening balance already exists for a period
 */
async function checkOpeningBalanceExists(
	tx: PrismaTransactionClient,
	periode: string,
): Promise<{
	exists: boolean;
	existingEntry?: { id: string; reference: string };
}> {
	const existing = await tx.journalEntry.findFirst({
		where: {
			reference: { startsWith: OPENING_BALANCE_REFERENCE_PREFIX },
			status: { in: ["draft", "approved", "posted"] },
		},
	});

	if (existing) {
		// Check if it's for the same period
		const entryPeriode = formatPeriode(existing.tanggal);
		if (entryPeriode === periode) {
			return {
				exists: true,
				existingEntry: { id: existing.id, reference: existing.reference || "" },
			};
		}
	}

	return { exists: false };
}

/**
 * Validate that entries are for Asset accounts (debit) and can be balanced
 */
function validateOpeningBalanceEntries(
	entries: Array<{ kodeAkun: string; debit: number; kredit: number }>,
): {
	isValid: boolean;
	errors: Array<{ field: string; message: string }>;
} {
	const errors: Array<{ field: string; message: string }> = [];
	let hasAssetEntry = false;
	let totalDebit = 0;
	let totalKredit = 0;

	for (const entry of entries) {
		totalDebit += entry.debit;
		totalKredit += entry.kredit;

		// At least one entry should have debit (asset)
		if (entry.debit > 0) {
			hasAssetEntry = true;
		}

		// Validate: either debit or kredit, not both
		if (entry.debit > 0 && entry.kredit > 0) {
			errors.push({
				field: `entries.${entries.indexOf(entry)}.kodeAkun`,
				message: "Entri tidak boleh memiliki nilai debit dan kredit sekaligus",
			});
		}
	}

	// Must have at least one asset entry
	if (!hasAssetEntry) {
		errors.push({
			field: "entries",
			message: "Minimal harus ada 1 entri dengan debit (akun Aset)",
		});
	}

	// Check balance: totalDebit should equal totalKredit (will be balanced with Ekuitas Saldo Awal)
	// For now, we just need totalDebit > 0
	if (totalDebit <= 0 && totalKredit <= 0) {
		errors.push({
			field: "entries",
			message: "Total saldo tidak boleh 0",
		});
	}

	return { isValid: errors.length === 0, errors };
}

/**
 * Generate opening balance reference number
 */
async function generateOpeningBalanceReference(
	tx: PrismaTransactionClient,
): Promise<string> {
	const tahun = new Date().getFullYear();
	const prefix = `${OPENING_BALANCE_REFERENCE_PREFIX}${tahun}-`;

	const latest = await tx.journalEntry.findFirst({
		where: {
			reference: { startsWith: OPENING_BALANCE_REFERENCE_PREFIX },
		},
		orderBy: { reference: "desc" },
	});

	let sequence = 1;
	if (latest && latest.reference) {
		const lastSeq = parseInt(latest.reference.split("-")[2] || "0", 10);
		sequence = lastSeq + 1;
	}

	return `${prefix}${sequence.toString().padStart(4, "0")}`;
}

/**
 * Log audit trail
 */
async function logAudit(
	tx: PrismaTransactionClient,
	action: string,
	entity: string,
	entityId: string,
	userId: string | undefined,
	oldData?: unknown,
	newData?: unknown,
): Promise<void> {
	try {
		await tx.auditTrail.create({
			data: {
				action,
				entity,
				entityId,
				oldData: oldData ? JSON.stringify(oldData) : undefined,
				newData: newData ? JSON.stringify(newData) : undefined,
				userId,
			},
		});
	} catch (error) {
		console.error("Failed to create audit trail:", error);
	}
}

// ============================================================================
// API Handlers
// ============================================================================

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const periode = searchParams.get("periode");

				const where: Record<string, unknown> = {
					reference: { startsWith: OPENING_BALANCE_REFERENCE_PREFIX },
				};

				if (periode) {
					// Filter by period
					const startDate = new Date(`${periode}-01`);
					const endDate = new Date(periode);
					endDate.setMonth(endDate.getMonth() + 1);

					where.tanggal = {
						gte: startDate,
						lt: endDate,
					};
				}

				const openingBalances = await prisma.journalEntry.findMany({
					where,
					include: {
						entries: {
							include: {
								account: {
									select: { namaAkun: true, tipeAkun: true },
								},
							},
						},
					},
					orderBy: { createdAt: "desc" },
				});

				return success(openingBalances, {
					message: "Data saldo awal berhasil diambil",
					meta: { count: openingBalances.length },
				});
			} catch (error) {
				console.error("Opening Balance API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user) => {
			try {
				const body = await request.json();

				// Create opening balance
				const validation = createOpeningBalanceSchema.safeParse(body);
				if (!validation.success) {
					return errors.validation(
						validation.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const { tanggal, entries, periode: requestedPeriode } = validation.data;

				// Determine the period
				const transactionDate = new Date(tanggal);
				const transactionPeriode =
					requestedPeriode || formatPeriode(transactionDate);

				// Validate entries
				const entryValidation = validateOpeningBalanceEntries(entries);
				if (!entryValidation.isValid) {
					return errors.validation(entryValidation.errors);
				}

				// Calculate totals
				const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);

				// Validate in transaction
				const result = await prisma.$transaction(async (tx) => {
					// Check if opening balance already exists for this period
					const { exists, existingEntry } = await checkOpeningBalanceExists(
						tx,
						transactionPeriode,
					);

					if (exists) {
						throw new Error(
							`Saldo awal untuk periode ${transactionPeriode} sudah ada (${existingEntry?.reference}). ` +
								`Hanya diperbolehkan satu saldo awal per periode.`,
						);
					}

					// Verify Ekuitas Saldo Awal account exists
					const equityAccount = await tx.account.findUnique({
						where: { kodeAkun: EQUITAS_SALDO_AWAL_ACCOUNT },
					});

					if (!equityAccount) {
						throw new Error(
							`Akun Ekuitas Saldo Awal (${EQUITAS_SALDO_AWAL_ACCOUNT}) tidak ditemukan`,
						);
					}

					// Verify all asset accounts exist
					for (const entry of entries) {
						const account = await tx.account.findUnique({
							where: { kodeAkun: entry.kodeAkun },
						});

						if (!account) {
							throw new Error(
								`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`,
							);
						}

						// Validate that account is Asset type for debit entries
						if (entry.debit > 0 && account.tipeAkun !== "Asset") {
							throw new Error(
								`Akun ${entry.kodeAkun} (${account.namaAkun}) bukan akun Aset. ` +
									`Entri debit harus menggunakan akun Aset.`,
							);
						}

						// Validate that account is Equity type for credit entries
						if (entry.kredit > 0 && account.tipeAkun !== "Equity") {
							throw new Error(
								`Akun ${entry.kodeAkun} (${account.namaAkun}) bukan akun Ekuitas. ` +
									`Entri kredit harus menggunakan akun Ekuitas.`,
							);
						}
					}

					// Generate reference number
					const reference = await generateOpeningBalanceReference(tx);

					// Create journal entry
					const journal = await tx.journalEntry.create({
						data: {
							tanggal: transactionDate,
							keterangan: `Saldo Awal Periode ${transactionPeriode}`,
							reference,
							status: "approved", // Auto-approve for opening balance
							version: 1,
							isBackdated: false,
							adjustmentType: "regular",
						},
					});

					// Create journal lines for asset entries (debit)
					const createdEntries = [];
					for (const entry of entries) {
						if (entry.debit > 0 || entry.kredit > 0) {
							const line = await tx.journalEntryLine.create({
								data: {
									journalEntryId: journal.id,
									kodeAkun: entry.kodeAkun,
									debit: roundAmount(entry.debit),
									kredit: roundAmount(entry.kredit),
								},
							});
							createdEntries.push(line);
						}
					}

					// Add closing entry: Kredit to Ekuitas Saldo Awal (to balance)
					const closingEntry = await tx.journalEntryLine.create({
						data: {
							journalEntryId: journal.id,
							kodeAkun: EQUITAS_SALDO_AWAL_ACCOUNT,
							debit: 0,
							kredit: roundAmount(totalDebit), // Balance with total debit
						},
					});

					// Update account balances in parallel - Debit asset accounts
					const accountUpdates = entries
						.filter((entry) => entry.debit > 0)
						.map((entry) =>
							tx.account.update({
								where: { kodeAkun: entry.kodeAkun },
								data: {
									saldo: { increment: roundAmount(entry.debit) },
								},
							}),
						);

					// Add Ekuitas Saldo Awal update
					accountUpdates.push(
						tx.account.update({
							where: { kodeAkun: EQUITAS_SALDO_AWAL_ACCOUNT },
							data: {
								saldo: { increment: roundAmount(totalDebit) },
							},
						}),
					);

					await Promise.all(accountUpdates);

					// Create cashflow records using createMany for better performance
					const periode = formatPeriode(transactionDate);
					const cashflowData: Prisma.CashflowCreateManyInput[] = entries
						.filter((entry) => entry.debit > 0 || entry.kredit > 0)
						.map((entry) => ({
							tanggal: transactionDate,
							keterangan: `Saldo Awal - ${entry.kodeAkun}`,
							kodeAkun: entry.kodeAkun,
							kategori: "opening_balance",
							debit: roundAmount(entry.debit),
							kredit: roundAmount(entry.kredit),
							source: "kas",
							status: "posted",
							periode,
							version: 1,
						}));

					// Add Ekuitas Saldo Awal cashflow
					cashflowData.push({
						tanggal: transactionDate,
						keterangan: `Saldo Awal - ${EQUITAS_SALDO_AWAL_ACCOUNT}`,
						kodeAkun: EQUITAS_SALDO_AWAL_ACCOUNT,
						kategori: "opening_balance",
						debit: 0,
						kredit: roundAmount(totalDebit),
						source: "kas",
						status: "posted",
						periode,
						version: 1,
					});

					await tx.cashflow.createMany({
						data: cashflowData,
					});

					// Audit trail
					await logAudit(
						tx,
						"create",
						"opening_balance",
						journal.id,
						user.id,
						undefined,
						{
							reference,
							tanggal,
							periode: transactionPeriode,
							totalDebit: roundAmount(totalDebit),
							totalKredit: roundAmount(totalDebit),
							entryCount: entries.length + 1, // +1 for closing entry
						},
					);

					return {
						journal,
						entries: createdEntries,
						closingEntry,
					};
				});

				return success(
					{
						id: result.journal.id,
						reference: result.journal.reference,
						tanggal: result.journal.tanggal,
						keterangan: result.journal.keterangan,
						status: result.journal.status,
						periode: transactionPeriode,
						entries: [
							...result.entries.map((e) => ({
								kodeAkun: e.kodeAkun,
								debit: e.debit,
								kredit: e.kredit,
							})),
							{
								kodeAkun: EQUITAS_SALDO_AWAL_ACCOUNT,
								debit: 0,
								kredit: roundAmount(totalDebit),
							},
						],
						totalDebit: roundAmount(totalDebit),
						totalKredit: roundAmount(totalDebit),
					},
					{
						message: `Saldo awal berhasil dibuat untuk periode ${transactionPeriode}`,
						status: 201,
					},
				);
			} catch (error) {
				console.error("Opening Balance API error:", error);
				const message =
					error instanceof Error ? error.message : "Unknown error";

				// Handle specific error codes
				if (message.includes("sudah ada")) {
					return errors.conflict(message);
				}

				if (message.includes("tidak ditemukan")) {
					return errors.notFound("Akun");
				}

				if (message.includes("bukan akun")) {
					return errors.validation([{ message }]);
				}

				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
