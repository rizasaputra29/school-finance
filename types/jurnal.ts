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

export interface JournalEntryLine {
	id: string;
	kodeAkun: string;
	debit: number;
	kredit: number;
	account?: {
		namaAkun: string;
		kodeAkun: string;
	} | null;
}

export interface JournalEntryDetail {
	id: string;
	tanggal: string;
	keterangan: string;
	reference: string | null;
	status: string;
	version: number;
	postedAt: string | null;
	postedBy: string | null;
	isBackdated: boolean;
	createdAt: string;
	entries: JournalEntryLine[];
}
