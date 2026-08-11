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
import { ErrorCodes } from "@/lib/api/api-errors";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import { postToJournal, type JournalEntryLine } from "@/lib/services/journal";
import { isBillingOverdue, getRevenueAccountCode } from "@/lib/services/billing";

// Account codes
const CASH_ACCOUNT_CODE = "101"; // Kas
const BANK_ACCOUNT_CODE = "102"; // Bank
const PIUTANG_ACCOUNT_CODE = "103"; // Piutang Siswa

// Payment method to account code mapping
function getPaymentAccountCode(metodeBayar: string): string {
	const mapping: Record<string, string> = {
		Cash: CASH_ACCOUNT_CODE,
		Bank: BANK_ACCOUNT_CODE,
		Transfer: BANK_ACCOUNT_CODE,
	};
	return mapping[metodeBayar] || CASH_ACCOUNT_CODE;
}

// Validation schema for manual payment
const manualPaymentSchema = z.object({
	billingId: z.string().min(1, "Tagihan wajib dipilih"),
	jumlahBayar: z
		.union([z.number(), z.string()])
		.transform((val) => {
			const num = typeof val === "string" ? parseFloat(val) : val;
			return num;
		})
		.refine((val) => val >= 0, "Jumlah pembayaran harus positif"),
	tanggalBayar: z.string().optional(),
	catatan: z.string().optional(),
	metodeBayar: z.enum(["Cash", "Bank", "Transfer"]).default("Cash"),
});

// Process payment with double-entry + journal integration
async function processStudentPayment(
	billingId: string,
	amount: number,
	paymentDate: Date,
	catatan: string | undefined,
	metodeBayar: string,
	userRole: "owner" | "admin" | "user",
	userEmail?: string,
) {
	return await prisma.$transaction(async (tx) => {
		// 1. Get billing and student details
		const billing = await tx.billing.findUnique({
			where: { id: billingId },
			include: {
				student: true,
			},
		});

		if (!billing) {
			throw new Error("Tagihan tidak ditemukan");
		}

		if (billing.statusBayar === "Lunas") {
			throw new Error("Tagihan sudah lunas");
		}

		// 2. Check if overdue
		const overdue = isBillingOverdue({
			tanggalJatuhTempo: billing.tanggalJatuhTempo,
			statusBayar: billing.statusBayar,
		});

		// 3. Build journal entries based on on-time vs late
		const journalLines: JournalEntryLine[] = [];
		const paymentAccountCode = getPaymentAccountCode(metodeBayar);

		if (overdue) {
			// Late payment: revenue was already recognized when piutang was created
			// Dr Kas/Bank, Cr Piutang Siswa
			journalLines.push(
				{
					kodeAkun: paymentAccountCode,
					debit: amount,
					kredit: 0,
				},
				{
					kodeAkun: PIUTANG_ACCOUNT_CODE,
					debit: 0,
					kredit: amount,
				},
			);
		} else {
			// On-time payment: recognize revenue directly
			// Dr Kas/Bank, Cr Revenue
			const revenueCode = getRevenueAccountCode(billing.jenisBiaya);
			journalLines.push(
				{
					kodeAkun: paymentAccountCode,
					debit: amount,
					kredit: 0,
				},
				{
					kodeAkun: revenueCode,
					debit: 0,
					kredit: amount,
				},
			);
		}

		// 5. Post to Journal (creates JournalEntry + lines + updates accounts if owner)
		const journalResult = await postToJournal(tx, {
			tanggal: paymentDate,
			keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama}${overdue ? " (Overdue)" : ""}`,
			reference: `payment-${billingId}-${Date.now()}`,
			entries: journalLines,
			userRole,
			userEmail,
		});

		// 6. Create cashflow records for traceability
		const createdCashflows = [];
		const paymentMethodLabel =
			metodeBayar === "Cash"
				? "Kas"
				: metodeBayar === "Bank"
					? "Bank"
					: "Transfer";

		for (const line of journalLines) {
			if (line.debit > 0) {
				const cashflow = await tx.cashflow.create({
					data: {
						tanggal: paymentDate,
						keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - Masuk ${paymentMethodLabel}`,
						kodeAkun: line.kodeAkun,
						kategori: "pemasukan",
						cashflowCategory: "OPS",
						debit: line.debit,
						kredit: 0,
						referenceId: billingId,
					},
				});
				createdCashflows.push(cashflow);
			} else if (line.kredit > 0) {
				const isPiutang = line.kodeAkun === PIUTANG_ACCOUNT_CODE;
				const cashflow = await tx.cashflow.create({
					data: {
						tanggal: paymentDate,
						keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} - ${isPiutang ? "Piutang" : "Pendapatan"}`,
						kodeAkun: line.kodeAkun,
						kategori: "pemasukan",
						cashflowCategory: "OPS",
						debit: 0,
						kredit: line.kredit,
						referenceId: billingId,
					},
				});
				createdCashflows.push(cashflow);
			}
		}

		// 7. Update billing status to Lunas
		const updatedBilling = await tx.billing.update({
			where: { id: billingId },
			data: {
				statusBayar: "Lunas",
				tanggalBayar: paymentDate,
				catatan: catatan || null,
				cashflowId: createdCashflows[0]?.id,
			},
		});

		// 8. Update student payment totals
		const studentUpdate = await tx.student.update({
			where: { id: billing.studentId },
			data: {
				totalBayar: { increment: amount },
				statusBayar: "Lunas",
			},
		});

		// Check if student still has unpaid billings
		const remainingBillings = await tx.billing.count({
			where: {
				studentId: billing.studentId,
				statusBayar: "Belum Lunas",
			},
		});

		if (remainingBillings > 0) {
			await tx.student.update({
				where: { id: billing.studentId },
				data: {
					statusBayar: "Belum Lunas",
				},
			});
		}

		return {
			billing: updatedBilling,
			cashflows: createdCashflows,
			overdue,
			studentUpdated: studentUpdate,
			journalEntryId: journalResult.journalEntryId,
			journalStatus: journalResult.status,
		};
	});
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const studentId = searchParams.get("studentId");
				const statusBayar = searchParams.get("statusBayar") || "Belum Lunas";
				const overdue = searchParams.get("overdue");

				const where: Record<string, unknown> = {};

				if (studentId) where.studentId = studentId;
				if (statusBayar) where.statusBayar = statusBayar;

				const billings = await prisma.billing.findMany({
					where,
					include: {
						student: {
							select: {
								id: true,
								nis: true,
								nama: true,
								kelas: true,
								totalTagihan: true,
								totalBayar: true,
							},
						},
					},
					orderBy: [{ statusBayar: "asc" }, { createdAt: "desc" }],
				});

				// Add overdue status to each billing
				const billingsWithOverdue = billings.map((billing) => ({
					...billing,
					isOverdue: isBillingOverdue({
						tanggalJatuhTempo: billing.tanggalJatuhTempo,
						statusBayar: billing.statusBayar,
					}),
				}));

				// If filter by overdue, apply it
				const filteredBillings =
					overdue === "true"
						? billingsWithOverdue.filter((b) => b.isOverdue)
						: billingsWithOverdue;

				return success(filteredBillings, {
					message: "Data pembayaran berhasil diambil",
					meta: {
						summary: {
							totalUnpaid: billings.filter(
								(b) => b.statusBayar === "Belum Lunas",
							).length,
							totalOverdue: billingsWithOverdue.filter((b) => b.isOverdue)
								.length,
						},
					},
				});
			} catch (error) {
				console.error("Payment API error:", error);
				return errors.internal(
					"Terjadi kesalahan saat mengambil data pembayaran",
				);
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
				// Rate limiting for payment operations
				const rateLimitResult = rateLimit(`payment:${ip}`, RATE_LIMITS.create);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult));
				}

				const body = await request.json();

				// Validate request body
				const validationResult = manualPaymentSchema.safeParse(body);
				if (!validationResult.success) {
					return errors.validation(
						validationResult.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const { billingId, jumlahBayar, tanggalBayar, catatan, metodeBayar } =
					validationResult.data;

				// Convert amount to number (handles both string and number from Zod transform)
				const amount = Number(jumlahBayar);
				const paymentDate = tanggalBayar ? new Date(tanggalBayar) : new Date();

				if (isNaN(amount) || amount <= 0) {
					return errors.validation([
						{
							field: "jumlahBayar",
							message: "Jumlah pembayaran harus lebih dari 0",
						},
					]);
				}

				// Block past-date transactions (unless owner)
				if (
					user.role !== "owner" &&
					paymentDate < new Date(new Date().setHours(0, 0, 0, 0))
				) {
					return errors.validation([
						{
							field: "tanggalBayar",
							message: "Tanggal pembayaran tidak boleh di masa lalu",
						},
					]);
				}

				try {
					const result = await processStudentPayment(
						billingId,
						amount,
						paymentDate,
						catatan,
						metodeBayar,
						user.role as "owner" | "admin" | "user",
						user.email,
					);

					return success(
						{
							billing: result.billing,
							cashflows: result.cashflows,
							isOverdue: result.overdue,
							student: result.studentUpdated,
							journalEntryId: result.journalEntryId,
							journalStatus: result.journalStatus,
						},
						{
							message: result.overdue
								? `Pembayaran berhasil! Tagihan overdue telah dilunasi. Jurnal: ${result.journalStatus === "posted" ? "langsung diposting" : "menunggu persetujuan"}`
								: `Pembayaran berhasil! Jurnal: ${result.journalStatus === "posted" ? "langsung diposting" : "menunggu persetujuan"}`,
							status: 201,
						},
					);
				} catch (error) {
					// Handle specific error types
					const message =
						error instanceof Error ? error.message : "Unknown error";

					if (message.includes("tidak ditemukan")) {
						return errors.notFound("Tagihan");
					}

					if (message.includes("sudah lunas")) {
						return errors.conflict("Tagihan sudah lunas");
					}

					if (message.includes("Jurnal tidak seimbang")) {
						return errors.validation([
							{ field: "entries", message },
						]);
					}

					// Handle Prisma errors
					const { code: prismaCode, message: prismaMessage } =
						handlePrismaError(error);
					if (prismaCode === ErrorCodes.RESOURCE_NOT_FOUND) {
						return errors.notFound("Resource");
					}
					if (prismaCode === ErrorCodes.RESOURCE_ALREADY_EXISTS) {
						return errors.conflict(prismaMessage);
					}
					if (prismaCode === ErrorCodes.RELATED_RESOURCE_NOT_FOUND) {
						return errors.validation([{ message: prismaMessage }]);
					}

					return errors.internal(prismaMessage);
				}
			} catch (error) {
				console.error("Payment API error:", error);
				return errors.internal("Terjadi kesalahan saat memproses pembayaran");
			}
		},
		{ requireAdmin: true },
	);
}
