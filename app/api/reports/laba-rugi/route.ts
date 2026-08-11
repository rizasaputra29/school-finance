import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { academicYearId } = query;

			let startDate: Date;
			let endDate: Date;

			if (academicYearId) {
				const academicYear = await prisma.academicYear.findUnique({
					where: { id: academicYearId },
				});
				if (!academicYear) {
					return success([], {
						message: "Tahun ajaran tidak ditemukan",
						meta: { summary: { totalPendapatan: 0, totalBeban: 0, labaRugi: 0, status: "LABA", periodeSebelumnya: 0, periodeBerjalan: 0 } },
					});
				}
				startDate = academicYear.tanggalMulai;
				endDate = academicYear.tanggalSelesai;
			} else {
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (!activeYear) {
					return success([], {
						message: "Tidak ada tahun ajaran aktif",
						meta: { summary: { totalPendapatan: 0, totalBeban: 0, labaRugi: 0, status: "LABA", periodeSebelumnya: 0, periodeBerjalan: 0 } },
					});
				}
				startDate = activeYear.tanggalMulai;
				endDate = activeYear.tanggalSelesai;
			}

			const accounts = await prisma.account.findMany({
				where: { tipeAkun: { in: ["Revenue", "Expense"] } },
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			});

			// Periode Berjalan: journal entries within current academic year, excluding closing entries
			const currentYearLines = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: { gte: startDate, lte: endDate },
						status: "posted",
						reference: { not: { startsWith: "closing:" } },
					},
				},
			});

			// Periode Sebelumnya: read cumulative laba rugi from 302 account balance
			let labaRugiSebelumnya = 0;
			if (academicYearId) {
				const balance302 = await prisma.accountBalance.findUnique({
					where: { kodeAkun_academicYearId: { kodeAkun: "302", academicYearId } },
				});
				labaRugiSebelumnya = balance302?.saldo ?? 0;
			} else {
				const account302 = await prisma.account.findFirst({
					where: { kodeAkun: "302" },
				});
				labaRugiSebelumnya = account302?.saldo ?? 0;
			}

			const currentMap = new Map<string, { debit: number; kredit: number }>();
			for (const line of currentYearLines) {
				currentMap.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			const revenueAccounts = accounts.filter((a) => a.tipeAkun === "Revenue");
			const expenseAccounts = accounts.filter((a) => a.tipeAkun === "Expense");

			function calcBalance(account: { kodeAkun: string; tipeAkun: string }, map: Map<string, { debit: number; kredit: number }>) {
				const m = map.get(account.kodeAkun) || { debit: 0, kredit: 0 };
				if (account.tipeAkun === "Revenue") return m.kredit - m.debit;
				return m.debit - m.kredit;
			}

			let totalPendapatanBerjalan = 0;
			let totalBebanBerjalan = 0;

			const revenueData = revenueAccounts.map((account) => {
				const berjalan = calcBalance(account, currentMap);
				totalPendapatanBerjalan += berjalan;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					tipeAkun: account.tipeAkun,
					berjalan,
					sebelumnya: 0,
					total: berjalan,
				};
			});

			const expenseData = expenseAccounts.map((account) => {
				const berjalan = calcBalance(account, currentMap);
				totalBebanBerjalan += berjalan;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					tipeAkun: account.tipeAkun,
					berjalan,
					sebelumnya: 0,
					total: berjalan,
				};
			});

			const labaRugiBerjalan = totalPendapatanBerjalan - totalBebanBerjalan;
			const labaRugi = labaRugiBerjalan + labaRugiSebelumnya;
			const status = labaRugi >= 0 ? "LABA" : "RUGI";

			const data = [
				...revenueData.map((item) => ({ ...item, kategori: "PENDAPATAN" })),
				...expenseData.map((item) => ({ ...item, kategori: "BEBAN" })),
			];

			return success(data, {
				message: "Laporan laba rugi berhasil diambil",
				meta: {
					summary: {
						totalPendapatan: totalPendapatanBerjalan,
						totalBeban: totalBebanBerjalan,
						labaRugi,
						status,
						isPositive: labaRugi >= 0,
						periodeBerjalan: labaRugiBerjalan,
						periodeSebelumnya: labaRugiSebelumnya,
					},
					academicYear: { startDate, endDate },
				},
			});
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
