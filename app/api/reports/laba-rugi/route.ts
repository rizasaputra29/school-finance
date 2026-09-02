import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import {
	computeLabaRugiForYear,
	resolveAcademicYear,
	type LabaRugiResult,
} from "@/lib/accounting/accounting-laba-rugi";

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { academicYearId, tahun } = query;

			const academicYear = await resolveAcademicYear(prisma, {
				academicYearId,
				tahun,
			});

			if (!academicYear) {
				return success([], {
					message: "Tahun ajaran tidak ditemukan",
					meta: {
						summary: {
							totalPendapatan: 0,
							totalBeban: 0,
							labaRugi: 0,
							isPositive: true,
							periodeBerjalan: 0,
							periodeSebelumnya: 0,
						},
					},
				});
			}

			const berjalan = await computeLabaRugiForYear(
				prisma,
				academicYear.id,
			);

			// Periode sebelumnya = laba rugi of the academic year immediately before this one
			const previousYear = await prisma.academicYear.findFirst({
				where: {
					tanggalSelesai: { lt: academicYear.tanggalMulai },
				},
				orderBy: { tanggalSelesai: "desc" },
			});

			let sebelumnya: LabaRugiResult = {
				pendapatan: [],
				beban: [],
				totalPendapatan: 0,
				totalBeban: 0,
				labaRugi: 0,
				isPositive: true,
			};

			if (previousYear) {
				sebelumnya = await computeLabaRugiForYear(
					prisma,
					previousYear.id,
				);
			}

			const totalLabaRugi = berjalan.labaRugi + sebelumnya.labaRugi;

			const data = [...berjalan.pendapatan, ...berjalan.beban];

			return success(data, {
				message: "Laporan laba rugi berhasil diambil",
				meta: {
					summary: {
						totalPendapatan: berjalan.totalPendapatan,
						totalBeban: berjalan.totalBeban,
						labaRugi: totalLabaRugi,
						isPositive: totalLabaRugi >= 0,
						periodeBerjalan: berjalan.labaRugi,
						periodeSebelumnya: sebelumnya.labaRugi,
					},
					academicYear: {
						startDate: academicYear.tanggalMulai,
						endDate: academicYear.tanggalSelesai,
						tahunAjaran: academicYear.tahunAjaran,
					},
				},
			});
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
