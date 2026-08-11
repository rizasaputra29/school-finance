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
import { validateBody } from "@/lib/api/api-validation";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

const MONTH_NAMES = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const generateSppSchema = z.object({
	academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
	jumlahPerBulan: z.number().positive("Jumlah per bulan harus lebih dari 0"),
	tanggalJatuhTempo: z
		.number()
		.int()
		.min(1)
		.max(28, "Tanggal jatuh tempo harus 1-28"),
});

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const ip = getClientIp(request);

			const rateLimitResult = rateLimit(`generate-spp:${ip}`, RATE_LIMITS.create);
			if (!rateLimitResult.success) {
				return errors.rateLimit(formatRateLimitError(rateLimitResult));
			}

			const body = await request.json();

			const validationErrors = validateBody(body, generateSppSchema);
			if (validationErrors) {
				return errors.validation(validationErrors);
			}

			const { academicYearId, jumlahPerBulan, tanggalJatuhTempo: tanggalJatuhTempoDay } =
				body as z.infer<typeof generateSppSchema>;

			try {
				const academicYear = await prisma.academicYear.findUnique({
					where: { id: academicYearId },
				});
				if (!academicYear) {
					return errors.notFound("Tahun Ajaran");
				}

				const students = await prisma.student.findMany({
					where: { status: "Active" },
				});

				if (students.length === 0) {
					return errors.validation([
						{
							field: "students",
							message: "Tidak ada siswa aktif ditemukan",
						},
					]);
				}

				let createdCount = 0;
				let skippedCount = 0;

				const studentIds = students.map((s) => s.id);
				const existingBillings = await prisma.billing.findMany({
					where: {
						studentId: { in: studentIds },
						jenisBiaya: "SPP",
						academicYearId,
					},
					select: { studentId: true, bulan: true },
				});
				const existingSet = new Set(
					existingBillings.map((b) => `${b.studentId}-${b.bulan}`),
				);

				const BATCH_SIZE = 10;

				for (let i = 0; i < students.length; i += BATCH_SIZE) {
					const batch = students.slice(i, i + BATCH_SIZE);

					const result = await prisma.$transaction(
						async (tx) => {
							let batchCreated = 0;
							let batchSkipped = 0;

							for (const student of batch) {
								for (let month = 1; month <= 12; month++) {
									if (existingSet.has(`${student.id}-${month}`)) {
										batchSkipped++;
										continue;
									}

								const startYear = academicYear.tanggalMulai.getFullYear();
								const startMonth = academicYear.tanggalMulai.getMonth();
								const dueYear = month - 1 >= startMonth ? startYear : startYear + 1;
								const dueDate = new Date(dueYear, month - 1, tanggalJatuhTempoDay);

									await tx.billing.create({
										data: {
											studentId: student.id,
											academicYearId,
											jenisBiaya: "SPP",
											bulan: month,
											jumlah: jumlahPerBulan,
											statusBayar: "Belum Lunas",
											tanggalJatuhTempo: dueDate,
											keterangan: `SPP Bulan ${MONTH_NAMES[month - 1]}`,
										},
									});

									batchCreated++;
								}

								const totalTagihan = await tx.billing.aggregate({
									where: {
										studentId: student.id,
										academicYearId,
									},
									_sum: { jumlah: true },
								});

								await tx.student.update({
									where: { id: student.id },
									data: {
										totalTagihan: totalTagihan._sum.jumlah || 0,
										statusBayar: "Belum Lunas",
									},
								});
							}

							return { created: batchCreated, skipped: batchSkipped };
						},
						{ timeout: 30000 },
					);

					createdCount += result.created;
					skippedCount += result.skipped;
				}

				return success(
					{
						created: createdCount,
						skipped: skippedCount,
						students: students.length,
					},
					{
						message: `Berhasil membuat ${createdCount} tagihan SPP untuk ${students.length} siswa`,
					},
				);
			} catch (err) {
				return handlePrismaErrorResponse(err);
			}
		},
		{ requireAdmin: true },
	);
}
