import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { processDepreciationForAcademicYear } from "@/lib/accounting/accounting-depreciation-service";

const createAcademicYearSchema = z.object({
	tahunAjaran: z
		.string()
		.min(1, "Tahun ajaran wajib diisi")
		.max(20, "Tahun ajaran maksimal 20 karakter"),
	tanggalMulai: z
		.string()
		.or(z.date())
		.transform((val) => new Date(val)),
	tanggalSelesai: z
		.string()
		.or(z.date())
		.transform((val) => new Date(val)),
});

const updateAcademicYearSchema = z.object({
	tahunAjaran: z.string().min(1).max(20).optional(),
	tanggalMulai: z
		.string()
		.or(z.date())
		.transform((val) => new Date(val))
		.optional(),
	tanggalSelesai: z
		.string()
		.or(z.date())
		.transform((val) => new Date(val))
		.optional(),
	isActive: z.boolean().optional(),
	isArchived: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const includeArchived = searchParams.get("includeArchived");

			const where = includeArchived === "true" ? {} : { isArchived: false };

			const academicYears = await prisma.academicYear.findMany({
				where,
				orderBy: { tahunAjaran: "desc" },
			});

			const activeYear = academicYears.find((ay) => ay.isActive);

			return success(academicYears, {
				message: "Data tahun ajaran berhasil diambil",
				meta: { activeYear: activeYear || null },
			});
		} catch (error) {
			console.error("Academic Year API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const body = await request.json();

			// Handle action-based POST requests
			if (body.action === "close") {
				const { id } = body;

				if (!id) {
					return errors.validation([
						{ field: "id", message: "ID tahun ajaran wajib diisi" },
					]);
				}

				const academicYear = await prisma.academicYear.findUnique({
					where: { id },
				});

				if (!academicYear) {
					return errors.notFound("Tahun ajaran");
				}

				if (academicYear.isArchived) {
					return errors.badRequest("Tahun ajaran sudah diarsipkan");
				}

				// Generate closing entries inside transaction
				const closedYear = await prisma.$transaction(async (tx) => {
					const revenueAccounts = await tx.account.findMany({
						where: { tipeAkun: "Revenue" },
					});
					const expenseAccounts = await tx.account.findMany({
						where: { tipeAkun: "Expense" },
					});

					let saldoBerjalanAccount = await tx.account.findFirst({
						where: { kodeAkun: "3-000" },
					});

					if (!saldoBerjalanAccount) {
						saldoBerjalanAccount = await tx.account.create({
							data: {
								kodeAkun: "3-000",
								namaAkun: "Saldo Berjalan",
								tipeAkun: "Equity",
								saldo: 0,
							},
						});
					}

					const closingDate = academicYear.tanggalSelesai;

					// Close Revenue accounts
					for (const revenueAccount of revenueAccounts) {
						if (revenueAccount.saldo !== 0) {
							const amount = Math.abs(revenueAccount.saldo);
							const entry = await tx.journalEntry.create({
								data: {
									tanggal: closingDate,
									keterangan: `Penutupan Pendapatan - ${revenueAccount.namaAkun}`,
									reference: `closing:${id}`,
									status: "posted",
								},
							});

							await tx.journalEntryLine.createMany({
								data: [
									{
										journalEntryId: entry.id,
										kodeAkun: revenueAccount.kodeAkun,
										debit: amount,
										kredit: 0,
									},
									{
										journalEntryId: entry.id,
										kodeAkun: saldoBerjalanAccount.kodeAkun,
										debit: 0,
										kredit: amount,
									},
								],
							});

							await tx.account.update({
								where: { id: revenueAccount.id },
								data: { saldo: 0 },
							});
						}
					}

					// Close Expense accounts
					for (const expenseAccount of expenseAccounts) {
						if (expenseAccount.saldo !== 0) {
							const amount = Math.abs(expenseAccount.saldo);
							const entry = await tx.journalEntry.create({
								data: {
									tanggal: closingDate,
									keterangan: `Penutupan Beban - ${expenseAccount.namaAkun}`,
									reference: `closing:${id}`,
									status: "posted",
								},
							});

							await tx.journalEntryLine.createMany({
								data: [
									{
										journalEntryId: entry.id,
										kodeAkun: saldoBerjalanAccount.kodeAkun,
										debit: amount,
										kredit: 0,
									},
									{
										journalEntryId: entry.id,
										kodeAkun: expenseAccount.kodeAkun,
										debit: 0,
										kredit: amount,
									},
								],
							});

							await tx.account.update({
								where: { id: expenseAccount.id },
								data: { saldo: 0 },
							});
						}
					}

					// Transfer 3-000 net balance to 302 Laba Rugi Periode Sebelumnya
					const saldoBerjalanFinal = await tx.account.findUnique({
						where: { kodeAkun: "3-000" },
					});

					if (saldoBerjalanFinal && saldoBerjalanFinal.saldo !== 0) {
						const netAmount = Math.abs(saldoBerjalanFinal.saldo);
						const isProfit = saldoBerjalanFinal.saldo > 0;

						let account302 = await tx.account.findFirst({
							where: { kodeAkun: "302" },
						});

						if (!account302) {
							account302 = await tx.account.create({
								data: {
									kodeAkun: "302",
									namaAkun: "Laba (Rugi) Periode Sebelumnya",
									tipeAkun: "Equity",
									saldo: 0,
								},
							});
						}

						const transferEntry = await tx.journalEntry.create({
							data: {
								tanggal: closingDate,
								keterangan: `Transfer ${isProfit ? "Laba" : "Rugi"} ke Laba Rugi Periode Sebelumnya`,
								reference: `closing:${id}`,
								status: "posted",
							},
						});

						if (isProfit) {
							await tx.journalEntryLine.createMany({
								data: [
									{ journalEntryId: transferEntry.id, kodeAkun: "3-000", debit: netAmount, kredit: 0 },
									{ journalEntryId: transferEntry.id, kodeAkun: "302", debit: 0, kredit: netAmount },
								],
							});
						} else {
							await tx.journalEntryLine.createMany({
								data: [
									{ journalEntryId: transferEntry.id, kodeAkun: "302", debit: netAmount, kredit: 0 },
									{ journalEntryId: transferEntry.id, kodeAkun: "3-000", debit: 0, kredit: netAmount },
								],
							});
						}

						// Update account balances
						await tx.account.update({
							where: { kodeAkun: "3-000" },
							data: { saldo: 0 },
						});
						await tx.account.update({
							where: { kodeAkun: "302" },
							data: { saldo: { increment: isProfit ? netAmount : -netAmount } },
						});

						// Upsert AccountBalance snapshots for closing year
						await tx.accountBalance.upsert({
							where: { kodeAkun_academicYearId: { kodeAkun: "302", academicYearId: id } },
							update: { saldo: isProfit ? netAmount : -netAmount },
							create: { kodeAkun: "302", academicYearId: id, saldo: isProfit ? netAmount : -netAmount },
						});
						await tx.accountBalance.upsert({
							where: { kodeAkun_academicYearId: { kodeAkun: "3-000", academicYearId: id } },
							update: { saldo: 0 },
							create: { kodeAkun: "3-000", academicYearId: id, saldo: 0 },
						});
					}

					return tx.academicYear.update({
						where: { id },
						data: { isActive: false, isArchived: true },
					});
				});

				return success(closedYear, {
					message: "Tahun ajaran berhasil ditutup dengan jurnal penutup",
				});
			}

			// Regular POST - Create new academic year
			const validation = createAcademicYearSchema.safeParse(body);
			if (!validation.success) {
				return errors.validation(
					validation.error.issues.map((issue) => ({
						field: issue.path.join("."),
						message: issue.message,
					})),
				);
			}

			const { tahunAjaran, tanggalMulai, tanggalSelesai } = validation.data;

			if (tanggalSelesai <= tanggalMulai) {
				return errors.validation([
					{
						field: "tanggalSelesai",
						message: "Tanggal selesai harus setelah tanggal mulai",
					},
				]);
			}

			const existingYear = await prisma.academicYear.findUnique({
				where: { tahunAjaran },
			});

			if (existingYear) {
				return errors.conflict("Tahun ajaran sudah ada");
			}

			// Validate date overlap with existing academic years
			const overlappingYear = await prisma.academicYear.findFirst({
				where: {
					isArchived: false,
					OR: [
						{
							tanggalMulai: { lte: tanggalSelesai },
							tanggalSelesai: { gte: tanggalMulai },
						},
					],
				},
			});

			if (overlappingYear) {
				return errors.conflict(
					`Tanggal tumpang tindih dengan tahun ajaran ${overlappingYear.tahunAjaran} (${overlappingYear.tanggalMulai.toLocaleDateString("id-ID")} - ${overlappingYear.tanggalSelesai.toLocaleDateString("id-ID")})`,
				);
			}

			const currentActiveYear = await prisma.academicYear.findFirst({
				where: { isActive: true },
			});

			const { result, depreciationResult } = await prisma.$transaction(async (tx) => {
				if (currentActiveYear) {
					await tx.academicYear.update({
						where: { id: currentActiveYear.id },
						data: { isActive: false, isArchived: true },
					});
				}

				const newAcademicYear = await tx.academicYear.create({
					data: {
						tahunAjaran,
						tanggalMulai,
						tanggalSelesai,
						isActive: true,
						isArchived: false,
					},
				});

				// Post full-year straight-line depreciation for all existing assets.
				const depreciationResult = await processDepreciationForAcademicYear(
					tx,
					newAcademicYear.id,
					{ capDate: newAcademicYear.tanggalSelesai },
				);

				return { result: newAcademicYear, depreciationResult };
			});

			return success(result, {
				message: `Tahun ajaran berhasil dibuat dan diaktifkan. Penyusutan diproses untuk ${depreciationResult.assetsProcessed} aset.`,
				status: 201,
				meta: { depreciation: depreciationResult },
			});
		} catch (error) {
			console.error("Academic Year API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function PUT(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const id = searchParams.get("id");

			if (!id) {
				return errors.validation([
					{ field: "id", message: "ID tahun ajaran wajib diisi" },
				]);
			}

			const body = await request.json();

			const validation = updateAcademicYearSchema.safeParse(body);
			if (!validation.success) {
				return errors.validation(
					validation.error.issues.map((issue) => ({
						field: issue.path.join("."),
						message: issue.message,
					})),
				);
			}

			const { isActive } = validation.data;

			const { updatedYear, depreciationResult } = await prisma.$transaction(
				async (tx) => {
					if (isActive === true) {
						await tx.academicYear.updateMany({
							where: { isActive: true },
							data: { isActive: false },
						});
					}

					const updatedYear = await tx.academicYear.update({
						where: { id },
						data: validation.data,
					});

					let depreciationResult = null;
					if (isActive === true) {
						depreciationResult = await processDepreciationForAcademicYear(
							tx,
							updatedYear.id,
							{ capDate: updatedYear.tanggalSelesai },
						);
					}

					return { updatedYear, depreciationResult };
				},
			);

			return success(updatedYear, {
				message:
					isActive === true
						? `Tahun ajaran berhasil diaktifkan. Penyusutan diproses untuk ${depreciationResult?.assetsProcessed ?? 0} aset.`
						: "Tahun ajaran berhasil diperbarui",
				meta: { depreciation: depreciationResult },
			});
		} catch (error) {
			console.error("Academic Year API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function DELETE(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const id = searchParams.get("id");

			if (!id) {
				return errors.validation([
					{ field: "id", message: "ID tahun ajaran wajib diisi" },
				]);
			}

			const academicYear = await prisma.academicYear.findUnique({
				where: { id },
				include: {
					_count: {
						select: { billings: true },
					},
				},
			});

			if (!academicYear) {
				return errors.notFound("Tahun ajaran");
			}

			if (academicYear._count.billings > 0) {
				return errors.badRequest(
					`Tahun ajaran ${academicYear.tahunAjaran} tidak dapat diarsipkan karena masih memiliki ${academicYear._count.billings} tagihan terkait. Hapus atau pindahkan tagihan terlebih dahulu.`,
				);
			}

			const archivedYear = await prisma.academicYear.update({
				where: { id },
				data: { isArchived: true, isActive: false },
			});

			return success(archivedYear, {
				message: "Tahun ajaran berhasil diarsipkan",
			});
		} catch (error) {
			console.error("Academic Year API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}
