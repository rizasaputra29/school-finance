import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	getCashAccountCode,
	postBillingPaymentToJournal,
} from "@/lib/services/billing";

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user) => {
			try {
				const body = await request.json();
				const { billingIds, source } = body;

				if (!billingIds || !Array.isArray(billingIds) || billingIds.length === 0) {
					return errors.validation([
						{ field: "billingIds", message: "Pilih minimal satu tagihan" },
					]);
				}

				const paymentSource: "kas" | "bank" = source || "kas";

				const billings = await prisma.billing.findMany({
					where: {
						id: { in: billingIds },
						statusBayar: "Belum Lunas",
					},
					include: {
						student: true,
						academicYear: { select: { tahunAjaran: true } },
					},
				});

				if (billings.length === 0) {
					return errors.validation([
						{ field: "billingIds", message: "Tidak ada tagihan yang bisa dibayar" },
					]);
				}

				let processedCount = 0;
				let totalAmount = 0;

				await prisma.$transaction(
					async (tx) => {
						for (const billing of billings) {
							const cashAccountCode = getCashAccountCode(paymentSource);
							const sourceLabel = paymentSource === "bank" ? "Bank" : "Kas";

							// Delete any existing cashflows for this billing (prevents duplicates)
							await tx.cashflow.deleteMany({
								where: { referenceId: billing.id },
							});

							// Cashflow 1: Debit Kas/Bank
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} (${billing.student.nis}) - ${sourceLabel} - Tahun Ajaran ${billing.academicYear?.tahunAjaran || ""}`,
									kodeAkun: cashAccountCode,
									kategori: billing.jenisBiaya,
									cashflowCategory: "OPS",
									debit: billing.jumlah,
									kredit: 0,
									referenceId: billing.id,
								},
							});

							// Cashflow 2: Credit Piutang Siswa
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.student.nama} (${billing.student.nis}) - Piutang Siswa - Tahun Ajaran ${billing.academicYear?.tahunAjaran || ""}`,
									kodeAkun: "103",
									kategori: billing.jenisBiaya,
									cashflowCategory: "OPS",
									debit: 0,
									kredit: billing.jumlah,
									referenceId: billing.id,
								},
							});

							// Journal entry
							await postBillingPaymentToJournal(tx, {
								billingId: billing.id,
								studentId: billing.studentId,
								studentName: billing.student.nama,
								studentNis: billing.student.nis,
								jenisBiaya: billing.jenisBiaya,
								jumlah: billing.jumlah,
								paymentDate: new Date(),
								source: paymentSource,
								isOverdue: billing.tanggalJatuhTempo
									? new Date() > new Date(billing.tanggalJatuhTempo)
									: false,
								user,
							});

							// Update billing status
							await tx.billing.update({
								where: { id: billing.id },
								data: {
									statusBayar: "Lunas",
									tanggalBayar: new Date(),
								},
							});

							// Update student totalBayar
							await tx.student.update({
								where: { id: billing.studentId },
								data: {
									totalBayar: { increment: billing.jumlah },
								},
							});

							processedCount++;
							totalAmount += billing.jumlah;
						}

						// Check if all billings for each student are paid
						const studentIds = [...new Set(billings.map((b) => b.studentId))];
						for (const studentId of studentIds) {
							const unpaidCount = await tx.billing.count({
								where: {
									studentId,
									statusBayar: "Belum Lunas",
								},
							});
							if (unpaidCount === 0) {
								await tx.student.update({
									where: { id: studentId },
									data: { statusBayar: "Lunas" },
								});
							}
						}
					},
					{ timeout: 30000 },
				);

				return success(
					{
						processedCount,
						totalAmount,
					},
					{
						message: `${processedCount} tagihan berhasil dibayar. Total: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalAmount)}`,
					},
				);
			} catch (err) {
				console.error("Bulk pay error:", err);
				const { message } = handlePrismaError(err);
				return errors.internal(message);
			}
		},
		{ requireAdmin: true },
	);
}
