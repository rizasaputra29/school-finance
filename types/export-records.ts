/**
 * Export Record Types
 * Shared type definitions for export routes across the application
 * Used in PDF, Excel, and other export functionality
 */

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

// Re-export record types from entity files for convenience
export type { AccountRecord } from "./account";
export type { CashflowRecord } from "./cashflow";
export type { StudentRecord } from "./student";
export type { BillingRecord } from "./billing";

export interface JsPDFWithAutoTable extends jsPDF {
	autoTable: (options: UserOptions) => jsPDF;
}