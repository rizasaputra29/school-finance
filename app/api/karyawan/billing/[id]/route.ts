import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors, noContent, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	postEmployeeBillingPaymentToJournal,
	getCashAccountCode,
	getExpenseAccountCode,
} from "@/lib/services/billing";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([{ field: "id", message: "Invalid billing ID" }]);
		}

		try {
			const billing = await prisma.employeeBilling.findUnique({
				where: { id },
				include: {
					employee: {
						select: { id: true, nip: true, nama: true, jabatan: true },
					},
					academicYear: { select: { tahunAjaran: true } },
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
			return errors.validation([{ field: "id", message: "Invalid billing ID" }]);
		}

		const body = await request.json();
		const { statusBayar, jumlah, catatan, source } = body;
		const paymentSource: "kas" | "bank" = source || "kas";

		try {
			const currentBilling = await prisma.employeeBilling.findUnique({
				where: { id },
				include: {
					employee: true,
					academicYear: { select: { tahunAjaran: true } },
				},
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

						// Create double-entry cashflow records
						if (currentBilling.tipe === "tagihan") {
							// Employee owes school: Dr Kas/Bank, Cr Revenue
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.employee.nama} - Masuk ${sourceLabel}`,
									kodeAkun: cashAccountCode,
									kategori: currentBilling.jenisBiaya,
									cashflowCategory: "OPS",
									debit: currentBilling.jumlah,
									kredit: 0,
									referenceId: id,
								},
							});
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.employee.nama} - Pendapatan`,
									kodeAkun: "406",
									kategori: currentBilling.jenisBiaya,
									cashflowCategory: "OPS",
									debit: 0,
									kredit: currentBilling.jumlah,
									referenceId: id,
								},
							});
						} else {
							// School pays employee: Dr Expense, Cr Kas/Bank
							const expenseCode = getExpenseAccountCode(currentBilling.jenisBiaya);
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.employee.nama} - Beban`,
									kodeAkun: expenseCode,
									kategori: currentBilling.jenisBiaya,
									cashflowCategory: "OPS",
									debit: currentBilling.jumlah,
									kredit: 0,
									referenceId: id,
								},
							});
							await tx.cashflow.create({
								data: {
									tanggal: new Date(),
									keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.employee.nama} - Keluar ${sourceLabel}`,
									kodeAkun: cashAccountCode,
									kategori: currentBilling.jenisBiaya,
									cashflowCategory: "OPS",
									debit: 0,
									kredit: currentBilling.jumlah,
									referenceId: id,
								},
							});
						}

						const journalResult = await postEmployeeBillingPaymentToJournal(tx, {
							billingId: id,
							employeeId: currentBilling.employeeId,
							employeeName: currentBilling.employee.nama,
							employeeNip: currentBilling.employee.nip,
							jenisBiaya: currentBilling.jenisBiaya,
							jumlah: currentBilling.jumlah,
							paymentDate: new Date(),
							tipe: currentBilling.tipe as "tagihan" | "pembayaran",
							source: paymentSource,
							user,
						});

						await tx.employee.update({
							where: { id: currentBilling.employeeId },
							data: {
								totalBayar: { increment: currentBilling.jumlah },
							},
						});

						const unpaidBillings = await tx.employeeBilling.count({
							where: {
								employeeId: currentBilling.employeeId,
								statusBayar: "Belum Lunas",
								id: { not: id },
							},
						});

						if (unpaidBillings === 0) {
							await tx.employee.update({
								where: { id: currentBilling.employeeId },
								data: { statusBayar: "Lunas" },
							});
						}

						return { journalResult };
					});
				} else if (
					statusBayar === "Belum Lunas" &&
					currentBilling.statusBayar === "Lunas"
				) {
					await prisma.$transaction(async (tx) => {
						// Delete all cashflow records for this billing
						await tx.cashflow.deleteMany({
							where: { referenceId: id },
						});

						updateData.tanggalBayar = null;

						await tx.employee.update({
							where: { id: currentBilling.employeeId },
							data: {
								totalBayar: { decrement: currentBilling.jumlah },
								statusBayar: "Belum Lunas",
							},
						});
					});
				}
			}

			const billing = await prisma.employeeBilling.update({
				where: { id },
				data: updateData,
				include: {
					employee: {
						select: { id: true, nip: true, nama: true, jabatan: true },
					},
					academicYear: { select: { tahunAjaran: true } },
				},
			});

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
			return errors.validation([{ field: "id", message: "Invalid billing ID" }]);
		}

		try {
			const billing = await prisma.employeeBilling.findUnique({
				where: { id },
			});

			if (!billing) {
				return errors.notFound("Tagihan");
			}

			await prisma.$transaction(async (tx) => {
				await tx.employee.update({
					where: { id: billing.employeeId },
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

				await tx.employeeBilling.delete({ where: { id } });
			});

			return noContent();
		} catch (err) {
			const { status, code, message } = handlePrismaError(err);
			return error(message, code, { status });
		}
	});
}
