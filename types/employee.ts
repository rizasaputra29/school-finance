/**
 * Employee Types
 * Shared type definitions for Employee (Karyawan) entities across the application
 */

// Full employee interface
export interface Employee {
	id: string;
	nip: string;
	nama: string;
	jabatan: string;
	jenisKelamin?: string | null;
	noTelp?: string | null;
	alamat?: string | null;
	tanggalMasuk: string;
	gajiPokok: number;
	tunjangan?: number;
	status: string;
	totalTagihan?: number;
	totalBayar?: number;
	statusBayar?: string;
	_count?: {
		employeeBillings?: number;
		billings?: number;
	};
}

// Minimal employee for billing context
export interface EmployeeMinimal {
	id: string;
	nip?: string;
	nama: string;
	jabatan: string;
	gajiPokok?: number;
}
