/**
 * Account Types
 * Shared type definitions for Account entities across the application
 */

// Full account interface
export interface Account {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	saldo: number;
}

// Minimal account for select dropdowns and simple displays
export interface AccountMinimal {
	kodeAkun: string;
	namaAkun: string;
}

// For jurnal and buku besar (no tipeAkun needed)
export interface AccountSimple {
	id: string;
	kodeAkun: string;
	namaAkun: string;
}

// Export record type for use in export routes
export interface AccountRecord {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	saldo: number;
}

export interface AccountSummary {
	totalAssets: number;
	totalLiabilities: number;
	totalEquity: number;
	totalRevenue: number;
	totalExpense: number;
}
