import { addMonths } from "date-fns";
import { postToJournal } from "./journal";

export const MONTH_NAMES = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

// Account code constants
export const KAS_ACCOUNT_CODE = "101";
export const BANK_ACCOUNT_CODE = "102";
export const PIUTANG_SISWA_ACCOUNT_CODE = "103";
export const PIUTANG_KARYAWAN_ACCOUNT_CODE = "104";
export const HUTANG_USAHA_ACCOUNT_CODE = "200";
export const EMPLOYEE_REVENUE_ACCOUNT = "406";

// Map billing type to revenue account code (Siswa)
export const FEE_TYPE_TO_ACCOUNT_CODE: Record<string, string> = {
	Pendaftaran: "400",
	"Uang Pangkal": "401",
	"Uang Gedung": "401",
	"Uang Kegiatan": "402",
	"Uang Seragam": "403",
	"Uang ATK": "404",
	SPP: "405",
	Hibah: "408",
};

// Map employee expense type to expense account code
export const EMPLOYEE_EXPENSE_ACCOUNTS: Record<string, string> = {
	Gaji: "500",
	Tunjangan: "501",
	Bonus: "501",
	Lembur: "500",
	Transport: "507",
	Makan: "510",
	Lainnya: "500",
};

export function getRevenueAccountCode(jenisBiaya: string): string {
	return FEE_TYPE_TO_ACCOUNT_CODE[jenisBiaya] || "406";
}

export function getExpenseAccountCode(jenisBiaya: string): string {
	return EMPLOYEE_EXPENSE_ACCOUNTS[jenisBiaya] || "500";
}

export function getCashAccountCode(source: "kas" | "bank"): string {
	return source === "bank" ? BANK_ACCOUNT_CODE : KAS_ACCOUNT_CODE;
}

export interface InstallmentPlanItem {
	cicilanKe: number;
	jumlah: number;
	tanggalJatuhTempo: Date;
}

export function generateInstallmentPlan(params: {
	jumlahTotal: number;
	tenor: number;
	tanggalMulai: Date;
}): InstallmentPlanItem[] {
	const { jumlahTotal, tenor, tanggalMulai } = params;
	const jumlahPerCicilan = Math.round((jumlahTotal / tenor) * 100) / 100;

	return Array.from({ length: tenor }, (_, index) => ({
		cicilanKe: index + 1,
		jumlah: jumlahPerCicilan,
		tanggalJatuhTempo: addMonths(tanggalMulai, index),
	}));
}

export interface CicilanBillingData {
	studentId: string;
	jenisBiaya: string;
	jumlah: number;
	bulan: number;
	keterangan: string;
	tanggalJatuhTempo: Date;
	statusBayar: string;
	isCicilan: boolean;
	tenor: number;
	cicilanGroupId: string;
	academicYearId: string;
}

export function generateCicilanBillings(params: {
	studentId: string;
	jenisBiaya: string;
	jumlahTotal: number;
	tenor: number;
	startDate: Date;
	academicYearId: string;
	cicilanGroupId: string;
}): CicilanBillingData[] {
	const { studentId, jenisBiaya, jumlahTotal, tenor, startDate, academicYearId, cicilanGroupId } = params;
	const jumlahPerBulan = Math.round((jumlahTotal / tenor) * 100) / 100;

	return Array.from({ length: tenor }, (_, index) => {
		const dueDate = addMonths(startDate, index);
		const monthName = MONTH_NAMES[dueDate.getMonth()];
		return {
			studentId,
			jenisBiaya,
			jumlah: jumlahPerBulan,
			bulan: index + 1,
			keterangan: `${jenisBiaya} Bulan ${monthName} (Cicilan ${index + 1}/${tenor})`,
			tanggalJatuhTempo: dueDate,
			statusBayar: "Belum Lunas",
			isCicilan: true,
			tenor,
			cicilanGroupId,
			academicYearId,
		};
	});
}

export function isInstallmentOverdue(installment: {
	tanggalJatuhTempo: Date;
	status: string;
}): boolean {
	if (installment.status === "Bayar") return false;
	return new Date() > new Date(installment.tanggalJatuhTempo);
}

export function isBillingOverdue(billing: {
	tanggalJatuhTempo: Date | null;
	statusBayar: string;
}): boolean {
	if (billing.statusBayar === "Lunas") return false;
	if (!billing.tanggalJatuhTempo) return false;
	return new Date() > new Date(billing.tanggalJatuhTempo);
}

type TransactionClient = Parameters<
	Parameters<typeof import("@/lib/prisma").default["$transaction"]>[0]
>[0];

export async function postBillingPaymentToJournal(
	tx: TransactionClient,
	params: {
		billingId: string;
		studentId: string;
		studentName: string;
		studentNis: string;
		jenisBiaya: string;
		jumlah: number;
		paymentDate: Date;
		source: "kas" | "bank";
		isOverdue: boolean;
		user?: { role: string; email: string };
	},
) {
	const cashCode = getCashAccountCode(params.source);
	const reference = `billing-${params.billingId}-${Date.now()}`;

	if (params.isOverdue) {
		// Late payment: revenue was already recognized when piutang was created
		// Dr Kas/Bank, Cr Piutang Siswa
		return postToJournal(tx, {
			tanggal: params.paymentDate,
			keterangan: `Pembayaran ${params.jenisBiaya} - ${params.studentName} (${params.studentNis})`,
			reference,
			entries: [
				{ kodeAkun: cashCode, debit: params.jumlah, kredit: 0 },
				{ kodeAkun: PIUTANG_SISWA_ACCOUNT_CODE, debit: 0, kredit: params.jumlah },
			],
			userRole: (params.user?.role as "owner" | "admin" | "user") || "admin",
			userEmail: params.user?.email || "system",
		});
	}

	// On-time payment: recognize revenue directly
	// Dr Kas/Bank, Cr Revenue
	const revenueCode = getRevenueAccountCode(params.jenisBiaya);
	return postToJournal(tx, {
		tanggal: params.paymentDate,
		keterangan: `Pembayaran ${params.jenisBiaya} - ${params.studentName} (${params.studentNis})`,
		reference,
		entries: [
			{ kodeAkun: cashCode, debit: params.jumlah, kredit: 0 },
			{ kodeAkun: revenueCode, debit: 0, kredit: params.jumlah },
		],
		userRole: (params.user?.role as "owner" | "admin" | "user") || "admin",
		userEmail: params.user?.email || "system",
	});
}

export async function postInstallmentPaymentToJournal(
	tx: TransactionClient,
	params: {
		installmentId: string;
		studentName: string;
		studentNis: string;
		jenisBiaya?: string;
		cicilanKe: number;
		jumlah: number;
		paymentDate: Date;
		isOverdue: boolean;
		source: "kas" | "bank";
		user?: { role: string; email: string };
	},
) {
	const cashCode = getCashAccountCode(params.source);
	const reference = `installment-${params.installmentId}-${Date.now()}`;

	if (params.isOverdue) {
		// Late payment: revenue was already recognized when piutang was created
		// Dr Kas/Bank, Cr Piutang Siswa
		return postToJournal(tx, {
			tanggal: params.paymentDate,
			keterangan: `Pembayaran Cicilan ${params.cicilanKe} - ${params.studentName} (${params.studentNis})${params.jenisBiaya ? ` - ${params.jenisBiaya}` : ""}`,
			reference,
			entries: [
				{ kodeAkun: cashCode, debit: params.jumlah, kredit: 0 },
				{ kodeAkun: PIUTANG_SISWA_ACCOUNT_CODE, debit: 0, kredit: params.jumlah },
			],
			userRole: (params.user?.role as "owner" | "admin" | "user") || "admin",
			userEmail: params.user?.email || "system",
		});
	}

	// On-time payment: recognize revenue directly
	// Dr Kas/Bank, Cr Revenue
	const revenueCode = getRevenueAccountCode(params.jenisBiaya || "SPP");
	return postToJournal(tx, {
		tanggal: params.paymentDate,
		keterangan: `Pembayaran Cicilan ${params.cicilanKe} - ${params.studentName} (${params.studentNis})${params.jenisBiaya ? ` - ${params.jenisBiaya}` : ""}`,
		reference,
		entries: [
			{ kodeAkun: cashCode, debit: params.jumlah, kredit: 0 },
			{ kodeAkun: revenueCode, debit: 0, kredit: params.jumlah },
		],
		userRole: (params.user?.role as "owner" | "admin" | "user") || "admin",
		userEmail: params.user?.email || "system",
	});
}

export async function postEmployeeBillingPaymentToJournal(
	tx: TransactionClient,
	params: {
		billingId: string;
		employeeId: string;
		employeeName: string;
		employeeNip: string;
		jenisBiaya: string;
		jumlah: number;
		paymentDate: Date;
		tipe: "tagihan" | "pembayaran";
		source: "kas" | "bank";
		user?: { role: string; email: string };
	},
) {
	const cashCode = getCashAccountCode(params.source);
	const reference = `emp-billing-${params.billingId}-${Date.now()}`;

	let entries: { kodeAkun: string; debit: number; kredit: number }[];

	if (params.tipe === "tagihan") {
		const revenueCode = EMPLOYEE_REVENUE_ACCOUNT;
		entries = [
			{ kodeAkun: cashCode, debit: params.jumlah, kredit: 0 },
			{ kodeAkun: revenueCode, debit: 0, kredit: params.jumlah },
		];
	} else {
		const expenseCode = getExpenseAccountCode(params.jenisBiaya);
		entries = [
			{ kodeAkun: expenseCode, debit: params.jumlah, kredit: 0 },
			{ kodeAkun: cashCode, debit: 0, kredit: params.jumlah },
		];
	}

	return postToJournal(tx, {
		tanggal: params.paymentDate,
		keterangan: `${params.jenisBiaya} - ${params.employeeName} (${params.employeeNip})`,
		reference,
		entries,
		userRole: (params.user?.role as "owner" | "admin" | "user") || "admin",
		userEmail: params.user?.email || "system",
	});
}

// ---- Grouping utilities for expandable rows ----

export interface BillingRowData {
	id: string;
	studentId: string;
	student: { id: string; nis: string; nama: string; kelas: string };
	jenisBiaya: string;
	bulan?: number | null;
	jumlah: number;
	statusBayar: string;
	tanggalBayar?: string | null;
	tanggalJatuhTempo?: string | null;
	keterangan?: string | null;
	catatan?: string | null;
	isCicilan: boolean;
	tenor?: number | null;
	cicilanGroupId?: string | null;
	isGroup?: boolean;
	label?: string;
	totalJumlah?: number;
	children?: BillingRowData[];
}

export function groupBillings(billings: BillingRowData[]): BillingRowData[] {
	const grouped: BillingRowData[] = [];
	const processed = new Set<string>();

	for (const b of billings) {
		if (processed.has(b.id)) continue;

		// 1. Group cicilan billings by cicilanGroupId
		if (b.cicilanGroupId) {
			const children = billings.filter(
				(x) => x.cicilanGroupId === b.cicilanGroupId,
			);
			children.forEach((c) => processed.add(c.id));
			const totalJumlah = children.reduce((sum, c) => sum + c.jumlah, 0);
			const allPaid = children.every((c) => c.statusBayar === "Lunas");
			const nonePaid = children.every(
				(c) => c.statusBayar !== "Lunas",
			);
			grouped.push({
				...b,
				isGroup: true,
				label: `${b.jenisBiaya} ${children.length} cicilan`,
				totalJumlah,
				statusBayar: allPaid ? "Lunas" : nonePaid ? "Belum Lunas" : "Sebagian",
				children,
			});
			continue;
		}

		// 2. Group SPP billings by studentId + jenisBiaya=SPP
		if (b.jenisBiaya === "SPP" && b.bulan != null) {
			const children = billings.filter(
				(x) =>
					x.studentId === b.studentId &&
					x.jenisBiaya === "SPP" &&
					!x.cicilanGroupId,
			);
			if (children.length > 1) {
				children.forEach((c) => processed.add(c.id));
				const totalJumlah = children.reduce((sum, c) => sum + c.jumlah, 0);
				const allPaid = children.every((c) => c.statusBayar === "Lunas");
				const nonePaid = children.every(
					(c) => c.statusBayar !== "Lunas",
				);
				grouped.push({
					...b,
					isGroup: true,
					label: `SPP ${children.length} bulan`,
					totalJumlah,
					statusBayar: allPaid ? "Lunas" : nonePaid ? "Belum Lunas" : "Sebagian",
					children,
				});
				continue;
			}
		}

		// 3. Ungrouped billing
		processed.add(b.id);
		grouped.push(b);
	}

	return grouped;
}

// ---- Employee billing grouping ----

export interface EmployeeBillingRowData {
	id: string;
	employeeId: string;
	employee: { id: string; nip: string; nama: string; jabatan: string };
	jenisBiaya: string;
	tipe: string;
	bulan?: number | null;
	jumlah: number;
	statusBayar: string;
	tanggalBayar?: string | null;
	tanggalJatuhTempo?: string | null;
	keterangan?: string | null;
	catatan?: string | null;
	isGroup?: boolean;
	label?: string;
	totalJumlah?: number;
	children?: EmployeeBillingRowData[];
}

export function groupEmployeeBillings(billings: EmployeeBillingRowData[]): EmployeeBillingRowData[] {
	const grouped: EmployeeBillingRowData[] = [];
	const processed = new Set<string>();

	for (const b of billings) {
		if (processed.has(b.id)) continue;

		// Group Gaji billings by employeeId + jenisBiaya
		if (b.bulan != null) {
			const children = billings.filter(
				(x) =>
					x.employeeId === b.employeeId &&
					x.jenisBiaya === b.jenisBiaya &&
					x.bulan != null,
			);
			if (children.length > 1) {
				children.forEach((c) => processed.add(c.id));
				const totalJumlah = children.reduce((sum, c) => sum + c.jumlah, 0);
				const allPaid = children.every((c) => c.statusBayar === "Lunas");
				const nonePaid = children.every(
					(c) => c.statusBayar !== "Lunas",
				);
				grouped.push({
					...b,
					isGroup: true,
					label: `${b.jenisBiaya} ${children.length} bulan`,
					totalJumlah,
					statusBayar: allPaid ? "Lunas" : nonePaid ? "Belum Lunas" : "Sebagian",
					children,
				});
				continue;
			}
		}

		// Ungrouped billing
		processed.add(b.id);
		grouped.push(b);
	}

	return grouped;
}
