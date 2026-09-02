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
import { invalidateAccountsCache } from "@/lib/utils/utils-cache";
import {
	getIdempotencyResult,
	setIdempotencyResult,
	getIdempotencyKeyFromRequest,
	isValidIdempotencyKey,
} from "@/lib/utils/utils-idempotency";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	getNormalBalanceByType,
	computeSaldoChange,
} from "@/lib/accounting/accounting-chart-of-accounts";
import { computeLabaRugiForYear } from "@/lib/accounting/accounting-laba-rugi";

// Validation schemas
const createAccountSchema = z.object({
	kodeAkun: z
		.string()
		.min(1, "Kode akun wajib diisi")
		.max(20, "Kode akun maksimal 20 karakter"),
	namaAkun: z
		.string()
		.min(1, "Nama akun wajib diisi")
		.max(100, "Nama akun maksimal 100 karakter"),
	tipeAkun: z.enum(["Asset", "Liability", "Equity", "Revenue", "Expense"], {
		errorMap: () => ({ message: "Tipe akun tidak valid" }),
	}),
	kategori: z.string().optional(),
	saldo: z.union([z.number(), z.string()]).optional().default(0),
});

// Bank account validation - only one bank account allowed
async function validateBankAccount(
	kodeAkun: string,
	kategori?: string,
): Promise<{ valid: boolean; error?: string }> {
	// Check if this is a Bank account (kode 1110 or 102, or kategori = 'Bank')
	const isBankAccount =
		kodeAkun === "102" ||
		kodeAkun === "102" ||
		kategori === "Bank" ||
		kodeAkun.startsWith("111") ||
		kodeAkun.startsWith("102");

	if (isBankAccount) {
		// Check if a bank account already exists
		const existingBank = await prisma.account.findFirst({
			where: {
				OR: [{ kodeAkun: "102" }],
			},
		});

		if (existingBank) {
			return {
				valid: false,
				error: "Hanya satu akun Bank yang diperbolehkan. Akun Bank sudah ada.",
			};
		}
	}

	return { valid: true };
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const academicYearId = searchParams.get("academicYearId");
			const tipeAkunParam = searchParams.get("tipeAkun");

			const where: Record<string, unknown> = {};
			if (tipeAkunParam) {
				const tipeAkunList = tipeAkunParam
					.split(",")
					.map((t) => t.trim())
					.filter((t) =>
						["Asset", "Liability", "Equity", "Revenue", "Expense"].includes(t),
					);
				if (tipeAkunList.length > 0) {
					where.tipeAkun = { in: tipeAkunList };
				}
			}

			const accounts = await prisma.account.findMany({
				where,
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			});

			// Hide Ekuitas Saldo Awal (3201) from the chart of accounts page.
			// It remains in the database for opening-balance operations.
			const visibleAccounts = accounts.filter((a) => a.kodeAkun !== "3201");

			if (!academicYearId) {
				return success(visibleAccounts, {
					message: "Accounts retrieved successfully",
				});
			}

			const academicYear = await prisma.academicYear.findUnique({
				where: { id: academicYearId },
			});
			if (!academicYear) {
				return errors.notFound("Tahun ajaran tidak ditemukan");
			}

			// Compute current and cumulative prior profit/loss using the same
			// logic as /api/reports/laba-rugi so the COA stays integrated.
			const berjalan = await computeLabaRugiForYear(prisma, academicYear.id);

			const priorYears = await prisma.academicYear.findMany({
				where: {
					tanggalSelesai: { lt: academicYear.tanggalMulai },
				},
				orderBy: { tanggalMulai: "asc" },
			});

			const priorResults = await Promise.all(
				priorYears.map((year) => computeLabaRugiForYear(prisma, year.id)),
			);
			const cumulativeSebelumnya = priorResults.reduce(
				(sum, result) => sum + result.labaRugi,
				0,
			);

			const labaRugiOverrides = new Map<string, number>([
				["302", cumulativeSebelumnya],
				["303", berjalan.labaRugi],
			]);

			// Always recompute yearSaldo from posted journal lines and write it back
			// to the AccountBalance snapshot so the cache can never drift from reality.
			const accountsWithYearSaldo = await Promise.all(
				visibleAccounts.map(async (account) => {
					const override = labaRugiOverrides.get(account.kodeAkun);
					if (override !== undefined) {
						await prisma.accountBalance.upsert({
							where: {
								kodeAkun_academicYearId: {
									kodeAkun: account.kodeAkun,
									academicYearId,
								},
							},
							update: { saldo: override },
							create: {
								kodeAkun: account.kodeAkun,
								academicYearId,
								saldo: override,
							},
						});

						return { ...account, yearSaldo: override };
					}

					const isCarryForwardAccount = ["Asset", "Liability", "Equity"].includes(
						account.tipeAkun,
					);

					const lines = await prisma.journalEntryLine.aggregate({
						where: {
							kodeAkun: account.kodeAkun,
							journalEntry: {
								tanggal: isCarryForwardAccount
									? { lte: academicYear.tanggalSelesai }
									: {
											gte: academicYear.tanggalMulai,
											lte: academicYear.tanggalSelesai,
										},
								status: "posted",
							},
						},
						_sum: { debit: true, kredit: true },
					});

					const totalDebit = lines._sum.debit ?? 0;
					const totalKredit = lines._sum.kredit ?? 0;

					const yearSaldo = computeSaldoChange(
						account,
						totalDebit,
						totalKredit,
					);

					await prisma.accountBalance.upsert({
						where: {
							kodeAkun_academicYearId: {
								kodeAkun: account.kodeAkun,
								academicYearId,
							},
						},
						update: { saldo: yearSaldo },
						create: {
							kodeAkun: account.kodeAkun,
							academicYearId,
							saldo: yearSaldo,
						},
					});

					return { ...account, yearSaldo };
				}),
			);

			return success(accountsWithYearSaldo, {
				message: "Accounts retrieved successfully",
			});
		} catch (error) {
			console.error("Accounts API error:", error);
			const { message } = handlePrismaError(error);
			return errors.internal(message);
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user) => {
			try {
				// Check admin role
				if (user.role !== "owner" && user.role !== "admin") {
					return errors.forbidden("Akses ditolak - memerlukan hak admin");
				}

				const ip = getClientIp(request);

				// Rate limiting for create operations
				const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult));
				}

				// Check for idempotency key in headers
				const headers: Record<string, string | string[] | undefined> = {};
				for (const [key, value] of request.headers.entries()) {
					headers[key] = value;
				}
				const idempotencyKey = getIdempotencyKeyFromRequest({ headers });
				if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
					// Check if this request was already processed
					const cachedResult = getIdempotencyResult(idempotencyKey);
					if (cachedResult !== null) {
						// Return cached result - this is an idempotent response
						return success(cachedResult, {
							message: "Account created successfully (cached)",
							status: 201,
						});
					}
				}

				// Parse and validate request body
				const body = await request.json();
				const validationResult = createAccountSchema.safeParse(body);

				if (!validationResult.success) {
					const validationErrors = validationResult.error.errors.map((e) => ({
						field: e.path.join("."),
						message: e.message,
					}));
					return errors.validation(validationErrors);
				}

				const { kodeAkun, namaAkun, tipeAkun, kategori, saldo } =
					validationResult.data;

				// Validate bank account (only one allowed)
				const bankValidation = await validateBankAccount(kodeAkun, kategori);
				if (!bankValidation.valid) {
					return errors.validation([
						{
							field: "kodeAkun",
							message: bankValidation.error || "Invalid bank account",
						},
					]);
				}

				// Check for duplicate kodeAkun
				const existing = await prisma.account.findUnique({
					where: { kodeAkun },
				});
				if (existing) {
					return errors.conflict("Kode akun sudah ada");
				}

				const account = await prisma.account.create({
					data: {
						kodeAkun,
						namaAkun,
						tipeAkun,
						kategori: kategori || null,
						saldo:
							typeof saldo === "string" ? parseFloat(saldo) || 0 : saldo || 0,
						normalBalance: getNormalBalanceByType(tipeAkun),
						isContra: false,
						isSystem: false,
					},
				});

				// Cache the result for idempotency
				if (idempotencyKey) {
					setIdempotencyResult(idempotencyKey, account);
				}

				// Invalidate accounts cache to reflect new data
				invalidateAccountsCache();

				return success(account, {
					message: "Account created successfully",
					status: 201,
				});
			} catch (error) {
				console.error("Accounts API error:", error);
				if (error instanceof Error && error.name === "SyntaxError") {
					return errors.badRequest("Invalid JSON in request body");
				}
				const { message } = handlePrismaError(error);
				return errors.internal(message);
			}
		},
		{ requireAdmin: true },
	);
}
