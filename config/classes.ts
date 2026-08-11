/**
 * Static configuration for class list.
 * Used for student management and billing.
 */

export const CLASS_LIST = [
	"TK A",
	"TK B",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
] as const;

export type ClassName = (typeof CLASS_LIST)[number];

/**
 * Get class options for select dropdowns
 */
export function getClassOptions(): { value: string; label: string }[] {
	return CLASS_LIST.map((cls) => ({
		value: cls,
		label: cls.length <= 2 ? `Kelas ${cls}` : cls,
	}));
}

/**
 * Get billing type options
 */
export const BILLING_TYPES = [
	"Pendaftaran",
	"Uang Pangkal",
	"Uang Gedung",
	"Uang Kegiatan",
	"Uang Seragam",
	"Uang ATK",
	"SPP",
] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

/**
 * Get billing type options for select dropdowns
 */
export function getBillingTypeOptions(): { value: string; label: string }[] {
	return BILLING_TYPES.map((type) => ({
		value: type,
		label: type,
	}));
}
