/**
 * Jurnal Types
 * Shared type definitions for journal entries across the application
 */

export interface JurnalLine {
	id: string;
	tanggal: string;
	kodeAkun: string;
	namaAkun: string;
	keterangan: string;
	debit: number;
	kredit: number;
	reference?: string | null;
}
