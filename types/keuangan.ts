/**
 * Keuangan Types
 * Shared type definitions for financial transfers across the application
 */

export interface MutasiEntry {
	id: string;
	tanggal: string;
	kodeAkunAsal?: string;
	namaAkunAsal?: string;
	kodeAkunTujuan?: string;
	namaAkunTujuan?: string;
	keterangan: string;
	entries: Array<{
		kodeAkun: string;
		debit: number;
		kredit: number;
		account: { namaAkun: string; kodeAkun: string };
	}>;
}
