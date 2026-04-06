/**
 * Performa Types
 * Shared type definitions for performance reports across the application
 */

export interface PerformaData {
	year: number;
	summary: { totalPendapatan: number; totalBeban: number; netProfit: number };
	barChart: Array<{
		bulan: string;
		pendapatan: number;
		beban: number;
		netProfit: number;
	}>;
	expensePie: Array<{ name: string; value: number }>;
	revenuePie: Array<{ name: string; value: number }>;
	cashflowTrend: Array<{ bulan: string; kas: number; bank: number }>;
}
