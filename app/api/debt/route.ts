import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	rateLimit,
	RATE_LIMITS,
	getClientIp,
	formatRateLimitError,
} from "@/lib/api/api-rate-limit";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";

type PrismaTransactionClient = Parameters<
	Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * Debt (Hutang) Management API
 *
 * Handles:
 * - Creating new debts with configurable tenor
 * - Recording debt payments
 * - Overdue debt detection
 * - Negative value storage for liability tracking
 */

// ==================== Validation Schemas ====================

// Schema for creating a new debt
const createDebtSchema = z.object({
	nama: z
		.string()
		.min(1, "Nama hutang wajib diisi")
		.max(200, "Nama maksimal 200 karakter"),
	kodeAkun: z.string().min(1, "Kode akun wajib diisi"),
	kodeAkunPembayaran: z.string().min(1, "Kode akun pembayaran wajib dipilih dari COA"),
	jumlahAwal: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseFloat(val) : val))
		.pipe(z.number().positive("Jumlah awal harus lebih dari 0")),
	tenor: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseInt(val) : val))
		.pipe(z.number().int().positive("Tenor minimal 1 bulan").min(1).max(360)),
	tanggalMulai: z.string().min(1, "Tanggal mulai wajib diisi"),
	cicilanPerBulan: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseFloat(val) : val))
		.pipe(z.number().min(0, "Cicilan per bulan tidak boleh negatif")),
	kreditur: z.string().optional(),
});

// Schema for debt payment
const debtPaymentSchema = z.object({
	debtId: z.string().min(1, "ID hutang wajib diisi"),
	jumlahPembayaran: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseFloat(val) : val))
		.pipe(z.number().positive("Jumlah pembayaran harus lebih dari 0")),
	kodeAkun: z.string().min(1, "Kode akun pembayaran wajib dipilih dari COA"),
	tanggalPembayaran: z.string().optional(),
	keterangan: z.string().optional(),
});

// ==================== Helper Functions ====================

/**
 * Calculate due date from start date and tenor
 */
function calculateDueDate(tanggalMulai: Date, tenor: number): Date {
	const dueDate = new Date(tanggalMulai);
	dueDate.setMonth(dueDate.getMonth() + tenor);
	return dueDate;
}

/**
 * Check if debt is overdue
 */
function isOverdue(tanggalJatuhTempo: Date): boolean {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const dueDate = new Date(tanggalJatuhTempo);
	dueDate.setHours(0, 0, 0, 0);
	return today > dueDate;
}

/**
 * Process debt creation with double-entry bookkeeping
 * Debit: Kas (asset increase from receiving debt proceeds)
 * Credit: Hutang (liability increase)
 */
async function processDebtCreation(
	tx: PrismaTransactionClient,
	debtData: {
		nama: string;
		kodeAkun: string;
		kodeAkunPembayaran: string;
		jumlahAwal: number;
		tanggalMulai: Date;
		tanggalJatuhTempo: Date;
		cicilanPerBulan: number;
		kreditur?: string;
	},
) {
	// Validate cash/bank account exists and is an Asset account
	const cashAccount = debtData.kodeAkunPembayaran;
	const cashAccountRecord = await tx.account.findUnique({
		where: { kodeAkun: cashAccount },
	});
	if (!cashAccountRecord) {
		throw new Error(
			`Akun pembayaran dengan kode ${cashAccount} tidak ditemukan`,
		);
	}
	if (cashAccountRecord.tipeAkun !== "Asset") {
		throw new Error(`Akun pembayaran ${cashAccount} harus bertipe Asset`);
	}

	// Create the debt record with negative value for liability
	const debt = await tx.debt.create({
		data: {
			nama: debtData.nama,
			kodeAkun: debtData.kodeAkun,
			jumlahAwal: debtData.jumlahAwal,
			jumlahSisa: -Math.abs(debtData.jumlahAwal), // Store as negative (liability)
			tenor: Math.ceil(debtData.jumlahAwal / debtData.cicilanPerBulan),
			tanggalMulai: debtData.tanggalMulai,
			tanggalJatuhTempo: debtData.tanggalJatuhTempo,
			cicilanPerBulan: debtData.cicilanPerBulan,
			status: "Aktif",
		},
	});

	// Create journal entry for proper double-entry bookkeeping
	const transactionKeterangan = `${debtData.nama} - Penerimaan Pinjaman`;
	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal: debtData.tanggalMulai,
			keterangan: transactionKeterangan,
			reference: `debt-creation-${debt.id}`,
		},
	});

	await tx.journalEntryLine.create({
		data: {
			journalEntryId: journalEntry.id,
			kodeAkun: cashAccount,
			debit: debtData.jumlahAwal,
			kredit: 0,
		},
	});

	await tx.journalEntryLine.create({
		data: {
			journalEntryId: journalEntry.id,
			kodeAkun: debtData.kodeAkun,
			debit: 0,
			kredit: debtData.jumlahAwal,
		},
	});

	// Create cashflow entries for double-entry:
	// Kas (Debit) - Receive money from debt
	// Hutang (Kredit) - Record liability
	const isBank = cashAccountRecord.namaAkun.toLowerCase().includes("bank");
	await tx.cashflow.create({
		data: {
			tanggal: debtData.tanggalMulai,
			keterangan: transactionKeterangan,
			kodeAkun: cashAccount,
			kategori: "hutang",
			cashflowCategory: "FIN",
			debit: debtData.jumlahAwal,
			kredit: 0,
			source: isBank ? "bank" : "kas",
			referenceId: journalEntry.id,
		},
	} as never);

	await tx.cashflow.create({
		data: {
			tanggal: debtData.tanggalMulai,
			keterangan: transactionKeterangan,
			kodeAkun: debtData.kodeAkun,
			kategori: "hutang",
			cashflowCategory: "FIN",
			debit: 0,
			kredit: debtData.jumlahAwal,
			referenceId: journalEntry.id,
		},
	} as never);

	// Update account balances
	const liabilityAccount = await tx.account.findUnique({
		where: { kodeAkun: debtData.kodeAkun },
	});

	if (cashAccountRecord) {
		const cashChange = computeSaldoChange(
			cashAccountRecord,
			debtData.jumlahAwal,
			0,
		);
		await tx.account.update({
			where: { kodeAkun: cashAccount },
			data: { saldo: { increment: cashChange } },
		});
	}

	if (liabilityAccount && liabilityAccount.tipeAkun === "Liability") {
		const liabilityChange = computeSaldoChange(
			liabilityAccount,
			0,
			debtData.jumlahAwal,
		);
		await tx.account.update({
			where: { kodeAkun: debtData.kodeAkun },
			data: { saldo: { increment: liabilityChange } },
		});
	}

	// Update AccountBalance snapshots for the debt creation year
	const academicYearForDebt = await tx.academicYear.findFirst({
		where: {
			tanggalMulai: { lte: debtData.tanggalMulai },
			tanggalSelesai: { gte: debtData.tanggalMulai },
		},
	});

	if (academicYearForDebt) {
		const accountsToBalance = [
			{
				kodeAkun: cashAccount,
				tipeAkun: cashAccountRecord?.tipeAkun,
				debit: debtData.jumlahAwal,
				kredit: 0,
			},
			{
				kodeAkun: debtData.kodeAkun,
				tipeAkun: liabilityAccount?.tipeAkun,
				debit: 0,
				kredit: debtData.jumlahAwal,
			},
		];

		for (const acct of accountsToBalance) {
			if (!acct.tipeAkun) continue;
			const saldoChange = computeSaldoChange(
				{ kodeAkun: acct.kodeAkun, tipeAkun: acct.tipeAkun },
				acct.debit,
				acct.kredit,
			);

			await tx.accountBalance
				.upsert({
					where: {
						kodeAkun_academicYearId: {
							kodeAkun: acct.kodeAkun,
							academicYearId: academicYearForDebt.id,
						},
					},
					update: { saldo: { increment: saldoChange } },
					create: {
						kodeAkun: acct.kodeAkun,
						academicYearId: academicYearForDebt.id,
						saldo: saldoChange,
					},
				})
				.catch(() => {});
		}
	}

	return debt;
}

/**
 * Process debt payment with double-entry bookkeeping
 * Debit: Hutang (reduce liability)
 * Credit: Kas (reduce asset)
 */
async function processDebtPayment(
	tx: PrismaTransactionClient,
	paymentData: {
		debtId: string;
		jumlahPembayaran: number;
		kodeAkun: string;
		tanggalPembayaran: Date;
		keterangan?: string;
	},
) {
	// Validate payment account exists in COA
	const paymentAccountCode = paymentData.kodeAkun;
	const paymentAccount = await tx.account.findUnique({
		where: { kodeAkun: paymentAccountCode },
	});
	if (!paymentAccount) {
		throw new Error(`Akun pembayaran dengan kode ${paymentAccountCode} tidak ditemukan`);
	}
	if (paymentAccount.tipeAkun !== "Asset") {
		throw new Error(`Akun pembayaran ${paymentAccountCode} harus bertipe Asset`);
	}

	// Get existing debt
	const existingDebt = await tx.debt.findUnique({
		where: { id: paymentData.debtId },
	});

	if (!existingDebt) {
		throw new Error("Hutang tidak ditemukan");
	}

	// Calculate new remaining balance (stored as negative)
	const newJumlahSisa = existingDebt.jumlahSisa + paymentData.jumlahPembayaran;
	const isPaidOff = newJumlahSisa >= 0;

	// Determine payment amount for cashflow (positive value for display)
	const paymentAmount = Math.min(
		paymentData.jumlahPembayaran,
		Math.abs(existingDebt.jumlahSisa),
	);

	// Update debt record
	const updatedDebt = await tx.debt.update({
		where: { id: paymentData.debtId },
		data: {
			jumlahSisa: newJumlahSisa,
			status: isPaidOff ? "Lunas" : "Aktif",
		},
	});

	// Create journal entry for proper double-entry bookkeeping
	const transactionKeterangan =
		paymentData.keterangan || `${existingDebt.nama} - Pembayaran Hutang`;
	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal: paymentData.tanggalPembayaran,
			keterangan: transactionKeterangan,
			reference: `debt-payment-${existingDebt.id}-${Date.now()}`,
		},
	});

	await tx.journalEntryLine.create({
		data: {
			journalEntryId: journalEntry.id,
			kodeAkun: existingDebt.kodeAkun,
			debit: paymentAmount,
			kredit: 0,
		},
	});

	await tx.journalEntryLine.create({
		data: {
			journalEntryId: journalEntry.id,
			kodeAkun: paymentAccountCode,
			debit: 0,
			kredit: paymentAmount,
		},
	});

	// Create cashflow entries for double-entry:
	// Hutang (Debit) - Reduce liability
	// Kas (Kredit) - Payment made
	const isBank = paymentAccount.namaAkun.toLowerCase().includes("bank");
	await tx.cashflow.create({
		data: {
			tanggal: paymentData.tanggalPembayaran,
			keterangan: transactionKeterangan,
			kodeAkun: existingDebt.kodeAkun,
			kategori: "hutang",
			cashflowCategory: "FIN",
			debit: paymentAmount,
			kredit: 0,
			referenceId: journalEntry.id,
		},
	} as never);

	await tx.cashflow.create({
		data: {
			tanggal: paymentData.tanggalPembayaran,
			keterangan: transactionKeterangan,
			kodeAkun: paymentAccountCode,
			kategori: "hutang",
			cashflowCategory: "FIN",
			debit: 0,
			kredit: paymentAmount,
			source: isBank ? "bank" : "kas",
			referenceId: journalEntry.id,
		},
	} as never);

	// Update account balances
	const [liabilityAccount, cashAccount] = await Promise.all([
		tx.account.findUnique({ where: { kodeAkun: existingDebt.kodeAkun } }),
		tx.account.findUnique({ where: { kodeAkun: paymentAccountCode } }),
	]);

	// Reduce liability balance
	if (liabilityAccount && liabilityAccount.tipeAkun === "Liability") {
		await tx.account.update({
			where: { kodeAkun: existingDebt.kodeAkun },
			data: { saldo: { decrement: paymentAmount } },
		});
	}

	// Reduce cash/bank balance
	if (cashAccount && cashAccount.tipeAkun === "Asset") {
		await tx.account.update({
			where: { kodeAkun: paymentAccountCode },
			data: { saldo: { decrement: paymentAmount } },
		});
	}

	// Update AccountBalance snapshots for the payment year
	const academicYearForPayment = await tx.academicYear.findFirst({
		where: {
			tanggalMulai: { lte: paymentData.tanggalPembayaran },
			tanggalSelesai: { gte: paymentData.tanggalPembayaran },
		},
	});

	if (academicYearForPayment) {
		const accountsToBalance = [
			{
				kodeAkun: existingDebt.kodeAkun,
				tipeAkun: liabilityAccount?.tipeAkun,
				debit: paymentAmount,
				kredit: 0,
			},
			{
				kodeAkun: paymentAccountCode,
				tipeAkun: cashAccount?.tipeAkun,
				debit: 0,
				kredit: paymentAmount,
			},
		];

		for (const acct of accountsToBalance) {
			if (!acct.tipeAkun) continue;
			const saldoChange = computeSaldoChange(
				{ kodeAkun: acct.kodeAkun, tipeAkun: acct.tipeAkun },
				acct.debit,
				acct.kredit,
			);

			await tx.accountBalance
				.upsert({
					where: {
						kodeAkun_academicYearId: {
							kodeAkun: acct.kodeAkun,
							academicYearId: academicYearForPayment.id,
						},
					},
					update: { saldo: { increment: saldoChange } },
					create: {
						kodeAkun: acct.kodeAkun,
						academicYearId: academicYearForPayment.id,
						saldo: saldoChange,
					},
				})
				.catch(() => {});
		}
	}

	return updatedDebt;
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const page = searchParams.get("page") || "1";
				const limit = searchParams.get("limit") || "10";
				const status = searchParams.get("status");
				const search = searchParams.get("search");
				const academicYearId = searchParams.get("academicYearId");

				const skip = (parseInt(page) - 1) * parseInt(limit);
				const where: Record<string, unknown> = {};

				// Carry-forward filter: debts started on or before the academic year end
				let academicYear: Awaited<
					ReturnType<typeof prisma.academicYear.findUnique>
				> = null;
				if (academicYearId) {
					academicYear = await prisma.academicYear.findUnique({
						where: { id: academicYearId },
					});
					if (academicYear) {
						where.tanggalMulai = { lte: academicYear.tanggalSelesai };
					}
				}

				// Filter by status
				if (status) {
					where.status = status;
				}

				// Search by nama or kreditur
				if (search) {
					where.OR = [
						{ nama: { contains: search, mode: "insensitive" } },
						{ kreditur: { contains: search, mode: "insensitive" } },
					];
				}

				const [debts, total] = await Promise.all([
					prisma.debt.findMany({
						where,
						orderBy: { createdAt: "desc" },
						skip,
						take: parseInt(limit),
						include: {
							account: true,
						},
					}),
					prisma.debt.count({ where }),
				]);

				// Compute per-academic-year values for each debt
				const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

				function computeDebtYearValues(debt: (typeof debts)[number]) {
					if (!academicYear) {
						return {
							computedSisa: Math.abs(debt.jumlahSisa),
							computedPaid: debt.jumlahAwal - Math.abs(debt.jumlahSisa),
							computedSisaTenor: debt.tenor,
							nextDueDate: debt.tanggalMulai,
							isOverdue:
								debt.status === "Aktif" && isOverdue(debt.tanggalJatuhTempo),
						};
					}

					const yearEnd = academicYear.tanggalSelesai;
					const startDate = debt.tanggalMulai;

					const monthsElapsed = Math.max(
						0,
						Math.floor(
							(yearEnd.getTime() - startDate.getTime()) / MS_PER_MONTH,
						),
					);

					const cicilanTerbayar = Math.min(monthsElapsed, debt.tenor);
					const totalDibayar = cicilanTerbayar * debt.cicilanPerBulan;
					const computedSisa = Math.max(0, debt.jumlahAwal - totalDibayar);
					const sisaTenor = Math.max(0, debt.tenor - cicilanTerbayar);

					const nextDue = new Date(startDate);
					nextDue.setMonth(nextDue.getMonth() + cicilanTerbayar);

					const nextDueEndOfMonth = new Date(nextDue);
					nextDueEndOfMonth.setMonth(nextDueEndOfMonth.getMonth() + 1);

					const overdue =
						sisaTenor > 0 &&
						debt.status === "Aktif" &&
						yearEnd > nextDueEndOfMonth;

					return {
						computedSisa,
						computedPaid: totalDibayar,
						computedSisaTenor: sisaTenor,
						nextDueDate: nextDue,
						isOverdue: overdue,
					};
				}

				// Apply carry-forward values and compute summary
				let summaryHutangAwal = 0;
				let summaryHutangSisa = 0;

				const debtsWithCarryForward = debts.map((debt) => {
					const computed = computeDebtYearValues(debt);
					summaryHutangAwal += debt.jumlahAwal;
					summaryHutangSisa += computed.computedSisa;

					return {
						...debt,
						jumlahSisaDisplay: computed.computedSisa,
						computedPaid: computed.computedPaid,
						computedSisaTenor: computed.computedSisaTenor,
						nextDueDate: computed.nextDueDate,
						isOverdue: computed.isOverdue,
					};
				});

				return success(debtsWithCarryForward, {
					message: "Debts retrieved successfully",
					meta: {
						pagination: {
							page: parseInt(page),
							limit: parseInt(limit),
							total,
							totalPages: Math.ceil(total / parseInt(limit)),
						},
						summary: {
							totalHutangAwal: summaryHutangAwal,
							totalHutangSisa: summaryHutangSisa,
						},
					},
				});
			} catch (error) {
				console.error("Debt API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const ip = getClientIp(request);

			try {
				const body = await request.json();

				// Determine if this is a payment or new debt creation
				const isPayment = body.debtId !== undefined;

				if (isPayment) {
					// Handle debt payment
					const rateLimitResult = rateLimit(
						`debt-payment:${ip}`,
						RATE_LIMITS.create,
					);
					if (!rateLimitResult.success) {
						return errors.rateLimit(formatRateLimitError(rateLimitResult), {
							"Retry-After": Math.ceil(
								(rateLimitResult.reset - Date.now()) / 1000,
							).toString(),
						});
					}

					const validationErrors = debtPaymentSchema.safeParse(body);
					if (!validationErrors.success) {
						return errors.validation(
							validationErrors.error.errors.map((err) => ({
								field: err.path.join("."),
								message: err.message,
							})),
						);
					}

				const {
					debtId,
					jumlahPembayaran,
					kodeAkun,
					tanggalPembayaran,
					keterangan,
				} = validationErrors.data;

				try {
					const result = await prisma.$transaction(async (tx) => {
						return processDebtPayment(tx, {
							debtId,
							jumlahPembayaran,
							kodeAkun,
							tanggalPembayaran: tanggalPembayaran
								? new Date(tanggalPembayaran)
								: new Date(),
							keterangan,
						});
					});

						return success(
							{
								...result,
								jumlahSisaDisplay: Math.abs(result.jumlahSisa),
							},
							{
								message:
									result.status === "Lunas"
										? "Hutang telah lunas"
										: "Pembayaran hutang berhasil",
								status: 201,
							},
						);
					} catch (error) {
						console.error("Debt payment error:", error);
						const message =
							error instanceof Error ? error.message : "Unknown error";
						return errors.badRequest(message);
					}
				} else {
					// Handle new debt creation
					const rateLimitResult = rateLimit(
						`debt-create:${ip}`,
						RATE_LIMITS.create,
					);
					if (!rateLimitResult.success) {
						return errors.rateLimit(formatRateLimitError(rateLimitResult), {
							"Retry-After": Math.ceil(
								(rateLimitResult.reset - Date.now()) / 1000,
							).toString(),
						});
					}

					const validationErrors = createDebtSchema.safeParse(body);
					if (!validationErrors.success) {
						return errors.validation(
							validationErrors.error.errors.map((err) => ({
								field: err.path.join("."),
								message: err.message,
							})),
						);
					}

					const {
						nama,
						kodeAkun,
						kodeAkunPembayaran,
						jumlahAwal,
						tenor,
						tanggalMulai,
						cicilanPerBulan,
						kreditur,
					} = validationErrors.data;

					// Validate account exists and is a liability account
					const [account, paymentAccount] = await Promise.all([
						prisma.account.findUnique({ where: { kodeAkun } }),
						prisma.account.findUnique({ where: { kodeAkun: kodeAkunPembayaran } }),
					]);

					if (!account) {
						return errors.notFound(`Akun dengan kode ${kodeAkun}`);
					}

					if (account.tipeAkun !== "Liability") {
						return errors.validation([
							{
								field: "kodeAkun",
								message: "Akun hutang harus bertipe Liability",
							},
						]);
					}

					if (!paymentAccount) {
						return errors.notFound(
							`Akun pembayaran dengan kode ${kodeAkunPembayaran}`,
						);
					}

					if (paymentAccount.tipeAkun !== "Asset") {
						return errors.validation([
							{
								field: "kodeAkunPembayaran",
								message: "Akun pembayaran harus bertipe Asset",
							},
						]);
					}

					const tanggalMulaiDate = new Date(tanggalMulai);
					const tanggalJatuhTempo = calculateDueDate(tanggalMulaiDate, tenor);

					try {
						const result = await prisma.$transaction(async (tx) => {
							return processDebtCreation(tx, {
								nama,
								kodeAkun,
								kodeAkunPembayaran,
								jumlahAwal,
								tanggalMulai: tanggalMulaiDate,
								tanggalJatuhTempo,
								cicilanPerBulan,
								kreditur,
							});
						});

						return success(
							{
								...result,
								jumlahSisaDisplay: Math.abs(result.jumlahSisa),
							},
							{
								message: "Hutang berhasil dibuat",
								status: 201,
							},
						);
					} catch (error) {
						console.error("Debt creation error:", error);
						const message =
							error instanceof Error ? error.message : "Unknown error";
						return errors.badRequest(message);
					}
				}
			} catch (error) {
				console.error("Debt API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
