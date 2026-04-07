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
	periodeBulan: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
	catatan: string | null;
	// Optional fields for extended usage
	isOverdue?: boolean;
	createdAt?: string;
}

export interface BillingSummary {
	totalTagihan: number;
	totalBelumLunas: number;
	totalLunas: number;
	countBelumLunas: number;
	countLunas: number;
}

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
	periodeBulan: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
}
