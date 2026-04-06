/**
 * Reports Types
 * Shared type definitions for reports across the application
 */

export interface AccountReportItem {
	kodeAkun: string;
	namaAkun: string;
	tipeAkun?: string;
	jumlah: number;
	kategori?: string;
}

export interface ReportSummary {
	totalAccounts?: number;
	totalAssets?: number;
	totalLiabilities?: number;
	totalEquity?: number;
	totalAset?: number;
	totalKewajiban?: number;
	totalEkuitas?: number;
	totalPendapatan?: number;
	totalBeban?: number;
	labaRugi?: number;
	isPositive?: boolean;
}
