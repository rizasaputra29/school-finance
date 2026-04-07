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
	_count?: {
		payrolls?: number;
	};
}

// Minimal employee for payroll
export interface EmployeeMinimal {
	id: string;
	nip?: string;
	nama: string;
	jabatan: string;
	gajiPokok?: number;
}

export interface PayrollRecord {
	id: string;
	employeeId: string;
	employee: {
		nip?: string;
		nama: string;
		jabatan: string;
	};
	periode?: string;
	periodeBulan?: string;
	jenisPembayaran?: string;
	gajiPokok?: number;
	tunjangan?: number;
	potongan?: number;
	totalGaji?: number;
	jumlah?: number;
	status: string;
	tanggalBayar?: string | null;
	keterangan?: string | null;
}
