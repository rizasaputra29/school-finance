/**
 * Buku Besar Types
 * Shared type definitions for ledger reports across the application
 */

export interface BukuBesarEntry {
	id: string;
	tanggal: string;
	keterangan: string;
	reference: string | null;
	debit: number;
	kredit: number;
	saldo: number;
}

export interface BukuBesarReportData {
	account: {
		kodeAkun: string;
		namaAkun: string;
		tipeAkun: string;
	};
	data: BukuBesarEntry[];
	entries?: BukuBesarEntry[];
	summary: {
		openingBalance: number;
		totalDebit: number;
		totalKredit: number;
		endingBalance: number;
	};
}
