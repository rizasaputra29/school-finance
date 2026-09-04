/**
 * Cashflow display helpers
 */

export type CashflowSource = "101" | "102" | "kas" | "bank";

export function getSourceLabel(source?: CashflowSource | string | null): string {
	if (source === "102" || source === "bank") return "Bank";
	return "Kas";
}

export function getSourceCode(source?: CashflowSource | string | null): "101" | "102" {
	if (source === "102" || source === "bank") return "102";
	return "101";
}
