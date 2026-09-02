"use server";

import prisma from "@/lib/prisma";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";
import type { Account } from "@prisma/client";

export interface DashboardSummary {
	totalRevenue: number;
	totalExpense: number;
	netIncome: number;
	totalAssets: number;
	totalLiabilities: number;
	totalEquity: number;
	totalStudents: number;
	lunasCount: number;
	belumLunasCount: number;
	totalBillingDue: number;
	activeEmployees: number;
	totalMonthlySalary: number;
	academicYear: {
		id: string;
		tahunAjaran: string;
		tanggalMulai: Date;
		tanggalSelesai: Date;
	} | null;
}

export interface DashboardTransaction {
	id: string;
	tanggal: string;
	keterangan: string;
	reference: string;
	amount: number;
}

export interface DashboardChartMonth {
	month: string;
	revenue: number;
	expense: number;
	net: number;
}

export interface DashboardChartData {
	academicYear: DashboardChartMonth[];
	calendarYear: DashboardChartMonth[];
}

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

const fullMonthNames = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

export async function getActiveAcademicYear() {
	return prisma.academicYear.findFirst({
		where: { isActive: true },
		orderBy: { tanggalMulai: "desc" },
	});
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
	const academicYear = await getActiveAcademicYear();

	const yearFilter = academicYear
		? {
				gte: academicYear.tanggalMulai,
				lte: academicYear.tanggalSelesai,
			}
		: undefined;

	const balanceDateLimit = academicYear
		? { lte: academicYear.tanggalSelesai }
		: undefined;

	const [
		accounts,
		revenueLines,
		expenseLines,
		balanceLines,
		totalStudents,
		studentsWithBillings,
		activeEmployees,
		employeeSalaryAgg,
		unpaidBillingsAgg,
	] = await Promise.all([
		prisma.account.findMany(),
		prisma.journalEntryLine.aggregate({
			_sum: { debit: true, kredit: true },
			where: {
				account: { tipeAkun: "Revenue" },
				journalEntry: {
					status: "posted",
					tanggal: yearFilter,
				},
			},
		}),
		prisma.journalEntryLine.aggregate({
			_sum: { debit: true, kredit: true },
			where: {
				account: { tipeAkun: "Expense" },
				journalEntry: {
					status: "posted",
					tanggal: yearFilter,
				},
			},
		}),
		prisma.journalEntryLine.findMany({
			where: {
				journalEntry: {
					status: "posted",
					tanggal: balanceDateLimit,
				},
			},
			include: { account: true },
		}),
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
		prisma.employee.count({ where: { status: "Active" } }),
		prisma.employee.aggregate({
			_sum: { gajiPokok: true },
			where: { status: "Active" },
		}),
		prisma.billing.aggregate({
			_sum: { jumlah: true },
			where: {
				statusBayar: { in: ["Belum Lunas", "Partial"] },
			},
		}),
	]);

	const accountMap = new Map(accounts.map((a) => [a.kodeAkun, a]));

	const totalRevenue =
		(revenueLines._sum.kredit ?? 0) - (revenueLines._sum.debit ?? 0);
	const totalExpense =
		(expenseLines._sum.debit ?? 0) - (expenseLines._sum.kredit ?? 0);

	let totalAssets = 0;
	let totalLiabilities = 0;
	let totalEquity = 0;

	for (const line of balanceLines) {
		const account = line.account;
		if (!account) continue;
		const change = computeSaldoChange(
			account,
			line.debit,
			line.kredit,
		);
		if (account.tipeAkun === "Asset") totalAssets += change;
		if (account.tipeAkun === "Liability") totalLiabilities += change;
		if (account.tipeAkun === "Equity") totalEquity += change;
	}

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
		totalRevenue,
		totalExpense,
		netIncome: totalRevenue - totalExpense,
		totalAssets,
		totalLiabilities,
		totalEquity,
		totalStudents,
		lunasCount,
		belumLunasCount,
		totalBillingDue: unpaidBillingsAgg._sum?.jumlah ?? 0,
		activeEmployees,
		totalMonthlySalary: employeeSalaryAgg._sum.gajiPokok ?? 0,
		academicYear: academicYear
			? {
					id: academicYear.id,
					tahunAjaran: academicYear.tahunAjaran,
					tanggalMulai: academicYear.tanggalMulai,
					tanggalSelesai: academicYear.tanggalSelesai,
				}
			: null,
	};
}

export async function getRecentTransactions(): Promise<DashboardTransaction[]> {
	const recentEntries = await prisma.journalEntry.findMany({
		where: { status: "posted" },
		orderBy: { tanggal: "desc" },
		take: 10,
		include: { entries: true },
	});

	return recentEntries.map((entry) => {
		const totalAmount = entry.entries.reduce(
			(sum: number, line: { debit: number }) => sum + Number(line.debit),
			0,
		);
		return {
			id: entry.id,
			tanggal: entry.tanggal.toISOString(),
			keterangan: entry.keterangan,
			reference: entry.reference ?? "-",
			amount: totalAmount,
		};
	});
}

async function fetchMonthlyChartData(
	startDate: Date,
	endDate: Date,
): Promise<DashboardChartMonth[]> {
	const rows = await prisma.$queryRaw<
		{ month: Date; revenue: bigint; expense: bigint }[]
	>`
		SELECT
			DATE_TRUNC('month', je.tanggal) AS month,
			SUM(CASE WHEN a."tipeAkun" = 'Revenue' THEN jel.kredit - jel.debit ELSE 0 END) AS revenue,
			SUM(CASE WHEN a."tipeAkun" = 'Expense' THEN jel.debit - jel.kredit ELSE 0 END) AS expense
		FROM "JournalEntryLine" jel
		JOIN "JournalEntry" je ON je.id = jel."journalEntryId"
		JOIN "Account" a ON a."kodeAkun" = jel."kodeAkun"
		WHERE je.status = 'posted'
			AND je.tanggal >= ${startDate}
			AND je.tanggal <= ${endDate}
		GROUP BY DATE_TRUNC('month', je.tanggal)
		ORDER BY month ASC
	`;

	const dataMap = new Map<number, { revenue: number; expense: number }>();
	for (const row of rows) {
		dataMap.set(row.month.getMonth(), {
			revenue: Number(row.revenue),
			expense: Number(row.expense),
		});
	}

	const result: DashboardChartMonth[] = [];
	let current = new Date(startDate);
	while (current <= endDate) {
		const month = current.getMonth();
		const values = dataMap.get(month) ?? { revenue: 0, expense: 0 };
		result.push({
			month: monthNames[month],
			revenue: values.revenue,
			expense: values.expense,
			net: values.revenue - values.expense,
		});
		current.setMonth(current.getMonth() + 1);
	}
	return result;
}

export async function getDashboardChartData(): Promise<DashboardChartData> {
	const academicYear = await getActiveAcademicYear();
	const now = new Date();
	const currentYear = now.getFullYear();

	const academicYearData = academicYear
		? await fetchMonthlyChartData(
				academicYear.tanggalMulai,
				academicYear.tanggalSelesai,
			)
		: [];

	const calendarYearData = await fetchMonthlyChartData(
		new Date(currentYear, 0, 1),
		new Date(currentYear, 11, 31, 23, 59, 59, 999),
	);

	return {
		academicYear: academicYearData,
		calendarYear: calendarYearData,
	};
}
