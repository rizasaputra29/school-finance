import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	getIdempotencyResult,
	setIdempotencyResult,
	isValidIdempotencyKey,
} from "@/lib/utils/utils-idempotency";
import { success, errors, noContent, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	getCashAccountCode,
	postBillingPaymentToJournal,
} from "@/lib/services/billing";

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
	const header = req.headers.get("x-idempotency-key");
	if (!header) return null;
	return header;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid billing ID",
				},
			]);
		}

		try {
			const billing = await prisma.billing.findUnique({
				where: { id },
				include: {
					student: {
						select: {
							id: true,
							nis: true,
							nama: true,
							kelas: true,
						},
					},
				},
			});

			if (!billing) {
				return errors.notFound("Tagihan");
			}

			return success(billing, { message: "Billing retrieved successfully" });
		} catch (err) {
			const { status, code, message } = handlePrismaError(err);
			return error(message, code, { status });
		}
	});
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async (user) => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid billing ID",
				},
			]);
		}

		const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
		if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
			const cachedResult = getIdempotencyResult(idempotencyKey);
			if (cachedResult !== null) {
				return success(cachedResult, {
					message: "Billing updated successfully",
				});
			}
		}

		const body = await request.json();
		const { statusBayar, jumlah, catatan, source } = body;
		const paymentSource: "kas" | "bank" = source || "kas";

		try {
			const currentBilling = await prisma.billing.findUnique({
				where: { id },
				include: { student: true, academicYear: true },
			});

			if (!currentBilling) {
				return errors.notFound("Tagihan");
			}

			const updateData: Record<string, unknown> = {};
			if (jumlah !== undefined) updateData.jumlah = parseFloat(jumlah);
			if (catatan !== undefined) updateData.catatan = catatan;

			if (statusBayar && statusBayar !== currentBilling.statusBayar) {
				updateData.statusBayar = statusBayar;

				if (statusBayar === "Lunas") {
					updateData.tanggalBayar = new Date();

					const cashAccountCode = getCashAccountCode(paymentSource);
					const sourceLabel = paymentSource === "bank" ? "Bank" : "Kas";

					const result = await prisma.$transaction(async (tx) => {
						// Delete any existing cashflows for this billing (prevents duplicates)
						await tx.cashflow.deleteMany({
							where: { referenceId: id },
						});

						// Cashflow 1: Debit Kas/Bank (cash increases)
						const cashflowDebit = await tx.cashflow.create({
							data: {
								tanggal: new Date(),
								keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.student.nama} (${currentBilling.student.nis}) - ${sourceLabel} - Tahun Ajaran ${currentBilling.academicYear?.tahunAjaran || ""}`,
								kodeAkun: cashAccountCode,
								kategori: currentBilling.jenisBiaya,
								cashflowCategory: "OPS",
								debit: currentBilling.jumlah,
								kredit: 0,
								referenceId: id,
							},
						});

						// Cashflow 2: Credit Piutang Siswa (piutang decreases)
						await tx.cashflow.create({
							data: {
								tanggal: new Date(),
								keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.student.nama} (${currentBilling.student.nis}) - Piutang Siswa - Tahun Ajaran ${currentBilling.academicYear?.tahunAjaran || ""}`,
								kodeAkun: "103",
								kategori: currentBilling.jenisBiaya,
								cashflowCategory: "OPS",
								debit: 0,
								kredit: currentBilling.jumlah,
								referenceId: id,
							},
						});

					const journalResult = await postBillingPaymentToJournal(tx, {
						billingId: id,
						studentId: currentBilling.studentId,
						studentName: currentBilling.student.nama,
						studentNis: currentBilling.student.nis,
						jenisBiaya: currentBilling.jenisBiaya,
						jumlah: currentBilling.jumlah,
						paymentDate: new Date(),
						source: paymentSource,
						isOverdue: currentBilling.tanggalJatuhTempo
							? new Date() > new Date(currentBilling.tanggalJatuhTempo)
							: false,
						user,
					});

						await tx.student.update({
							where: { id: currentBilling.studentId },
							data: {
								totalBayar: { increment: currentBilling.jumlah },
							},
						});

						const unpaidBillings = await tx.billing.count({
							where: {
								studentId: currentBilling.studentId,
								statusBayar: "Belum Lunas",
								id: { not: id },
							},
						});

						if (unpaidBillings === 0) {
							await tx.student.update({
								where: { id: currentBilling.studentId },
								data: { statusBayar: "Lunas" },
							});
						}

						return { cashflowId: cashflowDebit.id, journalResult };
					});

					updateData.cashflowId = result.cashflowId;
				} else if (
					statusBayar === "Belum Lunas" &&
					currentBilling.statusBayar === "Lunas"
				) {
					await prisma.$transaction(async (tx) => {
						// Delete all cashflows with this referenceId (both debit and credit)
						await tx.cashflow.deleteMany({
							where: { referenceId: id },
						});

						updateData.tanggalBayar = null;
						updateData.cashflowId = null;

						await tx.student.update({
							where: { id: currentBilling.studentId },
							data: {
								totalBayar: { decrement: currentBilling.jumlah },
								statusBayar: "Belum Lunas",
							},
						});
					});
				}
			}

			const billing = await prisma.billing.update({
				where: { id },
				data: updateData,
				include: {
					student: {
						select: {
							id: true,
							nis: true,
							nama: true,
							kelas: true,
						},
					},
				},
			});

			if (idempotencyKey) {
				setIdempotencyResult(idempotencyKey, billing);
			}

			return success(billing, { message: "Billing updated successfully" });
		} catch (err) {
			const { status, code, message } = handlePrismaError(err);
			return error(message, code, { status });
		}
	});
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid billing ID",
				},
			]);
		}

		const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
		if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
			const cachedResult = getIdempotencyResult(idempotencyKey);
			if (cachedResult !== null) {
				return noContent();
			}
		}

		try {
			const billing = await prisma.billing.findUnique({
				where: { id },
			});

			if (!billing) {
				return errors.notFound("Tagihan");
			}

			await prisma.$transaction(async (tx) => {
				await tx.student.update({
					where: { id: billing.studentId },
					data: {
						totalTagihan: { decrement: billing.jumlah },
						...(billing.statusBayar === "Lunas" && {
							totalBayar: { decrement: billing.jumlah },
						}),
					},
				});

				// Delete all cashflows linked to this billing (both debit and credit sides)
				await tx.cashflow.deleteMany({
					where: { referenceId: id },
				});

				await tx.billing.delete({ where: { id } });
			});

			if (idempotencyKey) {
				setIdempotencyResult(idempotencyKey, { deleted: true });
			}

			return noContent();
		} catch (err) {
			const { status, code, message } = handlePrismaError(err);
			return error(message, code, { status });
		}
	});
}
