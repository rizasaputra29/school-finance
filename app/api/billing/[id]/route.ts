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

		// Check for idempotency key in headers
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
		const { statusBayar, jumlah, catatan } = body;

		try {
			// Get current billing for comparison
			const currentBilling = await prisma.billing.findUnique({
				where: { id },
				include: { student: true },
			});

			if (!currentBilling) {
				return errors.notFound("Tagihan");
			}

			const updateData: Record<string, unknown> = {};
			if (jumlah !== undefined) updateData.jumlah = parseFloat(jumlah);
			if (catatan !== undefined) updateData.catatan = catatan;

			// Handle payment status change
			if (statusBayar && statusBayar !== currentBilling.statusBayar) {
				updateData.statusBayar = statusBayar;

				if (statusBayar === "Lunas") {
					updateData.tanggalBayar = new Date();

					// Map fee types to account codes (matching Excel Chart of Accounts)
					const feeTypeToAccountCode: Record<string, string> = {
						Pendaftaran: "400", // Penerimaan Dana Pendaftaran
						Gedung: "401", // Penerimaan Uang Gedung
						Kegiatan: "402", // Penerimaan Uang Kegiatan
						Seragam: "403", // Penerimaan Uang Seragam
						ATK: "404", // Penerimaan Uang ATK
						SPP: "405", // Penerimaan Uang SPP
					};

					const accountCode =
						feeTypeToAccountCode[currentBilling.jenisBiaya] || "405";

					// Create cashflow entry for income (cash received)
					const cashflow = await prisma.cashflow.create({
						data: {
							tanggal: new Date(),
							keterangan: `Pembayaran ${currentBilling.jenisBiaya} - ${currentBilling.student.nama} (${currentBilling.student.nis}) - ${currentBilling.periodeBulan}`,
							kodeAkun: accountCode,
							kategori: currentBilling.jenisBiaya,
							debit: currentBilling.jumlah,
							kredit: 0,
							referenceId: id,
						},
					});

					updateData.cashflowId = cashflow.id;

					// Decrease Piutang Siswa (103) - receivable collected
					await prisma.account.update({
						where: { kodeAkun: "103" },
						data: { saldo: { decrement: currentBilling.jumlah } },
					});

					// Increase Kas (101) - cash received
					await prisma.account.update({
						where: { kodeAkun: "101" },
						data: { saldo: { increment: currentBilling.jumlah } },
					});

					// Update student payment totals
					await prisma.student.update({
						where: { id: currentBilling.studentId },
						data: {
							totalBayar: { increment: currentBilling.jumlah },
						},
					});

					// Check if all billings are paid for this student
					const unpaidBillings = await prisma.billing.count({
						where: {
							studentId: currentBilling.studentId,
							statusBayar: "Belum Lunas",
							id: { not: id }, // Exclude current billing being paid
						},
					});

					if (unpaidBillings === 0) {
						await prisma.student.update({
							where: { id: currentBilling.studentId },
							data: { statusBayar: "Lunas" },
						});
					}
				} else if (
					statusBayar === "Belum Lunas" &&
					currentBilling.statusBayar === "Lunas"
				) {
					// Reverting payment - remove cashflow entry
					if (currentBilling.cashflowId) {
						await prisma.cashflow.delete({
							where: { id: currentBilling.cashflowId },
						});
					}

					updateData.tanggalBayar = null;
					updateData.cashflowId = null;

					// Increase Piutang Siswa (103) - receivable restored
					await prisma.account.update({
						where: { kodeAkun: "103" },
						data: { saldo: { increment: currentBilling.jumlah } },
					});

					// Decrease Kas (101) - cash returned
					await prisma.account.update({
						where: { kodeAkun: "101" },
						data: { saldo: { decrement: currentBilling.jumlah } },
					});

					// Revert student payment totals
					await prisma.student.update({
						where: { id: currentBilling.studentId },
						data: {
							totalBayar: { decrement: currentBilling.jumlah },
							statusBayar: "Belum Lunas",
						},
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

			// Cache result for idempotency
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

		// Check for idempotency
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

			// Update student totals
			await prisma.student.update({
				where: { id: billing.studentId },
				data: {
					totalTagihan: { decrement: billing.jumlah },
					...(billing.statusBayar === "Lunas" && {
						totalBayar: { decrement: billing.jumlah },
					}),
				},
			});

			// If billing was paid, delete associated cashflow (which cascades to delete Billing)
			// If not, delete billing directly
			if (billing.cashflowId) {
				try {
					await prisma.cashflow.delete({
						where: { id: billing.cashflowId },
					});
				} catch {
					// If cashflow missing for some reason, try deleting billing directly
					await prisma.billing.delete({ where: { id } });
				}
			} else {
				await prisma.billing.delete({
					where: { id },
				});
			}

			// Cache result for idempotency
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
