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
import {
	postInstallmentPaymentToJournal,
	getCashAccountCode,
	getRevenueAccountCode,
} from "@/lib/services/billing";

// Validation schema for creating installment plan
const createInstallmentPlanSchema = z.object({
	studentId: z.string().min(1, "Siswa wajib dipilih"),
	billingId: z.string().optional().nullable(),
	jumlahTotal: z
		.union([z.number(), z.string()])
		.transform((val) => {
			const num = typeof val === "string" ? parseFloat(val) : val;
			return num;
		})
		.refine((val) => val > 0, "Jumlah total harus lebih dari 0"),
	tenor: z
		.union([z.number(), z.string()])
		.transform((val) => {
			const num = typeof val === "string" ? parseInt(val) : val;
			return num;
		})
		.refine((val) => val > 0 && val <= 12, "Tenor harus antara 1-12 bulan"),
	tanggalMulai: z.string().min(1, "Tanggal mulai wajib diisi"),
	customNominals: z
		.array(
			z.object({
				cicilanKe: z.number(),
				jumlah: z.number(),
				tanggalJatuhTempo: z.string(),
			}),
		)
		.optional(),
});

// Validation schema for updating installment
const updateInstallmentSchema = z.object({
	installmentId: z.string().min(1, "ID cicilan wajib diisi"),
	jumlah: z
		.union([z.number(), z.string()])
		.transform((val) => {
			const num = typeof val === "string" ? parseFloat(val) : val;
			return num;
		})
		.refine((val) => val > 0, "Jumlah cicilan harus lebih dari 0")
		.optional(),
	tanggalJatuhTempo: z.string().optional(),
	status: z.enum(["Belum Bayar", "Bayar", "Jatuh Tempo"]).optional(),
});

// Validation schema for payment against installment
const payInstallmentSchema = z.object({
	installmentId: z.string().min(1, "Cicilan wajib dipilih"),
	jumlahBayar: z
		.union([z.number(), z.string()])
		.transform((val) => {
			const num = typeof val === "string" ? parseFloat(val) : val;
			return num;
		})
		.refine((val) => val >= 0, "Jumlah pembayaran harus positif"),
	tanggalBayar: z.string().optional(),
	catatan: z.string().optional(),
	source: z.enum(["kas", "bank"]).default("bank"),
});

// Check if installment is overdue
function isInstallmentOverdue(installment: {
	tanggalJatuhTempo: Date;
	status: string;
}): boolean {
	if (installment.status === "Bayar") return false;

	const now = new Date();
	const dueDate = new Date(installment.tanggalJatuhTempo);

	return now > dueDate;
}

// Calculate due date by adding months
function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	result.setMonth(result.getMonth() + months);
	return result;
}

// Generate installment plan (pure function)
function generateInstallmentPlan(params: {
	jumlahTotal: number;
	tenor: number;
	tanggalMulai: Date;
	customNominals?: Array<{
		cicilanKe: number;
		jumlah: number;
		tanggalJatuhTempo: string;
	}>;
}): Array<{ cicilanKe: number; jumlah: number; tanggalJatuhTempo: Date }> {
	const { jumlahTotal, tenor, tanggalMulai, customNominals } = params;

	// Use custom nominals if provided
	if (customNominals && customNominals.length > 0) {
		return customNominals.map((cn) => ({
			cicilanKe: cn.cicilanKe,
			jumlah: cn.jumlah,
			tanggalJatuhTempo: new Date(cn.tanggalJatuhTempo),
		}));
	}

	// Calculate equal installments
	const jumlahPerCicilan = Math.round((jumlahTotal / tenor) * 100) / 100;

	return Array.from({ length: tenor }, (_, index) => {
		const cicilanKe = index + 1;
		return {
			cicilanKe,
			jumlah: jumlahPerCicilan,
			tanggalJatuhTempo: addMonths(tanggalMulai, cicilanKe - 1),
		};
	});
}

// Process payment for a specific installment
async function processInstallmentPayment(
	installmentId: string,
	amount: number,
	paymentDate: Date,
	source: "kas" | "bank" = "bank",
	user?: { role: string; email: string },
) {
	return await prisma.$transaction(async (tx) => {
		// 1. Get installment with student and billing details
		const installment = await tx.installment.findUnique({
			where: { id: installmentId },
			include: {
				student: true,
				billing: true,
			},
		});

		if (!installment) {
			throw new Error("Cicilan tidak ditemukan");
		}

		if (installment.status === "Bayar") {
			throw new Error("Cicilan sudah lunas");
		}

		const overdue = isInstallmentOverdue(installment);

		// 2. Post to journal: Dr Cash/Bank, Cr Piutang Siswa
		// Revenue was already recognized at billing creation
		// Payment only reduces the receivable
		const cashCode = getCashAccountCode(source);
		const journalResult = await postInstallmentPaymentToJournal(tx, {
			installmentId,
			studentName: installment.student.nama,
			studentNis: installment.student.nis,
			jenisBiaya: installment.billing?.jenisBiaya,
			cicilanKe: installment.cicilanKe,
			jumlah: amount,
			paymentDate,
			isOverdue: overdue,
			source,
			user,
		});

		// 3. Create cashflow records for traceability (no direct saldo update)
		const paymentMethodLabel = source === "bank" ? "Bank" : "Kas";
		const cashflowEntries = overdue
			? [
					{
						kodeAkun: cashCode,
						debit: amount,
						kredit: 0,
						keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Masuk ${paymentMethodLabel}`,
						cashflowCategory: "OPS" as const,
					},
					{
						kodeAkun: "103",
						debit: 0,
						kredit: amount,
						keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Piutang`,
						cashflowCategory: "OPS" as const,
					},
				]
			: [
					{
						kodeAkun: cashCode,
						debit: amount,
						kredit: 0,
						keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Masuk ${paymentMethodLabel}`,
						cashflowCategory: "OPS" as const,
					},
					{
						kodeAkun: getRevenueAccountCode(installment.billing?.jenisBiaya || "SPP"),
						debit: 0,
						kredit: amount,
						keterangan: `Pembayaran Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Pendapatan`,
						cashflowCategory: "OPS" as const,
					},
				];

		const createdCashflows = [];
		for (const entry of cashflowEntries) {
			const cashflow = await tx.cashflow.create({
				data: {
					tanggal: paymentDate,
					keterangan: entry.keterangan,
					kodeAkun: entry.kodeAkun,
					kategori: "pemasukan",
					cashflowCategory: entry.cashflowCategory,
					debit: entry.debit,
					kredit: entry.kredit,
					referenceId: installmentId,
				},
			});
			createdCashflows.push(cashflow);
		}

		// 6. Update installment status to Bayar
		const updatedInstallment = await tx.installment.update({
			where: { id: installmentId },
			data: {
				status: "Bayar",
				tanggalBayar: paymentDate,
			},
		});

		// 6. Update student payment totals
		const studentUpdate = await tx.student.update({
			where: { id: installment.studentId },
			data: {
				totalBayar: { increment: amount },
			},
		});

		// 7. Check and update student overall payment status
		const remainingInstallments = await tx.installment.count({
			where: {
				studentId: installment.studentId,
				status: { not: "Bayar" },
			},
		});

		if (remainingInstallments === 0) {
			await tx.student.update({
				where: { id: installment.studentId },
				data: {
					statusBayar: "Lunas",
				},
			});
		} else {
			await tx.student.update({
				where: { id: installment.studentId },
				data: {
					statusBayar: "Belum Lunas",
				},
			});
		}

		// 8. If there's a linked billing, check if all installments are paid
		if (installment.billingId) {
			// Use single query with groupBy to get both counts
			const statusCounts = await tx.installment.groupBy({
				by: ["status"],
				where: { billingId: installment.billingId },
				_count: { _all: true },
			});

			let paidCount = 0;
			let totalCount = 0;
			for (const group of statusCounts) {
				totalCount += group._count._all;
				if (group.status === "Bayar") {
					paidCount = group._count._all;
				}
			}

			if (paidCount === totalCount && totalCount > 0) {
				await tx.billing.update({
					where: { id: installment.billingId },
					data: {
						statusBayar: "Lunas",
						tanggalBayar: paymentDate,
					},
				});
			}
		}

		return {
			installment: updatedInstallment,
			cashflows: createdCashflows,
			overdue,
			studentUpdated: studentUpdate,
			journalResult,
		};
	});
}

// Update overdue status for all installments
interface InstallmentWithStatus {
	tanggalJatuhTempo: Date;
	status: string;
	isOverdue?: boolean;
}

function updateOverdueStatus(
	installments: InstallmentWithStatus[],
): InstallmentWithStatus[] {
	return installments.map(
		(inst): InstallmentWithStatus => ({
			...inst,
			isOverdue: isInstallmentOverdue({
				tanggalJatuhTempo: inst.tanggalJatuhTempo,
				status: inst.status,
			}),
		}),
	);
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const studentId = searchParams.get("studentId");
				const billingId = searchParams.get("billingId");
				const status = searchParams.get("status");
				const overdue = searchParams.get("overdue");

				const where: Record<string, unknown> = {};

				if (studentId) where.studentId = studentId;
				if (billingId) where.billingId = billingId;
				if (status) where.status = status;

				const installments = await prisma.installment.findMany({
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
						billing: {
							select: {
								id: true,
								jenisBiaya: true,
								jumlah: true,
							},
						},
					},
					orderBy: [{ studentId: "asc" }, { cicilanKe: "asc" }],
				});

				// Add overdue status to each installment
				const installmentsWithOverdue = updateOverdueStatus(installments);

				// Filter by overdue if requested
				const filteredInstallments =
					overdue === "true"
						? installmentsWithOverdue.filter((inst) => inst.isOverdue)
						: installmentsWithOverdue;

				// Calculate summary
				const summary = {
					total: installments.length,
					belumBayar: installments.filter(
						(i: { status: string }) => i.status === "Belum Bayar",
					).length,
					sudahBayar: installments.filter(
						(i: { status: string }) => i.status === "Bayar",
					).length,
					JatuhTempo: installmentsWithOverdue.filter(
						(i: InstallmentWithStatus) => i.isOverdue,
					).length,
				};

				return success(filteredInstallments, {
					message: "Data cicilan berhasil diambil",
					meta: { summary },
				});
			} catch (error) {
				console.error("Installment API error:", error);
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
				// Rate limiting for installment creation
				const rateLimitResult = rateLimit(
					`installment:${ip}`,
					RATE_LIMITS.create,
				);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult));
				}

				const body = await request.json();

				// Validate request body
				const validationErrors = createInstallmentPlanSchema.safeParse(body);
				if (!validationErrors.success) {
					return errors.validation(
						validationErrors.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const {
					studentId,
					billingId,
					jumlahTotal,
					tenor,
					tanggalMulai,
					customNominals,
				} = validationErrors.data;

				// Validate student exists
				const student = await prisma.student.findUnique({
					where: { id: studentId },
				});

				if (!student) {
					return errors.notFound("Siswa");
				}

				// Validate billing if provided
				if (billingId) {
					const billing = await prisma.billing.findUnique({
						where: { id: billingId },
					});

					if (!billing) {
						return errors.notFound("Tagihan");
					}
				}

				// Generate installment plan
				const startDate = new Date(tanggalMulai);
				const installmentData = generateInstallmentPlan({
					jumlahTotal,
					tenor,
					tanggalMulai: startDate,
					customNominals,
				});

				// Create installments in transaction
				const createdInstallments = await prisma.$transaction(async (tx) => {
					// Delete existing installments for this billing (if any)
					if (billingId) {
						await tx.installment.deleteMany({
							where: { billingId },
						});
					}

					// Create new installments
					return tx.installment.createManyAndReturn({
						data: installmentData.map((inst) => ({
							studentId,
							billingId: billingId || null,
							cicilanKe: inst.cicilanKe,
							jumlah: inst.jumlah,
							tanggalJatuhTempo: inst.tanggalJatuhTempo,
							status: "Belum Bayar",
						})),
					});
				});

				// Update student total tagihan if needed
				if (billingId) {
					await prisma.student.update({
						where: { id: studentId },
						data: {
							totalTagihan: { increment: jumlahTotal },
						},
					});
				}

				return success(
					{
						installments: createdInstallments,
						plan: {
							jumlahTotal,
							tenor,
							tanggalMulai,
							cicilanPerBulan: Math.round((jumlahTotal / tenor) * 100) / 100,
						},
					},
					{
						message: `Rencana cicilan ${createdInstallments.length}x berhasil dibuat`,
						status: 201,
					},
				);
			} catch (error) {
				console.error("Installment API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function PUT(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const body = await request.json();

				// Update single installment (flexible nominal, due date)
				const validationErrors = updateInstallmentSchema.safeParse(body);
				if (!validationErrors.success) {
					return errors.validation(
						validationErrors.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const { installmentId, ...updateData } = validationErrors.data;

				const installment = await prisma.installment.findUnique({
					where: { id: installmentId },
				});

				if (!installment) {
					return errors.notFound("Cicilan");
				}

				if (installment.status === "Bayar") {
					return errors.badRequest("Cannot update paid installment");
				}

				const updatePayload: Record<string, unknown> = {};

				if (updateData.jumlah !== undefined) {
					updatePayload.jumlah = updateData.jumlah;
				}

				if (updateData.tanggalJatuhTempo !== undefined) {
					updatePayload.tanggalJatuhTempo = new Date(
						updateData.tanggalJatuhTempo,
					);
				}

				if (updateData.status !== undefined) {
					updatePayload.status = updateData.status;
				}

				const updatedInstallment = await prisma.installment.update({
					where: { id: installmentId },
					data: updatePayload,
				});

				return success(updatedInstallment, {
					message: "Cicilan berhasil diperbarui",
				});
			} catch (error) {
				console.error("Installment API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function PATCH(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user) => {
			const ip = getClientIp(request);

			try {
				// Payment against installment
				const rateLimitResult = rateLimit(
					`installment-payment:${ip}`,
					RATE_LIMITS.create,
				);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult));
				}

				const body = await request.json();

				const paymentValidationErrors = payInstallmentSchema.safeParse(body);
				if (!paymentValidationErrors.success) {
					return errors.validation(
						paymentValidationErrors.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

			const { installmentId, jumlahBayar, tanggalBayar, source } =
				paymentValidationErrors.data;

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

				try {
					const result = await processInstallmentPayment(
						installmentId,
						amount,
						paymentDate,
						source,
						user,
					);

					return success(
						{
							installment: result.installment,
							cashflows: result.cashflows,
							isOverdue: result.overdue,
							student: result.studentUpdated,
							journalResult: result.journalResult,
						},
						{
							message: result.overdue
								? "Pembayaran berhasil! Cicilan overdue telah dilunasi."
								: "Pembayaran cicilan berhasil!",
						},
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					return errors.badRequest(message);
				}
			} catch (error) {
				console.error("Installment API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
