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
import { validateBody } from "@/lib/api/api-validation";
import { success, errors, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import { postToJournal, type JournalEntryLine } from "@/lib/services/journal";
import {
	classifyCashflowAccount,
	computeSaldoChange,
} from "@/lib/accounting/accounting-chart-of-accounts";

/**
 * Helper to convert PrismaErrorResult to NextResponse
 */
function prismaErrorToResponse(err: unknown) {
	const prismaError = handlePrismaError(err);
	return error(prismaError.message, prismaError.code, {
		status: prismaError.status,
	});
}

type PrismaTransactionClient = Parameters<
	Parameters<typeof prisma.$transaction>[0]
>[0];

// Transaction type enum - extended with ekuitas
type TransactionType =
	| "pemasukan"
	| "pengeluaran"
	| "aset"
	| "hutang"
	| "piutang"
	| "ekuitas";

// Full schema for double-entry transactions with special options
const createCashflowSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	keterangan: z
		.string()
		.min(1, "Keterangan wajib diisi")
		.max(500, "Keterangan maksimal 500 karakter"),
	kodeAkun: z.string().optional(),
	kategori: z.string().optional(),
	debit: z.union([z.number(), z.string()]).optional().default(0),
	kredit: z.union([z.number(), z.string()]).optional().default(0),
	source: z.enum(["101", "102"]).optional().default("101"),
	// New transaction type fields
	transactionType: z
		.enum(["pemasukan", "pengeluaran", "aset", "hutang", "piutang", "ekuitas"])
		.optional(),
	entries: z
		.array(
			z.object({
				kodeAkun: z.string(),
				debit: z.number(),
				kredit: z.number(),
				keterangan: z.string(),
			}),
		)
		.optional(),
	// Asset options
	namaAset: z.string().optional(),
	kategoriAset: z.string().optional(),
	lokasiAset: z.string().optional(),
	umurTeknis: z.number().optional(),
	nilaiResidu: z.number().optional(),
	isTanah: z.boolean().optional(),
	// Debt/Kewajiban options
	tenor: z.number().optional(),
	dueDate: z.string().optional(),
	kreditur: z.string().optional(),
	// Equity options
	jenisEkuitas: z.string().optional(),
	// Piutang options
	studentName: z.string().optional(),
	nis: z.string().optional(),
});

function sendValidationErrorResponse(
	errorsList: Array<{ field: string; message: string }>,
) {
	return errors.validation(errorsList);
}

// ISAK 35 Cash Flow Classification
// Delegated to the canonical chart-of-accounts helper.
function classifyCashflow(kodeAkun: string): "OPS" | "INV" | "FIN" | null {
	return classifyCashflowAccount(kodeAkun);
}

// Process double-entry transaction with journal integration
async function processDoubleEntry(
	tx: PrismaTransactionClient,
	entries: Array<{
		kodeAkun: string;
		debit: number;
		kredit: number;
		keterangan: string;
	}>,
	transactionType: TransactionType,
	tanggal: Date,
	userRole: "owner" | "admin" | "user",
	userEmail?: string,
	source?: string,
): Promise<{
	cashflows: Array<{
		id: string;
		tanggal: Date;
		keterangan: string;
		kodeAkun: string;
		kategori: string | null;
		debit: number;
		kredit: number;
	}>;
	summary: { totalDebit: number; totalKredit: number };
	journalEntryId: string;
	journalStatus: string;
}> {
	// Build journal lines from entries
	const journalLines: JournalEntryLine[] = entries.map((entry) => ({
		kodeAkun: entry.kodeAkun,
		debit: entry.debit,
		kredit: entry.kredit,
	}));

	// Determine the main keterangan from first entry
	const keterangan = entries[0]?.keterangan || `${transactionType} transaksi`;

	// Post to Journal
	const journalResult = await postToJournal(tx, {
		tanggal,
		keterangan,
		reference: `cashflow-${transactionType}-${Date.now()}`,
		entries: journalLines,
		userRole,
		userEmail,
	});

	// Create cashflow records for traceability
	const createdCashflows = [];
	let totalDebit = 0;
	let totalKredit = 0;

	for (const entry of entries) {
		// ISAK 35 cashflow classification
		const cashflowCategory = classifyCashflow(entry.kodeAkun);

		const cashflow = await tx.cashflow.create({
			data: {
				tanggal,
				keterangan: entry.keterangan,
				kodeAkun: entry.kodeAkun,
				kategori: transactionType,
				cashflowCategory,
				debit: entry.debit,
				kredit: entry.kredit,
				source,
				status: journalResult.status === "posted" ? "posted" : "draft",
				referenceId: journalResult.journalEntryId,
			} as never,
		});

		createdCashflows.push(cashflow);
		totalDebit += entry.debit;
		totalKredit += entry.kredit;
	}

	return {
		cashflows: createdCashflows,
		summary: { totalDebit, totalKredit },
		journalEntryId: journalResult.journalEntryId,
		journalStatus: journalResult.status,
	};
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		const { searchParams } = new URL(request.url);
		const page = searchParams.get("page") || "1";
		const limit = searchParams.get("limit") || "10";
		const startDate = searchParams.get("startDate");
		const endDate = searchParams.get("endDate");
		const academicYearId = searchParams.get("academicYearId");
		const kodeAkun = searchParams.get("kodeAkun");
		const type = searchParams.get("type");
		const search = searchParams.get("search");
		const transactionType = searchParams.get("transactionType");
		const status = searchParams.get("status");

		const skip = (parseInt(page) - 1) * parseInt(limit);

		// Resolve academic year for journal-line based summary and fallback date filter
		let yearStart: Date | undefined;
		let yearEnd: Date | undefined;
		if (academicYearId) {
			const academicYear = await prisma.academicYear.findUnique({
				where: { id: academicYearId },
			});
			if (academicYear) {
				yearStart = academicYear.tanggalMulai;
				yearEnd = academicYear.tanggalSelesai;
			}
		}
		if (!yearStart || !yearEnd) {
			const activeYear = await prisma.academicYear.findFirst({
				where: { isActive: true },
				orderBy: { tanggalMulai: "desc" },
			});
			if (activeYear) {
				yearStart = activeYear.tanggalMulai;
				yearEnd = activeYear.tanggalSelesai;
			}
		}

		const where: Record<string, unknown> = {};
		if (startDate && endDate) {
			where.tanggal = {
				gte: new Date(startDate),
				lte: new Date(endDate),
			};
		} else if (yearStart && yearEnd) {
			where.tanggal = {
				gte: yearStart,
				lte: yearEnd,
			};
		}
		if (kodeAkun) {
			where.kodeAkun = kodeAkun;
		}

		// Filter by status (draft, approved, posted, rejected)
		if (status) {
			where.status = status;
		}

		// Filter by transaction type (kategori)
		if (transactionType) {
			where.kategori = transactionType;
		}

		// Legacy filters
		if (type === "income") {
			where.debit = { gt: 0 };
		} else if (type === "expense") {
			where.kredit = { gt: 0 };
		}

		// Search by keterangan or kodeAkun
		if (search) {
			where.OR = [
				{ keterangan: { contains: search, mode: "insensitive" } },
				{ kodeAkun: { contains: search, mode: "insensitive" } },
			];
		}

		try {
			// Fetch all matching cashflows with account info, grouped by referenceId
			const [allCashflows, summaryAgg] = await Promise.all([
				prisma.cashflow.findMany({
					where,
					orderBy: { tanggal: "desc" },
					include: {
						account: { select: { namaAkun: true } },
					},
				}),
				prisma.cashflow.aggregate({
					where,
					_sum: {
						debit: true,
						kredit: true,
					},
				}),
			]);

			const totalDebit = summaryAgg._sum.debit || 0;
			const totalKredit = summaryAgg._sum.kredit || 0;

			// Compute real revenue/expense and cash/bank balance from posted journal lines
			const journalDateFilter =
				yearStart && yearEnd
					? { gte: yearStart, lte: yearEnd }
					: undefined;
			const balanceDateLimit = yearEnd ? { lte: yearEnd } : undefined;

			const [revenueAgg, expenseAgg, cashBankLines] = await Promise.all([
				prisma.journalEntryLine.aggregate({
					_sum: { debit: true, kredit: true },
					where: {
						account: { tipeAkun: "Revenue" },
						journalEntry: {
							status: "posted",
							tanggal: journalDateFilter,
						},
					},
				}),
				prisma.journalEntryLine.aggregate({
					_sum: { debit: true, kredit: true },
					where: {
						account: { tipeAkun: "Expense" },
						journalEntry: {
							status: "posted",
							tanggal: journalDateFilter,
						},
					},
				}),
				prisma.journalEntryLine.findMany({
					where: {
						kodeAkun: { in: ["101", "102"] },
						journalEntry: {
							status: "posted",
							tanggal: balanceDateLimit,
						},
					},
					include: { account: true },
				}),
			]);

			const realPendapatan =
				(revenueAgg._sum.kredit ?? 0) - (revenueAgg._sum.debit ?? 0);
			const realPengeluaran =
				(expenseAgg._sum.debit ?? 0) - (expenseAgg._sum.kredit ?? 0);

			let saldoKasBank = 0;
			for (const line of cashBankLines) {
				if (!line.account) continue;
				saldoKasBank += computeSaldoChange(
					line.account,
					line.debit,
					line.kredit,
				);
			}

			// Group cashflows by referenceId (or by id for unlinked records)
			const groupMap = new Map<
				string,
				{
					id: string;
					tanggal: Date;
					keterangan: string;
					kategori: string | null;
					status: string;
					entries: typeof allCashflows;
				}
			>();

			for (const cf of allCashflows) {
				const groupId = cf.referenceId || cf.id;
				if (!groupMap.has(groupId)) {
					groupMap.set(groupId, {
						id: cf.id, // Use first cashflow's ID for API operations
						tanggal: cf.tanggal,
						keterangan: cf.keterangan,
						kategori: cf.kategori,
						status: cf.status,
						entries: [],
					});
				}
				groupMap.get(groupId)!.entries.push(cf);
			}

			// Convert to array and paginate groups
			const allGroups = Array.from(groupMap.values());
			const total = allGroups.length;
			const totalPages = Math.ceil(total / parseInt(limit));
			const paginatedGroups = allGroups.slice(skip, skip + parseInt(limit));

			// Map entries to include namaAkun
			const groupedCards = paginatedGroups.map((group) => ({
				id: group.id,
				tanggal: group.tanggal,
				keterangan: group.keterangan,
				kategori: group.kategori,
				status: group.status,
				entries: group.entries.map((e) => ({
					id: e.id,
					kodeAkun: e.kodeAkun,
					namaAkun: e.account?.namaAkun || "",
					debit: e.debit,
					kredit: e.kredit,
					source: e.source,
				})),
				totalDebit: group.entries.reduce((sum, e) => sum + e.debit, 0),
				totalKredit: group.entries.reduce((sum, e) => sum + e.kredit, 0),
			}));

			return success(groupedCards, {
				message: "Data arus kas berhasil diambil",
				meta: {
					pagination: {
						page: parseInt(page),
						limit: parseInt(limit),
						total,
						totalPages,
					},
						summary: {
							totalDebit,
							totalKredit,
							saldo: totalDebit - totalKredit,
							realPendapatan,
							realPengeluaran,
							saldoKasBank,
						},
				},
			});
		} catch (error) {
			console.error("Error fetching cashflows:", error);
			return prismaErrorToResponse(error);
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(request, async (user) => {
		const ip = getClientIp(request);

		// Rate limiting for create operations
		const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
		if (!rateLimitResult.success) {
			return errors.rateLimit(formatRateLimitError(rateLimitResult));
		}

		const body = await request.json();

		// Validate request body
		const validationErrors = validateBody(body, createCashflowSchema);
		if (validationErrors) {
			return sendValidationErrorResponse(validationErrors);
		}

		const {
			tanggal,
			keterangan,
			kodeAkun,
			kategori,
			debit,
			kredit,
			source,
			transactionType,
			entries,
			// Asset options
			namaAset,
			kategoriAset,
			lokasiAset,
			umurTeknis,
			nilaiResidu,
			isTanah,
			// Debt options
			tenor,
			dueDate,
			kreditur,
			// Equity options
			// Piutang options
		} = body as z.infer<typeof createCashflowSchema>;

		// Handle double-entry transactions
		if (transactionType && entries && entries.length > 0) {
			// Validate no past-date transactions (unless owner)
			const transactionDate = new Date(tanggal);
			if (
				user.role !== "owner" &&
				transactionDate < new Date(new Date().setHours(0, 0, 0, 0))
			) {
				return errors.validation([
					{
						field: "tanggal",
						message: "Tanggal transaksi tidak boleh di masa lalu",
					},
				]);
			}

			try {
				const result = await prisma.$transaction(
					async (tx) => {
						// Process double entries with journal integration
						const processResult = await processDoubleEntry(
							tx,
							entries,
							transactionType,
							transactionDate,
							user.role,
							user.email,
							source,
						);

						// Create Asset record if this is an asset transaction with penyusutan options
						if (transactionType === "aset" && kodeAkun && namaAset) {
							const amount = entries[0]?.debit || entries[0]?.kredit || 0;
							await tx.asset.create({
								data: {
									kodeAkun: kodeAkun,
									nama: namaAset,
									kategori: kategoriAset || "Inventaris",
									lokasi: lokasiAset || "",
									tanggalPerolehan: transactionDate,
									hargaPerolehan:
										typeof amount === "number"
											? amount
											: parseFloat(String(amount)),
									umurTeknis: typeof umurTeknis === "number" ? umurTeknis : 5,
									nilaiResidu:
										typeof nilaiResidu === "number" ? nilaiResidu : 0,
									isTanah: isTanah || false,
									status: "Active",
								},
							});
						}

						// Create Debt record if this is a kewajiban (hutang) transaction
						if (transactionType === "hutang" && kodeAkun) {
							const kreditAmount = entries[0]?.kredit || 0;
							const jumlahAwal =
								typeof kreditAmount === "number"
									? kreditAmount
									: parseFloat(String(kreditAmount));
							const tenorNum =
								typeof tenor === "number"
									? tenor
									: parseInt(String(tenor || "12"));
							await tx.debt.create({
								data: {
									kodeAkun: kodeAkun,
									nama: `${keterangan} - ${kreditur || "Hutang"}`,
									kreditur: kreditur || null,
									jumlahAwal: jumlahAwal,
									jumlahSisa: -Math.abs(jumlahAwal),
									tenor: tenorNum,
									tanggalMulai: transactionDate,
									tanggalJatuhTempo: dueDate
										? new Date(dueDate)
										: new Date(
												new Date(tanggal).setMonth(
													new Date(tanggal).getMonth() + tenorNum,
												),
											),
									cicilanPerBulan: tenorNum
										? jumlahAwal / tenorNum
										: jumlahAwal / 12,
									status: "Aktif",
								},
							});
						}

						return processResult;
					},
					{
						maxWait: 10000,
						timeout: 30000,
					},
				);

				return success(result.cashflows, {
					message: `Transaksi ${transactionType} berhasil dibuat dengan ${result.cashflows.length} entri. Jurnal: ${result.journalStatus === "posted" ? "langsung diposting" : "menunggu persetujuan"}`,
					status: 201,
					meta: {
						summary: result.summary,
						journalEntryId: result.journalEntryId,
						journalStatus: result.journalStatus,
					},
				});
			} catch (error) {
				console.error("Double-entry transaction error:", error);
				if (
					error instanceof Error &&
					error.message.includes("tidak ditemukan")
				) {
					return errors.notFound(
						error.message.replace("Akun dengan kode ", "Account "),
					);
				}
				if (
					error instanceof Error &&
					error.message.includes("Jurnal tidak seimbang")
				) {
					return errors.validation([{ field: "entries", message: error.message }]);
				}
				return prismaErrorToResponse(error);
			}
		}

		// Legacy single entry handling
		const debitAmount =
			typeof debit === "string" ? parseFloat(debit) : Number(debit) || 0;
		const kreditAmount =
			typeof kredit === "string" ? parseFloat(kredit) : Number(kredit) || 0;

		try {
			// First check if transaction with this hash already exists
			const existingTransaction = await prisma.cashflow.findFirst({
				where: {
					kodeAkun,
					tanggal: {
						gte: new Date(new Date(tanggal).setHours(0, 0, 0, 0)),
						lte: new Date(new Date(tanggal).setHours(23, 59, 59, 999)),
					},
					OR: [{ debit: debitAmount, kredit: kreditAmount }],
					keterangan: { equals: keterangan, mode: "insensitive" },
				},
			});

			if (existingTransaction) {
				return success(
					{
						...existingTransaction,
						isDuplicate: true,
					},
					{ message: "Transaksi sudah ada, menggunakan data yang sudah ada" },
				);
			}

			// Post to journal for legacy single entries
			const journalLines: JournalEntryLine[] = [
				{ kodeAkun: kodeAkun!, debit: debitAmount, kredit: 0 },
				{ kodeAkun: kodeAkun!, debit: 0, kredit: kreditAmount },
			].filter((line) => line.debit > 0 || line.kredit > 0);

			const result = await prisma.$transaction(
				async (tx) => {
					// Post to journal
					const journalResult = await postToJournal(tx, {
						tanggal: new Date(tanggal),
						keterangan,
						reference: `cashflow-legacy-${Date.now()}`,
						entries: journalLines.length > 0 ? journalLines : [
							{ kodeAkun: kodeAkun!, debit: debitAmount, kredit: kreditAmount },
						],
						userRole: user.role,
						userEmail: user.email,
					});

					// Create cashflow record
					if (!kodeAkun) {
						throw new Error("Kode akun wajib diisi");
					}
					const cashflowCategory = classifyCashflow(kodeAkun);
				const cashflow = await tx.cashflow.create({
					data: {
						tanggal: new Date(tanggal),
						keterangan,
						kodeAkun,
						kategori: kategori || null,
						cashflowCategory,
						debit: debitAmount,
						kredit: kreditAmount,
						source,
						status: journalResult.status === "posted" ? "posted" : "draft",
						referenceId: journalResult.journalEntryId,
					},
				} as never);

					return { cashflow, journalEntryId: journalResult.journalEntryId, journalStatus: journalResult.status };
				},
				{
					maxWait: 10000,
					timeout: 30000,
				},
			);

			return success(
				{
					...result.cashflow,
					isNew: true,
					journalEntryId: result.journalEntryId,
					journalStatus: result.journalStatus,
				},
				{
					message: `Transaksi berhasil dibuat. Jurnal: ${result.journalStatus === "posted" ? "langsung diposting" : "menunggu persetujuan"}`,
					status: 201,
				},
			);
		} catch (error) {
			console.error("Transaction error:", error);
			if (error instanceof Error) {
				if (error.message.includes("tidak ditemukan")) {
					return errors.notFound(
						error.message.replace("Akun dengan kode ", "Account "),
					);
				}
				if (error.message.includes("wajib diisi")) {
					return errors.validation([
						{ field: "kodeAkun", message: error.message },
					]);
				}
			}
			return prismaErrorToResponse(error);
		}
	});
}
