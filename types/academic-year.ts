/**
 * Academic Year Types
 * Shared type definitions for academic years across the application
 */

export interface AcademicYear {
	id: string;
	tahunAjaran: string;
	tanggalMulai: string;
	tanggalSelesai: string;
	isActive: boolean;
	isArchived: boolean;
}
