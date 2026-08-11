"use server";

import prisma from "@/lib/prisma";

export interface DashboardSummary {
	totalDebit: number;
	totalKredit: number;
	saldo: number;
	totalStudents: number;
	lunasCount: number;
	belumLunasCount: number;
}

export interface DashboardTransaction {
	id: string;
	tanggal: string;
	keterangan: string;
	kodeAkun: string;
	debit: number;
	kredit: number;
}

export interface DashboardChartData {
	pieChart: {
		name: string;
		value: number;
		color: string;
	}[];
	barChart: {
		bulan: string;
		pendapatan: number;
		beban: number;
	}[];
}

const COLORS = [
	"#059DEA",
	"#10B981",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
	"#6366F1",
	"#14B8A6",
];

const monthNames = [
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

export async function getDashboardSummary(
	startDate?: string,
	endDate?: string,
): Promise<DashboardSummary> {
	const dateFilter: Record<string, unknown> = {};
	if (startDate && endDate) {
		dateFilter.gte = new Date(startDate);
		dateFilter.lte = new Date(endDate);
	}

	const [totalStudents, studentsWithBillings, cashflowTotals] =
		await Promise.all([
			prisma.student.count({ where: { status: "Active" } }),
			prisma.student.findMany({
				where: { status: "Active" },
				select: {
					id: true,
					billings: {
						select: { statusBayar: true },
					},
				},
			}),
			prisma.cashflow.aggregate({
				_sum: { debit: true, kredit: true },
				where: startDate && endDate ? { tanggal: dateFilter } : {},
			}),
		]);

	const totalDebit = cashflowTotals._sum.debit || 0;
	const totalKredit = cashflowTotals._sum.kredit || 0;

	let lunasCount = 0;
	let belumLunasCount = 0;

	for (const student of studentsWithBillings) {
		if (student.billings.length === 0) {
			belumLunasCount++;
		} else if (student.billings.every((b) => b.statusBayar === "Lunas")) {
			lunasCount++;
		} else {
			belumLunasCount++;
		}
	}

	return {
		totalDebit,
		totalKredit,
		saldo: totalDebit - totalKredit,
		totalStudents,
		lunasCount,
		belumLunasCount,
	};
}

export async function getRecentTransactions(
	startDate?: string,
	endDate?: string,
): Promise<DashboardTransaction[]> {
	const dateFilter: Record<string, unknown> = {};
	if (startDate && endDate) {
		dateFilter.gte = new Date(startDate);
		dateFilter.lte = new Date(endDate);
	}

	const recentTransactions = await prisma.cashflow.findMany({
		where: startDate && endDate ? { tanggal: dateFilter } : {},
		orderBy: { tanggal: "desc" },
		take: 10,
	});

	return recentTransactions.map((tx) => ({
		id: tx.id,
		tanggal: tx.tanggal.toISOString(),
		keterangan: tx.keterangan,
		kodeAkun: tx.kodeAkun,
		debit: tx.debit,
		kredit: tx.kredit,
	}));
}

export async function getDashboardChartData(
	bulan: number,
	tahun: number,
): Promise<DashboardChartData> {
	const startOfMonth = new Date(tahun, bulan - 1, 1);
	const endOfMonth = new Date(tahun, bulan, 0, 23, 59, 59, 999);

	const expensesByCategory = await prisma.cashflow.groupBy({
		by: ["kategori"],
		where: {
			kredit: { gt: 0 },
			tanggal: { gte: startOfMonth, lte: endOfMonth },
		},
		_sum: { kredit: true },
	});

	const pieChart = expensesByCategory
		.filter((item) => item._sum.kredit && item._sum.kredit > 0)
		.map((item, index) => ({
			name: item.kategori || "Lainnya",
			value: item._sum.kredit || 0,
			color: COLORS[index % COLORS.length],
		}))
		.sort((a, b) => b.value - a.value)
		.slice(0, 6);

	const monthlyData = await Promise.all(
		Array.from({ length: 12 }, (_, i) => {
			const monthStart = new Date(tahun, i, 1);
			const monthEnd = new Date(tahun, i + 1, 0, 23, 59, 59, 999);

			return prisma.cashflow.aggregate({
				_sum: { debit: true, kredit: true },
				where: { tanggal: { gte: monthStart, lte: monthEnd } },
			});
		}),
	);

	const barChart = monthlyData.map((data, index) => ({
		bulan: monthNames[index],
		pendapatan: data._sum.debit || 0,
		beban: data._sum.kredit || 0,
	}));

	return { pieChart, barChart };
}
