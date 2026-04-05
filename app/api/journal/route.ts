import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	validateTransaction,
	formatPeriode,
	roundAmount,
	isAmountEqual,
	type TransactionData,
	type TransactionEntry,
	type PeriodInfo,
} from "@/lib/accounting/accounting-validation";
import { invalidateReportsCache } from "@/lib/utils/utils-cache";

// Validation Schemas
const createJournalSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	keterangan: z
		.string()
		.min(1, "Keterangan wajib diisi")
		.max(500, "Keterangan maksimal 500 karakter"),
	entries: z
		.array(
			z.object({
				kodeAkun: z.string().min(1, "Kode akun wajib diisi"),
				debit: z.number().min(0, "Debit tidak boleh negatif").default(0),
				kredit: z.number().min(0, "Kredit tidak boleh negatif").default(0),
				keterangan: z.string().optional(),
			}),
		)
		.min(2, "Minimal harus ada 2 entri (debit dan kredit)"),
	allowBackdated: z.boolean().optional().default(false),
	overrideClosedPeriod: z.boolean().optional().default(false),
	reason: z.string().optional(),
});

const approveSchema = z.object({
	action: z.enum(["approve", "reject"]),
	reason: z.string().optional(),
});

const postSchema = z.object({
	forcePost: z.boolean().optional().default(false),
});

// Status Transition Functions
function isValidStatusTransition(
	currentStatus: string,
	newStatus: string,
): boolean {
	const transitions: Record<string, string[]> = {
		draft: ["approved", "rejected"],
		approved: ["posted", "draft"],
		posted: ["draft"],
	};
	return transitions[currentStatus]?.includes(newStatus) || false;
}

function calculateBalanceChange(
	accountType: string,
	debit: number,
	kredit: number,
): number {
	const isDebitNormal = ["Asset", "Expense"].includes(accountType);
	return isDebitNormal ? debit - kredit : kredit - debit;
}

// Helper Functions
async function getCurrentPeriod(): Promise<PeriodInfo | null> {
	const now = new Date();
	const periode = formatPeriode(now);

	const period = await prisma.period.findUnique({
		where: { kode: periode },
	});

	if (!period) {
		const tahun = now.getFullYear();
		const bulan = now.getMonth() + 1;
		const tanggalMulai = new Date(tahun, bulan - 1, 1);
		const tanggalAkhir = new Date(tahun, bulan, 0);

		return {
			kode: periode,
			status: "open",
			tahun,
			bulan,
			tanggalMulai: tanggalMulai.toISOString(),
			tanggalAkhir: tanggalAkhir.toISOString(),
		};
	}

	return {
		kode: period.kode,
		status: period.status as "open" | "closed" | "archived",
		tahun: period.tahun,
		bulan: period.bulan,
		tanggalMulai: period.tanggalMulai.toISOString(),
		tanggalAkhir: period.tanggalAkhir.toISOString(),
	};
}

async function getAccountTypesMap(): Promise<Map<string, string>> {
	const accounts = await prisma.account.findMany({
		select: { kodeAkun: true, tipeAkun: true },
	});
	return new Map(accounts.map((a) => [a.kodeAkun, a.tipeAkun]));
}

async function generateJournalNumber(): Promise<string> {
	const tahun = new Date().getFullYear();
	const prefix = `JNL-${tahun}-`;

	const latest = await prisma.journalEntry.findFirst({
		where: {
			reference: { startsWith: prefix },
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

async function logAudit(
	action: string,
	entity: string,
	entityId: string,
	userId: string | undefined,
	oldData?: unknown,
	newData?: unknown,
): Promise<void> {
	try {
		await prisma.auditTrail.create({
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

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const page = searchParams.get("page") || "1";
			const limit = searchParams.get("limit") || "20";
			const status = searchParams.get("status");
			const startDate = searchParams.get("startDate");
			const endDate = searchParams.get("endDate");
			const search = searchParams.get("search");
			const isBackdated = searchParams.get("isBackdated");

			const skip = (parseInt(page) - 1) * parseInt(limit);

			const where: Record<string, unknown> = {};

			if (status) {
				where.status = status;
			}

			if (isBackdated !== undefined) {
				where.isBackdated = isBackdated === "true";
			}

			if (startDate && endDate) {
				where.tanggal = {
					gte: new Date(startDate),
					lte: new Date(endDate),
				};
			}

			if (search) {
				where.keterangan = { contains: search, mode: "insensitive" };
			}

			const [journals, total] = await Promise.all([
				prisma.journalEntry.findMany({
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
					skip,
					take: parseInt(limit),
				}),
				prisma.journalEntry.count({ where }),
			]);

			// Calculate totals
			const totalDebit = journals.reduce(
				(sum, j) => sum + j.entries.reduce((s, e) => s + e.debit, 0),
				0,
			);
			const totalKredit = journals.reduce(
				(sum, j) => sum + j.entries.reduce((s, e) => s + e.kredit, 0),
				0,
			);

			return success(journals, {
				message: "Journals retrieved successfully",
				meta: {
					summary: {
						totalDebit: roundAmount(totalDebit),
						totalKredit: roundAmount(totalKredit),
						count: journals.length,
					},
					pagination: {
						page: parseInt(page),
						limit: parseInt(limit),
						total,
						totalPages: Math.ceil(total / parseInt(limit)),
					},
				},
			});
		} catch (error) {
			console.error("Error fetching journals:", error);
			const prismaError = handlePrismaError(error);
			return errors.internal(prismaError.message);
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(request, async (user) => {
		try {
			const body = await request.json();

			// Validate request
			const validation = createJournalSchema.safeParse(body);
			if (!validation.success) {
				const validationErrors = validation.error.errors.map((err) => ({
					field: err.path.join("."),
					message: err.message,
				}));
				return errors.validation(validationErrors);
			}

			const {
				tanggal,
				keterangan,
				entries,
				allowBackdated,
				overrideClosedPeriod,
				reason,
			} = validation.data;

			// Security: Check owner role for closed period override
			const userRole = user.role;
			const isOwner = userRole === "owner";

			if (overrideClosedPeriod && !isOwner) {
				return errors.forbidden(
					"Hanya owner yang dapat meng-override periode yang sudah ditutup",
				);
			}

			// Get current period
			const currentPeriod = await getCurrentPeriod();

			// Get the period for the transaction date
			const transactionDate = new Date(tanggal);
			const transactionPeriode = formatPeriode(transactionDate);

			// Check if the transaction date is for a different period
			let targetPeriod = currentPeriod;
			let isBackdatedEntry = false;
			let originalPeriod: string | null = null;

			if (currentPeriod && transactionPeriode !== currentPeriod.kode) {
				const periodRecord = await prisma.period.findUnique({
					where: { kode: transactionPeriode },
				});

				if (periodRecord) {
					if (periodRecord.status === "closed" && !overrideClosedPeriod) {
						return errors.validation([
							{
								field: "tanggal",
								message: `Tanggal ${tanggal} berada di periode ${transactionPeriode} yang sudah ditutup. Hubungi administrator untuk membuka kembali periode.`,
							},
						]);
					}

					targetPeriod = {
						kode: periodRecord.kode,
						status: periodRecord.status as "open" | "closed" | "archived",
						tahun: periodRecord.tahun,
						bulan: periodRecord.bulan,
						tanggalMulai: periodRecord.tanggalMulai.toISOString(),
						tanggalAkhir: periodRecord.tanggalAkhir.toISOString(),
					};
					isBackdatedEntry = true;
					originalPeriod = transactionPeriode;
				} else {
					isBackdatedEntry = true;
					originalPeriod = transactionPeriode;
				}
			} else if (
				currentPeriod &&
				transactionDate < new Date(currentPeriod.tanggalMulai || "")
			) {
				isBackdatedEntry = true;
				originalPeriod = transactionPeriode;
			}

			// Get account types
			const accountTypes = await getAccountTypesMap();

			// Determine adjustment type
			const adjustmentType = isBackdatedEntry
				? reason
					? "adjusting"
					: "regular"
				: "regular";

			// Validate transaction
			const transactionData: Partial<TransactionData> = {
				tanggal,
				keterangan,
				entries: entries as TransactionEntry[],
			};

			const validationResult = validateTransaction(transactionData, {
				accountTypes,
				period: targetPeriod,
				allowBackdated,
			});

			if (!validationResult.isValid) {
				const validationErrors = validationResult.errors?.map((err) => ({
					field: err.field || "general",
					message: err.message,
					code: err.code,
				})) || [{ field: "general", message: "Transaksi tidak valid" }];
				return errors.validation(validationErrors);
			}

			// Check Debit = Kredit
			const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
			const totalKredit = entries.reduce((sum, e) => sum + (e.kredit || 0), 0);

			if (!isAmountEqual(totalDebit, totalKredit)) {
				return errors.validation([
					{
						field: "entries",
						message: `Total Debit (${roundAmount(totalDebit).toLocaleString("id-ID")}) tidak sama dengan Total Kredit (${roundAmount(totalKredit).toLocaleString("id-ID")}). Selisih: ${roundAmount(totalDebit - totalKredit).toLocaleString("id-ID")}`,
					},
				]);
			}

			// Generate journal number
			const reference = await generateJournalNumber();

			// Create journal entry in transaction
			const result = await prisma.$transaction(async (tx) => {
				// Create journal header with backdated tracking
				const journal = await tx.journalEntry.create({
					data: {
						tanggal: new Date(tanggal),
						keterangan,
						reference,
						status: "draft",
						version: 1,
						isBackdated: isBackdatedEntry,
						originalPeriod: originalPeriod,
						adjustmentType: adjustmentType,
						backdatedBy: isBackdatedEntry ? user.id || undefined : undefined,
						backdatedAt: isBackdatedEntry ? new Date() : undefined,
						reason: reason,
					},
				});

				// Add periode to each entry
				const periode = formatPeriode(new Date(tanggal));

				// Create journal lines
				const journalLineData = entries.map((entry) => ({
					journalEntryId: journal.id,
					kodeAkun: entry.kodeAkun,
					debit: roundAmount(entry.debit),
					kredit: roundAmount(entry.kredit),
				}));

				await tx.journalEntryLine.createMany({
					data: journalLineData,
				});

				// Fetch created lines for return data
				const createdEntries = await tx.journalEntryLine.findMany({
					where: { journalEntryId: journal.id },
				});

				// Create cashflow records
				const cashflowData: Prisma.CashflowCreateManyInput[] = entries.map(
					(entry) => {
						const isBankAccount =
							entry.kodeAkun.startsWith("111") || entry.kodeAkun === "102";

						return {
							tanggal: new Date(tanggal),
							keterangan:
								entry.keterangan || `${keterangan} - ${entry.kodeAkun}`,
							kodeAkun: entry.kodeAkun,
							kategori: "journal",
							debit: roundAmount(entry.debit),
							kredit: roundAmount(entry.kredit),
							source: isBankAccount ? "bank" : "kas",
							status: "draft",
							periode,
							version: 1,
						};
					},
				);

				await tx.cashflow.createMany({
					data: cashflowData,
				});

				// Audit trail
				await logAudit("create", "journal", journal.id, user.id, undefined, {
					reference,
					tanggal,
					keterangan,
					entryCount: entries.length,
				});

				return { journal, entries: createdEntries };
			});

			// Invalidate cache
			invalidateReportsCache();

			return success(
				{
					id: result.journal.id,
					reference: result.journal.reference,
					tanggal: result.journal.tanggal,
					keterangan: result.journal.keterangan,
					status: result.journal.status,
					isBackdated: result.journal.isBackdated,
					originalPeriod: result.journal.originalPeriod,
					adjustmentType: result.journal.adjustmentType,
					reason: result.journal.reason,
					entries: result.entries,
				},
				{
					message: result.journal.isBackdated
						? "Jurnal backdated berhasil dibuat (status: draft)"
						: "Jurnal berhasil dibuat (status: draft)",
					status: 201,
				},
			);
		} catch (error) {
			console.error("Error creating journal:", error);
			const prismaError = handlePrismaError(error);
			return errors.internal(prismaError.message);
		}
	});
}

export async function PUT(request: NextRequest) {
	return withAuthAppRouter(request, async (user) => {
		try {
			const body = await request.json();
			const { action } = body;

			// Parse approve/post schemas based on action
			if (action === "approve" || action === "reject") {
				const validation = approveSchema.safeParse(body);
				if (!validation.success) {
					const validationErrors = validation.error.errors.map((err) => ({
						field: err.path.join("."),
						message: err.message,
					}));
					return errors.validation(validationErrors);
				}
			} else if (action === "post") {
				const validation = postSchema.safeParse(body);
				if (!validation.success) {
					const validationErrors = validation.error.errors.map((err) => ({
						field: err.path.join("."),
						message: err.message,
					}));
					return errors.validation(validationErrors);
				}
			} else {
				return errors.validation([
					{
						field: "action",
						message: "Action tidak valid. Gunakan: approve, reject, atau post",
					},
				]);
			}

			// Get journal ID from query
			const { searchParams } = new URL(request.url);
			const id = searchParams.get("id");
			if (!id) {
				return errors.validation([
					{
						field: "id",
						message: "ID jurnal wajib diisi",
					},
				]);
			}

			// Get current journal
			const currentJournal = await prisma.journalEntry.findUnique({
				where: { id },
				include: { entries: true },
			});

			if (!currentJournal) {
				return errors.notFound("Jurnal");
			}

			// Determine new status
			let newStatus: string;
			switch (action) {
				case "approve":
					newStatus = "approved";
					break;
				case "reject":
					newStatus = "rejected";
					break;
				case "post":
					newStatus = "posted";
					break;
				default:
					return errors.validation([
						{
							field: "action",
							message: "Action tidak valid",
						},
					]);
			}

			// Validate status transition
			if (!isValidStatusTransition(currentJournal.status, newStatus)) {
				return errors.validation([
					{
						field: "status",
						message: `Tidak dapat mengubah status dari ${currentJournal.status} ke ${newStatus}`,
					},
				]);
			}

			// For posting: validate balance
			if (action === "post") {
				const totalDebit = currentJournal.entries.reduce(
					(sum, e) => sum + e.debit,
					0,
				);
				const totalKredit = currentJournal.entries.reduce(
					(sum, e) => sum + e.kredit,
					0,
				);

				if (!isAmountEqual(totalDebit, totalKredit)) {
					return errors.validation([
						{
							field: "entries",
							message: `Total Debit (${totalDebit}) tidak sama dengan Total Kredit (${totalKredit})`,
						},
					]);
				}
			}

			// Process status change in transaction
			const result = await prisma.$transaction(async (tx) => {
				// If posting, update account balances
				if (action === "post") {
					for (const entry of currentJournal.entries) {
						const account = await tx.account.findUnique({
							where: { kodeAkun: entry.kodeAkun },
						});

						if (!account) {
							throw new Error(
								`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`,
							);
						}

						const saldoChange = calculateBalanceChange(
							account.tipeAkun,
							entry.debit,
							entry.kredit,
						);

						await tx.account.update({
							where: { kodeAkun: entry.kodeAkun },
							data: {
								saldo: { increment: roundAmount(saldoChange) },
							},
						});
					}

					// Update cashflow records to posted status
					await tx.cashflow.updateMany({
						where: {
							referenceId: currentJournal.reference,
							status: "draft",
						},
						data: {
							status: "posted",
						},
					});
				}

				// Update journal status
				const journal = await tx.journalEntry.update({
					where: { id },
					data: {
						status: newStatus,
						version: { increment: 1 },
						...(action === "post"
							? { postedAt: new Date(), postedBy: user.id }
							: {}),
					},
				});

				// Audit trail
				await logAudit(
					action,
					"journal",
					id,
					user.id,
					{ status: currentJournal.status },
					{ status: newStatus },
				);

				return journal;
			});

			invalidateReportsCache();

			return success(
				{
					id: result.id,
					reference: result.reference,
					status: result.status,
					postedAt: result.postedAt,
				},
				{
					message: `Jurnal berhasil di${action === "approve" ? "setuju" : action === "reject" ? "tolak" : "posting"}`,
				},
			);
		} catch (error) {
			console.error("Error updating journal:", error);
			const prismaError = handlePrismaError(error);
			return errors.internal(prismaError.message);
		}
	});
}
