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
import { invalidateDashboardCache } from "@/lib/utils/utils-cache";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

const mutasiSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	dari: z.enum(["101", "102"], {
		required_error: "Sumber wajib dipilih (101=Kas, 102=Bank)",
	}),
	ke: z.enum(["101", "102"], {
		required_error: "Tujuan wajib dipilih (101=Kas, 102=Bank)",
	}),
	jumlah: z
		.union([z.number(), z.string()])
		.transform((v) => (typeof v === "string" ? parseFloat(v) : v)),
	keterangan: z.string().optional(),
});

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const page = searchParams.get("page") || "1";
				const limit = searchParams.get("limit") || "10";
				const skip = (parseInt(page) - 1) * parseInt(limit);
				const take = parseInt(limit);

				const where = {
					reference: { startsWith: "mutasi-" },
				};

				const [entries, total] = await Promise.all([
					prisma.journalEntry.findMany({
						where,
						orderBy: { tanggal: "desc" },
						skip,
						take,
						include: {
							entries: {
								include: {
									account: { select: { namaAkun: true, kodeAkun: true } },
								},
							},
						},
					}),
					prisma.journalEntry.count({ where }),
				]);

				return success(entries, {
					message: "Data mutasi berhasil diambil",
					meta: {
						pagination: {
							page: parseInt(page),
							limit: take,
							total,
							totalPages: Math.ceil(total / take),
						},
					},
				});
			} catch (error) {
				console.error("Mutasi API error:", error);
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
			const ip = getClientIp(request);

			try {
				const rateLimitResult = rateLimit(`mutasi:${ip}`, RATE_LIMITS.create);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult), {
						"Retry-After": Math.ceil(
							(rateLimitResult.reset - Date.now()) / 1000,
						).toString(),
					});
				}

				const body = await request.json();

				const validationErrors = mutasiSchema.safeParse(body);
				if (!validationErrors.success) {
					return errors.validation(
						validationErrors.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const data = validationErrors.data;
				const jumlah =
					typeof data.jumlah === "string"
						? parseFloat(data.jumlah)
						: Number(data.jumlah);

				// Validate: source and destination must be different
				if (data.dari === data.ke) {
					return errors.badRequest("Sumber dan tujuan harus berbeda");
				}

				if (jumlah <= 0) {
					return errors.badRequest("Jumlah harus lebih dari 0");
				}

				// Check if transaction date falls within active academic year
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true, isArchived: false },
				});
				if (!activeYear) {
					return errors.badRequest("Tidak ada tahun ajaran aktif");
				}
				const transactionDate = new Date(data.tanggal);
				if (
					transactionDate < activeYear.tanggalMulai ||
					transactionDate > activeYear.tanggalSelesai
				) {
					return errors.badRequest(
						"Tanggal transaksi di luar tahun ajaran aktif",
					);
				}

				// Validate both accounts exist
				const [fromAccount, toAccount] = await Promise.all([
					prisma.account.findUnique({ where: { kodeAkun: data.dari } }),
					prisma.account.findUnique({ where: { kodeAkun: data.ke } }),
				]);
				if (!fromAccount) return errors.notFound(`Akun sumber ${data.dari}`);
				if (!toAccount) return errors.notFound(`Akun tujuan ${data.ke}`);

				// Check sufficient balance in source
				if (fromAccount.saldo < jumlah) {
					return errors.badRequest(
						`Saldo ${fromAccount.namaAkun} tidak mencukupi (Rp ${fromAccount.saldo.toLocaleString("id-ID")})`,
					);
				}

				const fromLabel = data.dari === "101" ? "Kas" : "Bank";
				const toLabel = data.ke === "101" ? "Kas" : "Bank";
				const keterangan =
					data.keterangan || `Transfer ${fromLabel} ke ${toLabel}`;
				const timestamp = Date.now();

				const result = await prisma.$transaction(async (tx) => {
					// 1. Create JournalEntry (Transfer — NOT revenue/expense)
					const journalEntry = await tx.journalEntry.create({
						data: {
							tanggal: new Date(data.tanggal),
							keterangan,
							reference: `mutasi-${data.dari}-${data.ke}-${timestamp}`,
							status: "posted",
							postedAt: new Date(),
							postedBy: user.email || "system",
						},
					});

					// 2. Create JournalEntryLines
					// Debit destination, Credit source (both are Asset accounts)
					await tx.journalEntryLine.createMany({
						data: [
							{
								journalEntryId: journalEntry.id,
								kodeAkun: data.ke, // Destination: Debit
								debit: jumlah,
								kredit: 0,
							},
							{
								journalEntryId: journalEntry.id,
								kodeAkun: data.dari, // Source: Credit
								debit: 0,
								kredit: jumlah,
							},
						],
				});

				// 3. Update account balances
				const lines = [
					{ kodeAkun: data.ke, debit: jumlah, kredit: 0 },
					{ kodeAkun: data.dari, debit: 0, kredit: jumlah },
				];
				for (const line of lines) {
					const account = await tx.account.findUnique({
						where: { kodeAkun: line.kodeAkun },
					});
					if (account) {
						const isDebitNormal = ["Asset", "Expense"].includes(account.tipeAkun);
						const saldoChange = isDebitNormal
							? line.debit - line.kredit
							: line.kredit - line.debit;
						await tx.account.update({
							where: { kodeAkun: line.kodeAkun },
							data: { saldo: { increment: saldoChange } },
						});
					}
				}

				// 4. Create AuditTrail
					await tx.auditTrail.create({
						data: {
							action: "create",
							entity: "mutasi",
							entityId: journalEntry.id,
							newData: {
								dari: data.dari,
								ke: data.ke,
								jumlah,
								keterangan,
							},
							userId: user.email || null,
						},
					});

					return journalEntry;
				});

				invalidateDashboardCache();

				return success(result, {
					message: `Transfer ${fromLabel} → ${toLabel} sebesar Rp ${jumlah.toLocaleString("id-ID")} berhasil`,
					status: 201,
				});
			} catch (error) {
				console.error("Mutasi API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
