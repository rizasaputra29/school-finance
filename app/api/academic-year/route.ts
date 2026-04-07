import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

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

				// Generate closing entries
				const revenueAccounts = await prisma.account.findMany({
					where: { tipeAkun: "Revenue" },
				});
				const expenseAccounts = await prisma.account.findMany({
					where: { tipeAkun: "Expense" },
				});

				let saldoBerjalanAccount = await prisma.account.findFirst({
					where: { kodeAkun: "3-000" },
				});

				if (!saldoBerjalanAccount) {
					saldoBerjalanAccount = await prisma.account.create({
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
					if (revenueAccount.saldo > 0) {
						const entry = await prisma.journalEntry.create({
							data: {
								tanggal: closingDate,
								keterangan: `Penutupan Pendapatan - ${revenueAccount.namaAkun}`,
								reference: `closing:${id}`,
							},
						});

						await prisma.journalEntryLine.createMany({
							data: [
								{
									journalEntryId: entry.id,
									kodeAkun: revenueAccount.kodeAkun,
									debit: revenueAccount.saldo,
									kredit: 0,
								},
								{
									journalEntryId: entry.id,
									kodeAkun: saldoBerjalanAccount.kodeAkun,
									debit: 0,
									kredit: revenueAccount.saldo,
								},
							],
						});

						await prisma.account.update({
							where: { id: revenueAccount.id },
							data: { saldo: 0 },
						});
					}
				}

				// Close Expense accounts
				for (const expenseAccount of expenseAccounts) {
					if (expenseAccount.saldo > 0) {
						const entry = await prisma.journalEntry.create({
							data: {
								tanggal: closingDate,
								keterangan: `Penutupan Beban - ${expenseAccount.namaAkun}`,
								reference: `closing:${id}`,
							},
						});

						await prisma.journalEntryLine.createMany({
							data: [
								{
									journalEntryId: entry.id,
									kodeAkun: saldoBerjalanAccount.kodeAkun,
									debit: expenseAccount.saldo,
									kredit: 0,
								},
								{
									journalEntryId: entry.id,
									kodeAkun: expenseAccount.kodeAkun,
									debit: 0,
									kredit: expenseAccount.saldo,
								},
							],
						});

						await prisma.account.update({
							where: { id: expenseAccount.id },
							data: { saldo: 0 },
						});
					}
				}

				const closedYear = await prisma.academicYear.update({
					where: { id },
					data: { isActive: false, isArchived: true },
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

			const currentActiveYear = await prisma.academicYear.findFirst({
				where: { isActive: true },
			});

			const result = await prisma.$transaction(async (tx) => {
				if (currentActiveYear) {
					await tx.student.updateMany({
						where: { status: "Active" },
						data: { status: "Archived" },
					});

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

				return newAcademicYear;
			});

			return success(result, {
				message: "Tahun ajaran berhasil dibuat dan diaktifkan",
				status: 201,
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

			if (isActive === true) {
				await prisma.academicYear.updateMany({
					where: { isActive: true },
					data: { isActive: false },
				});
			}

			const updatedYear = await prisma.academicYear.update({
				where: { id },
				data: validation.data,
			});

			return success(updatedYear, {
				message: "Tahun ajaran berhasil diperbarui",
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
