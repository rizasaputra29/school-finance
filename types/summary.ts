/**
 * Summary Types
 * Shared type definitions for summary/statistics across the application
 */

export interface BillingSummary {
	totalTagihan: number;
	totalBelumLunas: number;
	totalLunas: number;
	countBelumLunas: number;
	countLunas: number;
	countOverdue: number;
}

export interface PaymentSummary {
	totalTagihan?: number;
	totalSudahBayar?: number;
	totalSisa?: number;
	jumlahLunas?: number;
	totalUnpaid?: number;
	totalOverdue?: number;
}

export interface CashflowSummary {
	totalDebit: number;
	totalKredit: number;
	saldo?: number;
}

export interface DashboardSummary {
	totalDebit: number;
	totalKredit: number;
	saldo: number;
	totalStudents: number;
	lunasCount: number;
	belumLunasCount: number;
}
