/**
 * Reminder Types
 * Shared type definitions for reminders across the application
 */

export interface Reminder {
	id: string;
	type: "hutang" | "penyusutan" | "piutang" | "payroll";
	title: string;
	description: string;
	amount?: number;
	dueDate?: string;
}