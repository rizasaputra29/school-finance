/**
 * Dashboard Types
 * Shared type definitions for dashboard data across the application
 */

export interface ChartData {
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

export interface DashboardData {
	summary: {
		totalDebit: number;
		totalKredit: number;
		saldo: number;
		totalStudents: number;
		lunasCount: number;
		belumLunasCount: number;
	};
	cashflows: {
		id: string;
		tanggal: string;
		debit: number;
		kredit: number;
	}[];
	recentTransactions: {
		id: string;
		tanggal: string;
		keterangan: string;
		kodeAkun: string;
		debit: number;
		kredit: number;
	}[];
}
