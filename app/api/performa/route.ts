import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const tahun = searchParams.get("tahun");
			const year = tahun ? parseInt(tahun) : new Date().getFullYear();
			const startDate = new Date(year, 0, 1);
			const endDate = new Date(year, 11, 31, 23, 59, 59);

			// Fetch all journal entry lines with their accounts for the selected year
			const journalLines = await prisma.journalEntryLine.findMany({
				where: {
					journalEntry: {
						tanggal: { gte: startDate, lte: endDate },
						status: "posted",
					},
				},
				include: {
					journalEntry: { select: { tanggal: true } },
					account: {
						select: { kodeAkun: true, namaAkun: true, tipeAkun: true },
					},
				},
			});

			// === Monthly Revenue vs Expense bar chart ===
			const monthlyData: Array<{
				bulan: string;
				pendapatan: number;
				beban: number;
				netProfit: number;
			}> = [];
			for (let m = 0; m < 12; m++) {
				const mStart = new Date(year, m, 1);
				const mEnd = new Date(year, m + 1, 0, 23, 59, 59);

				let pendapatan = 0;
				let beban = 0;

				for (const line of journalLines) {
					const d = new Date(line.journalEntry.tanggal);
					if (d >= mStart && d <= mEnd) {
						if (line.account.tipeAkun === "Revenue") {
							pendapatan += line.kredit - line.debit;
						} else if (line.account.tipeAkun === "Expense") {
							beban += line.debit - line.kredit;
						}
					}
				}

				monthlyData.push({
					bulan: MONTH_NAMES[m],
					pendapatan,
					beban,
					netProfit: pendapatan - beban,
				});
			}

			// === Expense category pie chart ===
			const expenseByCategory: Record<string, number> = {};
			for (const line of journalLines) {
				if (line.account.tipeAkun === "Expense" && line.debit > 0) {
					const name = line.account.namaAkun;
					expenseByCategory[name] = (expenseByCategory[name] || 0) + line.debit;
				}
			}
			const pieChart = Object.entries(expenseByCategory)
				.map(([name, value]) => ({ name, value }))
				.sort((a, b) => b.value - a.value);

			// === Revenue category pie chart ===
			const revenueByCategory: Record<string, number> = {};
			for (const line of journalLines) {
				if (line.account.tipeAkun === "Revenue" && line.kredit > 0) {
					const name = line.account.namaAkun;
					revenueByCategory[name] =
						(revenueByCategory[name] || 0) + line.kredit;
				}
			}
			const revenuePie = Object.entries(revenueByCategory)
				.map(([name, value]) => ({ name, value }))
				.sort((a, b) => b.value - a.value);

			// === Totals ===
			const totalPendapatan = monthlyData.reduce(
				(sum, m) => sum + m.pendapatan,
				0,
			);
			const totalBeban = monthlyData.reduce((sum, m) => sum + m.beban, 0);
			const netProfit = totalPendapatan - totalBeban;

			// === Cashflow trend (Kas + Bank balance over months) ===
			const accounts = await prisma.account.findMany({
				where: { kodeAkun: { in: ["101", "102"] } },
			});
			const initialKas = accounts.find((a) => a.kodeAkun === "101")?.saldo || 0;
			const initialBank =
				accounts.find((a) => a.kodeAkun === "102")?.saldo || 0;

			const kasLines = journalLines.filter(
				(l) => l.account.kodeAkun === "101" || l.account.kodeAkun === "102",
			);
			const cashflowTrend: Array<{ bulan: string; kas: number; bank: number }> =
				[];
			let kasRunning = initialKas;
			let bankRunning = initialBank;

			for (let m = 0; m < 12; m++) {
				const mStart = new Date(year, m, 1);
				const mEnd = new Date(year, m + 1, 0, 23, 59, 59);

				for (const line of kasLines) {
					const d = new Date(line.journalEntry.tanggal);
					if (d >= mStart && d <= mEnd) {
						if (line.account.kodeAkun === "101") {
							kasRunning += line.debit - line.kredit;
						} else {
							bankRunning += line.debit - line.kredit;
						}
					}
				}

				cashflowTrend.push({
					bulan: MONTH_NAMES[m],
					kas: kasRunning,
					bank: bankRunning,
				});
			}

			return success(
				{
					year,
					summary: { totalPendapatan, totalBeban, netProfit },
					barChart: monthlyData,
					expensePie: pieChart,
					revenuePie,
					cashflowTrend,
				},
				{
					message: "Data performa berhasil diambil",
				},
			);
		} catch (error) {
			console.error("Performa API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}
