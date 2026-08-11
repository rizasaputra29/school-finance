/**
 * Billing Types
 * Shared type definitions for Billing entities across the application
 */

import type { StudentMinimal } from "./student";

// Full billing interface
export interface Billing {
	id: string;
	studentId: string;
	student: StudentMinimal;
	jenisBiaya: string;
	tipe: string;
	bulan?: number | null;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
	tanggalJatuhTempo?: string | null;
	keterangan?: string | null;
	catatan: string | null;
	isCicilan: boolean;
	tenor: number | null;
	cicilanGroupId?: string | null;
	cashflowId?: string | null;
	isOverdue?: boolean;
	createdAt?: string;
}

export interface BillingSummary {
	totalTagihan: number;
	totalBelumLunas: number;
	totalLunas: number;
	totalCicilan: number;
	countBelumLunas: number;
	countLunas: number;
	countCicilan: number;
	countOverdue: number;
}

// Grouped billing for expandable rows (cicilan, SPP bulanan, Gaji bulanan)
export interface BillingGroup {
	isGroup: true;
	id: string;
	studentId: string;
	student: StudentMinimal;
	jenisBiaya: string;
	label: string;
	totalJumlah: number;
	statusBayar: string;
	children: Billing[];
}

// Union type for table rows
export type BillingRow = Billing | BillingGroup;

// Export record type for use in export routes
export interface BillingRecord {
	id: string;
	studentId: string;
	student: {
		nis: string;
		nama: string;
		kelas: string;
	};
	jenisBiaya: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
}
