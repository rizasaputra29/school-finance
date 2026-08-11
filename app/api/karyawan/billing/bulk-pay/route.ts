import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	postEmployeeBillingPaymentToJournal,
	getCashAccountCode,
	getExpenseAccountCode,
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

				const billings = await prisma.employeeBilling.findMany({
					where: {
						id: { in: billingIds },
						statusBayar: "Belum Lunas",
					},
					include: {
						employee: true,
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

							if (billing.tipe === "tagihan") {
								// Employee owes school: Dr Kas/Bank, Cr Revenue
								await tx.cashflow.create({
									data: {
										tanggal: new Date(),
										keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.employee.nama} - Masuk ${sourceLabel}`,
										kodeAkun: cashAccountCode,
										kategori: billing.jenisBiaya,
										cashflowCategory: "OPS",
										debit: billing.jumlah,
										kredit: 0,
										referenceId: billing.id,
									},
								});
								await tx.cashflow.create({
									data: {
										tanggal: new Date(),
										keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.employee.nama} - Pendapatan`,
										kodeAkun: "406",
										kategori: billing.jenisBiaya,
										cashflowCategory: "OPS",
										debit: 0,
										kredit: billing.jumlah,
										referenceId: billing.id,
									},
								});
							} else {
								// School pays employee: Dr Expense, Cr Kas/Bank
								const expenseCode = getExpenseAccountCode(billing.jenisBiaya);
								await tx.cashflow.create({
									data: {
										tanggal: new Date(),
										keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.employee.nama} - Beban`,
										kodeAkun: expenseCode,
										kategori: billing.jenisBiaya,
										cashflowCategory: "OPS",
										debit: billing.jumlah,
										kredit: 0,
										referenceId: billing.id,
									},
								});
								await tx.cashflow.create({
									data: {
										tanggal: new Date(),
										keterangan: `Pembayaran ${billing.jenisBiaya} - ${billing.employee.nama} - Keluar ${sourceLabel}`,
										kodeAkun: cashAccountCode,
										kategori: billing.jenisBiaya,
										cashflowCategory: "OPS",
										debit: 0,
										kredit: billing.jumlah,
										referenceId: billing.id,
									},
								});
							}

							// Journal entry
							await postEmployeeBillingPaymentToJournal(tx, {
								billingId: billing.id,
								employeeId: billing.employeeId,
								employeeName: billing.employee.nama,
								employeeNip: billing.employee.nip,
								jenisBiaya: billing.jenisBiaya,
								jumlah: billing.jumlah,
								paymentDate: new Date(),
								tipe: billing.tipe as "tagihan" | "pembayaran",
								source: paymentSource,
								user,
							});

							// Update billing status
							await tx.employeeBilling.update({
								where: { id: billing.id },
								data: {
									statusBayar: "Lunas",
									tanggalBayar: new Date(),
								},
							});

							// Update employee totalBayar
							await tx.employee.update({
								where: { id: billing.employeeId },
								data: {
									totalBayar: { increment: billing.jumlah },
								},
							});

							processedCount++;
							totalAmount += billing.jumlah;
						}

						// Check if all billings for each employee are paid
						const employeeIds = [...new Set(billings.map((b) => b.employeeId))];
						for (const employeeId of employeeIds) {
							const unpaidCount = await tx.employeeBilling.count({
								where: {
									employeeId,
									statusBayar: "Belum Lunas",
								},
							});
							if (unpaidCount === 0) {
								await tx.employee.update({
									where: { id: employeeId },
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
