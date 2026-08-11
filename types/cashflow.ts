/**
 * Cashflow Types
 * Shared type definitions for Cashflow entities across the application
 */

// Full cashflow interface
export interface Cashflow {
	id: string;
	tanggal: string;
	keterangan: string;
	kodeAkun: string;
	debit: number;
	kredit: number;
	// Optional properties for different use cases
	kategori?: string | null;
	referenceId?: string | null;
	status?: string;
	createdAt?: string;
	account?: {
		namaAkun: string;
	};
}

// Minimal cashflow for dashboard
export interface CashflowMinimal {
	id: string;
	tanggal: string;
	debit: number;
	kredit: number;
}

export interface CashflowSummary {
	totalDebit: number;
	totalKredit: number;
	saldo: number;
}

// Export record type for use in export routes
export interface CashflowRecord {
	id: string;
	tanggal: Date;
	keterangan: string;
	kodeAkun: string;
	debit: number;
	kredit: number;
	account?: {
		namaAkun: string;
	};
}

// Grouped cashflow card (double-entry)
export interface CashflowEntry {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	debit: number;
	kredit: number;
	source?: string | null;
}

export interface CashflowCard {
	id: string;
	tanggal: string;
	keterangan: string;
	kategori?: string | null;
	status: string;
	entries: CashflowEntry[];
	totalDebit: number;
	totalKredit: number;
}
