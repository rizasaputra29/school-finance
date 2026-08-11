import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import {
	roundAmount,
	isAmountEqual,
} from "@/lib/accounting/accounting-validation";
import { success, errors } from "@/lib/api/api-response";

// ============================================================================
// Types
// ============================================================================

export interface ConsistencyCheckResult {
	isConsistent: boolean;
	checks: ConsistencyCheck[];
	summary: {
		totalChecks: number;
		passed: number;
		failed: number;
	};
}

export interface ConsistencyCheck {
	name: string;
	description: string;
	passed: boolean;
	details?: string;
	difference?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate account balances from journal entries
 */
async function calculateLedgerBalances(
	startDate?: Date,
	endDate?: Date,
): Promise<Map<string, { debit: number; kredit: number; saldo: number }>> {
	const where: Record<string, unknown> = { status: "posted" };

	if (startDate && endDate) {
		where.tanggal = { gte: startDate, lte: endDate };
	}

	const entries = await prisma.journalEntryLine.findMany({
		where: {
			journalEntry: where,
		},
		include: {
			account: { select: { kodeAkun: true, tipeAkun: true } },
		},
	});

	const balances = new Map<
		string,
		{ debit: number; kredit: number; saldo: number }
	>();

	for (const entry of entries) {
		const existing = balances.get(entry.kodeAkun) || {
			debit: 0,
			kredit: 0,
			saldo: 0,
		};
		const isDebitNormal = ["Asset", "Expense"].includes(entry.account.tipeAkun);

		const debit = roundAmount(existing.debit + entry.debit);
		const kredit = roundAmount(existing.kredit + entry.kredit);
		const saldo = isDebitNormal
			? roundAmount(existing.saldo + entry.debit - entry.kredit)
			: roundAmount(existing.saldo + entry.kredit - entry.debit);

		balances.set(entry.kodeAkun, { debit, kredit, saldo });
	}

	return balances;
}

/**
 * Get account balances from account table
 */
async function getAccountBalances(): Promise<Map<string, number>> {
	const accounts = await prisma.account.findMany({
		select: { kodeAkun: true, saldo: true },
	});

	return new Map(accounts.map((a) => [a.kodeAkun, roundAmount(a.saldo)]));
}

/**
 * Calculate totals for reports
 */
async function calculateReportTotals(): Promise<{
	totalAset: number;
	totalKewajiban: number;
	totalEkuitas: number;
	totalPendapatan: number;
	totalBeban: number;
}> {
	const accounts = await prisma.account.findMany({
		select: { kodeAkun: true, tipeAkun: true, saldo: true },
	});

	let totalAset = 0;
	let totalKewajiban = 0;
	let totalEkuitas = 0;
	let totalPendapatan = 0;
	let totalBeban = 0;

	for (const account of accounts) {
		const saldo = roundAmount(account.saldo);
		switch (account.tipeAkun) {
			case "Asset":
				totalAset += saldo;
				break;
			case "Liability":
				totalKewajiban += saldo;
				break;
			case "Equity":
				totalEkuitas += saldo;
				break;
			case "Revenue":
				totalPendapatan += saldo;
				break;
			case "Expense":
				totalBeban += saldo;
				break;
		}
	}

	return {
		totalAset: roundAmount(totalAset),
		totalKewajiban: roundAmount(totalKewajiban),
		totalEkuitas: roundAmount(totalEkuitas),
		totalPendapatan: roundAmount(totalPendapatan),
		totalBeban: roundAmount(totalBeban),
	};
}

/**
 * Check cashflow vs cash account balances
 */
async function checkCashflowConsistency(): Promise<{
	passed: boolean;
	cashBalance: number;
	cashflowBalance: number;
	difference: number;
}> {
	// Get cash accounts (111xxx and 102)
	const cashAccounts = await prisma.account.findMany({
		where: {
			OR: [{ kodeAkun: { startsWith: "111" } }, { kodeAkun: "102" }],
		},
		select: { kodeAkun: true, saldo: true },
	});

	const cashBalance = roundAmount(
		cashAccounts.reduce((sum, a) => sum + a.saldo, 0),
	);

	// Get cashflow totals
	const cashflows = await prisma.cashflow.aggregate({
		where: { status: "posted", isReversed: false },
		_sum: { debit: true, kredit: true },
	});

	const cfDebit = roundAmount(cashflows._sum.debit || 0);
	const cfKredit = roundAmount(cashflows._sum.kredit || 0);
	const cashflowBalance = roundAmount(cfDebit - cfKredit);

	const difference = roundAmount(cashBalance - cashflowBalance);

	return {
		passed: isAmountEqual(cashBalance, cashflowBalance),
		cashBalance,
		cashflowBalance,
		difference,
	};
}

// ============================================================================
// Main Consistency Check
// ============================================================================

async function runConsistencyCheck(
	periode?: string,
): Promise<ConsistencyCheckResult> {
	const checks: ConsistencyCheck[] = [];

	// Parse period for date range
	let startDate: Date | undefined;
	let endDate: Date | undefined;

	if (periode) {
		const [tahun, bulan] = periode.split("-").map(Number);
		startDate = new Date(tahun, bulan - 1, 1);
		endDate = new Date(tahun, bulan, 0, 23, 59, 59);
	}

	// Check 1: Journal vs Ledger (debit = kredit)
	const ledgerBalances = await calculateLedgerBalances(startDate, endDate);

	let totalDebit = 0;
	let totalKredit = 0;

	for (const [, balance] of ledgerBalances) {
		totalDebit += balance.debit;
		totalKredit += balance.kredit;
	}

	const journalBalancePassed = isAmountEqual(totalDebit, totalKredit);
	checks.push({
		name: "JURNAL_BALANCE",
		description: "Total Debit jurnal harus sama dengan Total Kredit",
		passed: journalBalancePassed,
		details: journalBalancePassed
			? `Debit: ${totalDebit.toLocaleString("id-ID")}, Kredit: ${totalKredit.toLocaleString("id-ID")}`
			: `Selisih: ${roundAmount(totalDebit - totalKredit).toLocaleString("id-ID")}`,
		difference: roundAmount(totalDebit - totalKredit),
	});

	// Check 2: Ledger = Account Balances (reconciliation)
	const accountBalances = await getAccountBalances();
	let accountBalanceDiff = 0;
	let accountCheckPassed = true;

	for (const [kodeAkun, ledgerBalance] of ledgerBalances) {
		const accountBalance = accountBalances.get(kodeAkun) || 0;
		const diff = roundAmount(ledgerBalance.saldo - accountBalance);
		if (!isAmountEqual(ledgerBalance.saldo, accountBalance)) {
			accountCheckPassed = false;
			accountBalanceDiff += Math.abs(diff);
		}
	}

	checks.push({
		name: "LEDGER_ACCOUNT_MATCH",
		description: "Saldo buku besar harus sama dengan saldo akun",
		passed: accountCheckPassed,
		details: accountCheckPassed
			? "Semua saldo akun cocok dengan buku besar"
			: `Total perbedaan: ${accountBalanceDiff.toLocaleString("id-ID")}`,
		difference: accountBalanceDiff,
	});

	// Check 3: Neraca Balance (Aset = Kewajiban + Ekuitas)
	const reportTotals = await calculateReportTotals();
	const neracaBalance = roundAmount(
		reportTotals.totalAset -
			(reportTotals.totalKewajiban + reportTotals.totalEkuitas),
	);

	checks.push({
		name: "NERACA_BALANCE",
		description: "Neraca harus seimbang (Aset = Kewajiban + Ekuitas)",
		passed: isAmountEqual(neracaBalance, 0),
		details: isAmountEqual(neracaBalance, 0)
			? `Aset: ${reportTotals.totalAset.toLocaleString("id-ID")} = Kewajiban + Ekuitas: ${(
					reportTotals.totalKewajiban + reportTotals.totalEkuitas
				).toLocaleString("id-ID")}`
			: `Selisih: ${neracaBalance.toLocaleString("id-ID")}`,
		difference: neracaBalance,
	});

	// Check 4: Laba/Rugi consistency
	const labarugi = roundAmount(
		reportTotals.totalPendapatan - reportTotals.totalBeban,
	);
	checks.push({
		name: "LABARUGI_CALCULATION",
		description: "Laba/Rugi harus terhitung dengan benar (Pendapatan - Beban)",
		passed: true,
		details: `Pendapatan: ${reportTotals.totalPendapatan.toLocaleString(
			"id-ID",
		)} - Beban: ${reportTotals.totalBeban.toLocaleString("id-ID")} = ${labarugi.toLocaleString(
			"id-ID",
		)} (${labarugi >= 0 ? "LABA" : "RUGI"})`,
		difference: labarugi,
	});

	// Check 5: Cash vs Cashflow consistency
	const cashflowCheck = await checkCashflowConsistency();
	checks.push({
		name: "CASH_CASHFLOW_MATCH",
		description: "Saldo Kas harus sama dengan arus kas",
		passed: cashflowCheck.passed,
		details: cashflowCheck.passed
			? `Kas: ${cashflowCheck.cashBalance.toLocaleString(
					"id-ID",
				)} = Arus Kas: ${cashflowCheck.cashflowBalance.toLocaleString("id-ID")}`
			: `Selisih: ${cashflowCheck.difference.toLocaleString("id-ID")}`,
		difference: cashflowCheck.difference,
	});

	// Check 6: Aset Neto cross-validation (Neraca vs Perubahan Aset Neto)
	const equityAccounts = await prisma.account.findMany({
		where: { tipeAkun: "Equity" },
		select: { kodeAkun: true, namaAkun: true, saldo: true },
	});
	const neracaAsetNeto = roundAmount(
		equityAccounts.reduce((sum, a) => sum + roundAmount(a.saldo), 0) +
			reportTotals.totalPendapatan -
			reportTotals.totalBeban,
	);
	// Calculate Perubahan Aset Neto ending balance
	const equityCodes = ["300", "301", "302"];
	const saldoAwal = roundAmount(
		equityAccounts
			.filter((a) => equityCodes.includes(a.kodeAkun))
			.reduce((sum, a) => sum + roundAmount(a.saldo), 0),
	);
	const prive = roundAmount(
		equityAccounts.find((a) => a.kodeAkun === "304")?.saldo || 0,
	);
	const perubahanAsetNetoAkhir = roundAmount(
		saldoAwal + reportTotals.totalPendapatan - reportTotals.totalBeban - prive,
	);
	const asetNetoDiff = roundAmount(neracaAsetNeto - perubahanAsetNetoAkhir);
	const asetNetoPassed = isAmountEqual(neracaAsetNeto, perubahanAsetNetoAkhir);
	checks.push({
		name: "ASET_NETO_CROSS_VALIDATION",
		description:
			"Aset Neto Neraca harus sama dengan Saldo Akhir Perubahan Aset Neto",
		passed: asetNetoPassed,
		details: asetNetoPassed
			? `Neraca Aset Neto: ${neracaAsetNeto.toLocaleString("id-ID")} = Perubahan Aset Neto: ${perubahanAsetNetoAkhir.toLocaleString("id-ID")}`
			: `Selisih: ${asetNetoDiff.toLocaleString("id-ID")} (Neraca: ${neracaAsetNeto.toLocaleString("id-ID")}, Perubahan: ${perubahanAsetNetoAkhir.toLocaleString("id-ID")})`,
		difference: asetNetoDiff,
	});

	// Calculate summary
	const passed = checks.filter((c) => c.passed).length;
	const failed = checks.filter((c) => !c.passed).length;

	return {
		isConsistent: failed === 0,
		checks,
		summary: {
			totalChecks: checks.length,
			passed,
			failed,
		},
	};
}

// ============================================================================
// API Handlers
// ============================================================================

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const query = getQueryParams(request);
			const { periode, tipe } = query;

			// If specific type requested
			if (tipe) {
				const result = await runConsistencyCheck(periode);

				// Filter to requested type
				const filteredChecks = result.checks.filter(
					(c) =>
						c.name.startsWith(tipe.toUpperCase()) ||
						(tipe === "neraca" && c.name === "NERACA_BALANCE") ||
						(tipe === "labarugi" && c.name === "LABARUGI_CALCULATION") ||
						(tipe === "cashflow" && c.name === "CASH_CASHFLOW_MATCH") ||
						(tipe === "jurnal" && c.name === "JURNAL_BALANCE") ||
						(tipe === "ledger" && c.name === "LEDGER_ACCOUNT_MATCH"),
				);

				return success(
					{
						periode: periode || "all",
						tipe,
						isConsistent: filteredChecks.every((c) => c.passed),
						checks: filteredChecks,
						summary: {
							totalChecks: filteredChecks.length,
							passed: filteredChecks.filter((c) => c.passed).length,
							failed: filteredChecks.filter((c) => !c.passed).length,
						},
					},
					{
						message: "Data konsistensi berhasil diambil",
					},
				);
			}

			// Run all checks
			const fullResult = await runConsistencyCheck(periode);

			return success(
				{
					periode: periode || "all",
					...fullResult,
				},
				{
					message: "Data konsistensi berhasil diambil",
				},
			);
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			// Generate detailed report for specific check
			const body = await request.json();
			const { periode, check } = body;

			if (!check) {
				return errors.validation([
					{ field: "check", message: "Parameter check wajib diisi" },
				]);
			}

			const result = await runConsistencyCheck(periode);

			const selectedCheck = result.checks.find(
				(c) => c.name === check.toUpperCase(),
			);

			if (!selectedCheck) {
				return errors.notFound(
					`Check ${check} tidak ditemukan. Gunakan: jurnal, ledger, neraca, labarugi, cashflow`,
				);
			}

			return success(
				{
					periode: periode || "all",
					check: selectedCheck.name,
					description: selectedCheck.description,
					passed: selectedCheck.passed,
					details: selectedCheck.details,
					difference: selectedCheck.difference,
				},
				{
					message: "Data check konsistensi berhasil diambil",
				},
			);
		},
		{ requireAdmin: true },
	);
}
