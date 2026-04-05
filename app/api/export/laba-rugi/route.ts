import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { formatRupiah } from "@/lib/utils/utils-currency";

// Types for Prisma v7
interface AccountRecord {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	saldo: number;
}

interface CashflowRecord {
	id: string;
	tanggal: Date;
	kodeAkun: string;
	debit: number;
	kredit: number;
}

// Proper type for jsPDF with autotable plugin
interface JsPDFWithAutoTable extends jsPDF {
	lastAutoTable?: {
		finalY: number;
	};
}

// Helper to get lastAutoTable finalY with fallback
function getLastAutoTableFinalY(doc: jsPDF): number {
	const typedDoc = doc as JsPDFWithAutoTable;
	return typedDoc.lastAutoTable?.finalY ?? 0;
}

// Helper to get period string
function getPeriodString(bulan?: string, tahun?: string): string {
	const monthNames = [
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

	if (bulan && tahun) {
		const monthIdx = parseInt(bulan, 10) - 1;
		return `${monthNames[monthIdx]} ${tahun}`;
	} else if (tahun) {
		return `Tahun ${tahun}`;
	}
	return "";
}

// Export handlers
async function exportToPDF(
	cashflows: CashflowRecord[],
	accounts: AccountRecord[],
	bulan?: string,
	tahun?: string,
): Promise<Buffer> {
	const doc = new jsPDF();
	const pageWidth = doc.internal.pageSize.getWidth();
	const currentDate = new Date().toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const periodStr = getPeriodString(bulan, tahun);

	// Helper function to add header
	const addHeader = (title: string, startY: number = 15): number => {
		doc.setTextColor(0, 0, 0);
		doc.setFontSize(14);
		doc.setFont("helvetica", "bold");
		doc.text(title, pageWidth / 2, startY, { align: "center" });

		doc.setFontSize(11);
		doc.setFont("helvetica", "normal");
		doc.text("SEKOLAH", pageWidth / 2, startY + 7, { align: "center" });

		doc.setFontSize(10);
		doc.text(
			periodStr ? `Per ${periodStr}` : `Per ${currentDate}`,
			pageWidth / 2,
			startY + 14,
			{ align: "center" },
		);

		// Line separator
		doc.setDrawColor(0, 0, 0);
		doc.setLineWidth(0.5);
		doc.line(14, startY + 18, pageWidth - 14, startY + 18);

		return startY + 25;
	};

	// Helper function to add signature section
	const addSignature = (startY: number): void => {
		const y = startY + 15;
		doc.setFontSize(10);
		doc.setFont("helvetica", "normal");
		doc.setTextColor(0, 0, 0);

		doc.text("Dibuat oleh,", 35, y);
		doc.text("___________________", 20, y + 25);
		doc.text("Bendahara", 35, y + 32);

		doc.text("Diperiksa oleh,", pageWidth - 60, y);
		doc.text("___________________", pageWidth - 75, y + 25);
		doc.text("Kepala Sekolah", pageWidth - 60, y + 32);
	};

	// Table styles - formal black and white
	const tableStyles = {
		theme: "plain" as const,
		headStyles: {
			fillColor: [255, 255, 255] as [number, number, number],
			textColor: [0, 0, 0] as [number, number, number],
			fontStyle: "bold" as const,
			lineWidth: 0.3,
			lineColor: [0, 0, 0] as [number, number, number],
		},
		bodyStyles: {
			textColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.1,
			lineColor: [0, 0, 0] as [number, number, number],
		},
		footStyles: {
			fillColor: [240, 240, 240] as [number, number, number],
			textColor: [0, 0, 0] as [number, number, number],
			fontStyle: "bold" as const,
			lineWidth: 0.3,
			lineColor: [0, 0, 0] as [number, number, number],
		},
		alternateRowStyles: {
			fillColor: [250, 250, 250] as [number, number, number],
		},
		styles: {
			fontSize: 9,
			cellPadding: 3,
		},
	};

	// Get Revenue and Expense accounts
	const revenues = accounts.filter((a) => a.tipeAkun === "Revenue");
	const expenses = accounts.filter((a) => a.tipeAkun === "Expense");

	// Calculate revenue amounts from cashflows
	const revenueItems = revenues.map((account) => {
		const accountCashflows = cashflows.filter(
			(cf) => cf.kodeAkun === account.kodeAkun,
		);
		const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
		const totalKredit = accountCashflows.reduce(
			(sum, cf) => sum + cf.kredit,
			0,
		);
		const jumlah = Math.max(0, totalKredit - totalDebit);
		return { ...account, saldo: jumlah };
	});

	// Calculate expense amounts from cashflows
	const expenseItems = expenses.map((account) => {
		const accountCashflows = cashflows.filter(
			(cf) => cf.kodeAkun === account.kodeAkun,
		);
		const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
		const totalKredit = accountCashflows.reduce(
			(sum, cf) => sum + cf.kredit,
			0,
		);
		const jumlah = Math.max(0, totalDebit - totalKredit);
		return { ...account, saldo: jumlah };
	});

	const totalRevenue = revenueItems.reduce((sum, a) => sum + a.saldo, 0);
	const totalExpense = expenseItems.reduce((sum, a) => sum + a.saldo, 0);
	const labaRugi = totalRevenue - totalExpense;

	const startY = addHeader("LAPORAN LABA RUGI");

	// Pendapatan section
	doc.setFontSize(11);
	doc.setFont("helvetica", "bold");
	doc.setTextColor(0, 0, 0);
	doc.text("PENDAPATAN", 14, startY);

	autoTable(doc, {
		startY: startY + 5,
		head: [["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"]],
		body: revenueItems.map((a, i) => [
			(i + 1).toString(),
			a.kodeAkun,
			a.namaAkun,
			formatRupiah(a.saldo),
		]),
		foot: [["", "", "Total Pendapatan", formatRupiah(totalRevenue)]],
		...tableStyles,
		columnStyles: {
			0: { cellWidth: 12, halign: "center" },
			1: { cellWidth: 25 },
			2: { cellWidth: 80 },
			3: { cellWidth: 40, halign: "right" },
		},
	});

	// Beban section
	const finalY1 = getLastAutoTableFinalY(doc) + 10;
	doc.setFontSize(11);
	doc.setFont("helvetica", "bold");
	doc.text("BEBAN", 14, finalY1);

	autoTable(doc, {
		startY: finalY1 + 5,
		head: [["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"]],
		body: expenseItems.map((a, i) => [
			(i + 1).toString(),
			a.kodeAkun,
			a.namaAkun,
			formatRupiah(a.saldo),
		]),
		foot: [["", "", "Total Beban", formatRupiah(totalExpense)]],
		...tableStyles,
		columnStyles: {
			0: { cellWidth: 12, halign: "center" },
			1: { cellWidth: 25 },
			2: { cellWidth: 80 },
			3: { cellWidth: 40, halign: "right" },
		},
	});

	// Laba Rugi summary
	const finalY2 = getLastAutoTableFinalY(doc) + 8;
	doc.setDrawColor(0, 0, 0);
	doc.setLineWidth(0.5);
	doc.line(14, finalY2, pageWidth - 14, finalY2);

	doc.setFontSize(12);
	doc.setFont("helvetica", "bold");
	doc.setTextColor(0, 0, 0);
	doc.text("LABA/RUGI BERSIH:", 14, finalY2 + 8);
	doc.text(formatRupiah(labaRugi), pageWidth - 14, finalY2 + 8, {
		align: "right",
	});

	addSignature(finalY2 + 15);

	// Add page numbers
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);
		doc.setFontSize(9);
		doc.setFont("helvetica", "normal");
		doc.text(
			`Halaman ${i} dari ${pageCount}`,
			pageWidth / 2,
			doc.internal.pageSize.getHeight() - 10,
			{ align: "center" },
		);
	}

	return Buffer.from(doc.output("arraybuffer"));
}

async function exportToExcel(
	cashflows: CashflowRecord[],
	accounts: AccountRecord[],
	bulan?: string,
	tahun?: string,
): Promise<Buffer> {
	const periodStr = getPeriodString(bulan, tahun);
	const currentDate = new Date().toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const workbook = XLSX.utils.book_new();

	// Get Revenue and Expense accounts
	const revenues = accounts.filter((a) => a.tipeAkun === "Revenue");
	const expenses = accounts.filter((a) => a.tipeAkun === "Expense");

	// Calculate revenue amounts from cashflows
	const revenueItems = revenues.map((account) => {
		const accountCashflows = cashflows.filter(
			(cf) => cf.kodeAkun === account.kodeAkun,
		);
		const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
		const totalKredit = accountCashflows.reduce(
			(sum, cf) => sum + cf.kredit,
			0,
		);
		const jumlah = Math.max(0, totalKredit - totalDebit);
		return { ...account, saldo: jumlah };
	});

	// Calculate expense amounts from cashflows
	const expenseItems = expenses.map((account) => {
		const accountCashflows = cashflows.filter(
			(cf) => cf.kodeAkun === account.kodeAkun,
		);
		const totalDebit = accountCashflows.reduce((sum, cf) => sum + cf.debit, 0);
		const totalKredit = accountCashflows.reduce(
			(sum, cf) => sum + cf.kredit,
			0,
		);
		const jumlah = Math.max(0, totalDebit - totalKredit);
		return { ...account, saldo: jumlah };
	});

	const totalRevenue = revenueItems.reduce((sum, a) => sum + a.saldo, 0);
	const totalExpense = expenseItems.reduce((sum, a) => sum + a.saldo, 0);
	const labaRugi = totalRevenue - totalExpense;

	const data = [
		["LAPORAN LABA RUGI"],
		["SEKOLAH"],
		[periodStr ? `Per ${periodStr}` : `Per ${currentDate}`],
		[""],
		["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"],
		[""],
		["PENDAPATAN"],
		...revenueItems.map((a, i) => [
			i + 1,
			a.kodeAkun,
			a.namaAkun,
			formatRupiah(a.saldo),
		]),
		["", "", "Total Pendapatan", formatRupiah(totalRevenue)],
		[""],
		["BEBAN"],
		...expenseItems.map((a, i) => [
			i + 1,
			a.kodeAkun,
			a.namaAkun,
			formatRupiah(a.saldo),
		]),
		["", "", "Total Beban", formatRupiah(totalExpense)],
		[""],
		["", "", "LABA/RUGI BERSIH", formatRupiah(labaRugi)],
		[""],
		[""],
		["Dibuat oleh:", "", "Diperiksa oleh:", ""],
		[""],
		[""],
		["_______________", "", "_______________", ""],
		["Bendahara", "", "Kepala Sekolah", ""],
	];

	const sheet = XLSX.utils.aoa_to_sheet(data);

	// Set column widths
	sheet["!cols"] = [
		{ wch: 5 }, // No
		{ wch: 12 }, // Kode Akun
		{ wch: 35 }, // Nama Akun
		{ wch: 20 }, // Jumlah
	];

	XLSX.utils.book_append_sheet(workbook, sheet, "Laba Rugi");

	return Buffer.from(
		XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
	);
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const query = getQueryParams(request);
				const { format, bulan, tahun } = query;

				if (!format || !["pdf", "excel"].includes(format)) {
					return errors.validation([
						{ field: "format", message: "Format harus pdf atau excel" },
					]);
				}

				// Build date filter
				const cashflowWhere: Record<string, unknown> = {};
				if (bulan && tahun) {
					const month = parseInt(bulan, 10);
					const year = parseInt(tahun, 10);
					const startDate = new Date(year, month - 1, 1);
					const endDate = new Date(year, month, 0, 23, 59, 59);
					cashflowWhere.tanggal = { gte: startDate, lte: endDate };
				} else if (tahun) {
					const year = parseInt(tahun, 10);
					const startDate = new Date(year, 0, 1);
					const endDate = new Date(year, 11, 31, 23, 59, 59);
					cashflowWhere.tanggal = { gte: startDate, lte: endDate };
				}

				// Get cashflows for period
				const cashflows = (await prisma.cashflow.findMany({
					where: cashflowWhere,
					orderBy: [{ tanggal: "asc" }, { createdAt: "asc" }],
				})) as CashflowRecord[];

				// Get Revenue and Expense accounts
				const accounts = (await prisma.account.findMany({
					where: { tipeAkun: { in: ["Revenue", "Expense"] } },
					orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
				})) as AccountRecord[];

				let buffer: Buffer;
				let contentType: string;
				let filename: string;

				if (format === "pdf") {
					buffer = await exportToPDF(cashflows, accounts, bulan, tahun);
					contentType = "application/pdf";
					filename = `laba-rugi-${new Date().toISOString().split("T")[0]}.pdf`;
				} else {
					buffer = await exportToExcel(cashflows, accounts, bulan, tahun);
					contentType =
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
					filename = `laba-rugi-${new Date().toISOString().split("T")[0]}.xlsx`;
				}

				return new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type": contentType,
						"Content-Disposition": `attachment; filename=${filename}`,
					},
				});
			} catch (error) {
				console.error("Export Laba Rugi error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
