/**
 * Shared profit/loss (laba rugi) computation.
 *
 * Used by both the laba-rugi report and the neraca report so the
 * "laba rugi berjalan" and "laba rugi sebelumnya" figures are always
 * consistent.
 */

import { PrismaClient } from "@prisma/client";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";

export interface LabaRugiItem {
	kodeAkun: string;
	namaAkun: string;
	kategori: "PENDAPATAN" | "BEBAN";
	jumlah: number;
}

export interface LabaRugiResult {
	pendapatan: LabaRugiItem[];
	beban: LabaRugiItem[];
	totalPendapatan: number;
	totalBeban: number;
	labaRugi: number;
	isPositive: boolean;
}

type PrismaTransactionClient = Parameters<
	Parameters<PrismaClient["$transaction"]>[0]
>[0];

/**
 * Compute profit/loss for a single academic year from posted journal lines.
 */
export async function computeLabaRugiForYear(
	tx: PrismaTransactionClient,
	academicYearId: string,
): Promise<LabaRugiResult> {
	const year = await tx.academicYear.findUnique({
		where: { id: academicYearId },
	});

	if (!year) {
		throw new Error("Tahun ajaran tidak ditemukan");
	}

	const accounts = await tx.account.findMany({
		where: { tipeAkun: { in: ["Revenue", "Expense"] } },
		orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
	});

	const revenueAccounts = accounts.filter((a) => a.tipeAkun === "Revenue");
	const expenseAccounts = accounts.filter((a) => a.tipeAkun === "Expense");

	const lineTotals = await tx.journalEntryLine.groupBy({
		by: ["kodeAkun"],
		where: {
			journalEntry: {
				tanggal: { gte: year.tanggalMulai, lte: year.tanggalSelesai },
				status: "posted",
				reference: { not: { startsWith: "closing:" } },
			},
		},
		_sum: { debit: true, kredit: true },
	});

	const lineMap = new Map(
		lineTotals.map((line) => [
			line.kodeAkun,
			{ debit: line._sum.debit ?? 0, kredit: line._sum.kredit ?? 0 },
		]),
	);

	function buildItems(
		list: typeof accounts,
		kategori: "PENDAPATAN" | "BEBAN",
	): LabaRugiItem[] {
		return list.map((account) => {
			const line = lineMap.get(account.kodeAkun) ?? { debit: 0, kredit: 0 };
			const jumlah = computeSaldoChange(account, line.debit, line.kredit);
			return {
				kodeAkun: account.kodeAkun,
				namaAkun: account.namaAkun,
				kategori,
				jumlah,
			};
		});
	}

	const pendapatan = buildItems(revenueAccounts, "PENDAPATAN");
	const beban = buildItems(expenseAccounts, "BEBAN");

	const totalPendapatan = pendapatan.reduce((sum, item) => sum + item.jumlah, 0);
	const totalBeban = beban.reduce((sum, item) => sum + item.jumlah, 0);
	const labaRugi = totalPendapatan - totalBeban;

	return {
		pendapatan,
		beban,
		totalPendapatan,
		totalBeban,
		labaRugi,
		isPositive: labaRugi >= 0,
	};
}

/**
 * Resolve an academic year identifier from either an explicit id or a
 * tahun string (e.g. "2025" matches "2025/2026").
 */
export async function resolveAcademicYear(
	tx: PrismaTransactionClient,
	{
		academicYearId,
		tahun,
	}: { academicYearId?: string | null; tahun?: string | null },
): Promise<{
	id: string;
	tahunAjaran: string;
	tanggalMulai: Date;
	tanggalSelesai: Date;
} | null> {
	if (academicYearId) {
		const year = await tx.academicYear.findUnique({
			where: { id: academicYearId },
		});
		if (year) return year;
	}

	if (tahun) {
		const year = await tx.academicYear.findFirst({
			where: { tahunAjaran: { startsWith: tahun } },
			orderBy: { tanggalMulai: "desc" },
		});
		if (year) return year;
	}

	return tx.academicYear.findFirst({
		where: { isActive: true },
	});
}
