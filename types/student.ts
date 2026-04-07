/**
 * Student Types
 * Shared type definitions for Student entities across the application
 */

// Full student interface
export interface Student {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
	jenisKelamin?: string | null;
	tahunMasuk: number;
	tahunAjaran?: string | null;
	namaOrtu?: string | null;
	noTelp?: string | null;
	statusBayar: string;
	status: string;
	totalTagihan: number;
	totalBayar: number;
	sisaTagihan?: number;
}

// Minimal student for billing and payment
export interface StudentMinimal {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
	totalTagihan?: number;
	totalBayar?: number;
}

// Export record type for use in export routes
export interface StudentRecord {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
	jenjang?: string;
	totalTagihan?: number;
	totalBayar?: number;
	sisaTagihan?: number;
}
