import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateFull } from "@/lib/utils/utils-date";

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

interface JsPDFWithAutoTable extends jsPDF {
	lastAutoTable?: { finalY: number };
}

function getLastAutoTableFinalY(doc: jsPDF): number {
	return (doc as JsPDFWithAutoTable).lastAutoTable?.finalY ?? 0;
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const query = getQueryParams(request);
				const { type } = query;
				const currentDate = formatDateFull(new Date());

				const doc = new jsPDF();
				const pageWidth = doc.internal.pageSize.getWidth();

				const addHeader = (title: string, startY: number = 15) => {
					doc.setTextColor(0, 0, 0);
					doc.setFontSize(14);
					doc.setFont("helvetica", "bold");
					doc.text(title, pageWidth / 2, startY, { align: "center" });
					doc.setFontSize(11);
					doc.setFont("helvetica", "normal");
					doc.text("SEKOLAH", pageWidth / 2, startY + 7, { align: "center" });
					doc.setFontSize(10);
					doc.text(`Per ${currentDate}`, pageWidth / 2, startY + 14, {
						align: "center",
					});
					doc.setDrawColor(0, 0, 0);
					doc.setLineWidth(0.5);
					doc.line(14, startY + 18, pageWidth - 14, startY + 18);
					return startY + 25;
				};

				const addSignature = (startY: number) => {
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
					styles: { fontSize: 9, cellPadding: 3 },
				};

				if (type === "laba-rugi") {
					const { bulan, tahun } = query;
					const cashflowWhere: Record<string, unknown> = {};
					if (bulan && tahun) {
						const month = parseInt(bulan, 10);
						const year = parseInt(tahun, 10);
						cashflowWhere.tanggal = {
							gte: new Date(year, month - 1, 1),
							lte: new Date(year, month, 0, 23, 59, 59),
						};
					} else if (tahun) {
						const year = parseInt(tahun, 10);
						cashflowWhere.tanggal = {
							gte: new Date(year, 0, 1),
							lte: new Date(year, 11, 31, 23, 59, 59),
						};
					}

					const cashflows = (await prisma.cashflow.findMany({
						where: cashflowWhere,
						orderBy: [{ tanggal: "asc" }, { createdAt: "asc" }],
					})) as CashflowRecord[];
					const accounts = (await prisma.account.findMany({
						where: { tipeAkun: { in: ["Revenue", "Expense"] } },
						orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
					})) as AccountRecord[];

					const revenues = accounts.filter((a) => a.tipeAkun === "Revenue");
					const expenses = accounts.filter((a) => a.tipeAkun === "Expense");

					const revenueItems = revenues.map((account) => {
						const accountCashflows = cashflows.filter(
							(cf) => cf.kodeAkun === account.kodeAkun,
						);
						const totalDebit = accountCashflows.reduce(
							(sum, cf) => sum + cf.debit,
							0,
						);
						const totalKredit = accountCashflows.reduce(
							(sum, cf) => sum + cf.kredit,
							0,
						);
						return { ...account, saldo: Math.max(0, totalKredit - totalDebit) };
					});

					const expenseItems = expenses.map((account) => {
						const accountCashflows = cashflows.filter(
							(cf) => cf.kodeAkun === account.kodeAkun,
						);
						const totalDebit = accountCashflows.reduce(
							(sum, cf) => sum + cf.debit,
							0,
						);
						const totalKredit = accountCashflows.reduce(
							(sum, cf) => sum + cf.kredit,
							0,
						);
						return { ...account, saldo: Math.max(0, totalDebit - totalKredit) };
					});

					const totalRevenue = revenueItems.reduce(
						(sum: number, a) => sum + a.saldo,
						0,
					);
					const totalExpense = expenseItems.reduce(
						(sum: number, a) => sum + a.saldo,
						0,
					);
					const labaRugi = totalRevenue - totalExpense;

					const startY = addHeader("LAPORAN LABA RUGI");

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
				}

				if (type === "neraca") {
					const accounts = (await prisma.account.findMany({
						orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
					})) as AccountRecord[];

					const startY = addHeader("NERACA");

					const assets = accounts.filter((a) => a.tipeAkun === "Asset");
					const liabilities = accounts.filter(
						(a) => a.tipeAkun === "Liability",
					);
					const equity = accounts.filter((a) => a.tipeAkun === "Equity");

					const totalAssets = assets.reduce(
						(sum: number, a) => sum + a.saldo,
						0,
					);
					const totalLiabilities = liabilities.reduce(
						(sum: number, a) => sum + a.saldo,
						0,
					);
					const totalEquity = equity.reduce(
						(sum: number, a) => sum + a.saldo,
						0,
					);

					doc.setFontSize(11);
					doc.setFont("helvetica", "bold");
					doc.setTextColor(0, 0, 0);
					doc.text("ASET", 14, startY);

					autoTable(doc, {
						startY: startY + 5,
						head: [["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"]],
						body: assets.map((a, i) => [
							(i + 1).toString(),
							a.kodeAkun,
							a.namaAkun,
							formatRupiah(a.saldo),
						]),
						foot: [["", "", "Total Aset", formatRupiah(totalAssets)]],
						...tableStyles,
						columnStyles: {
							0: { cellWidth: 12, halign: "center" },
							1: { cellWidth: 25 },
							2: { cellWidth: 80 },
							3: { cellWidth: 40, halign: "right" },
						},
					});

					const finalY1 = getLastAutoTableFinalY(doc) + 10;
					doc.setFontSize(11);
					doc.setFont("helvetica", "bold");
					doc.text("KEWAJIBAN", 14, finalY1);

					autoTable(doc, {
						startY: finalY1 + 5,
						head: [["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"]],
						body: liabilities.map((a, i) => [
							(i + 1).toString(),
							a.kodeAkun,
							a.namaAkun,
							formatRupiah(a.saldo),
						]),
						foot: [
							["", "", "Total Kewajiban", formatRupiah(totalLiabilities)],
						],
						...tableStyles,
						columnStyles: {
							0: { cellWidth: 12, halign: "center" },
							1: { cellWidth: 25 },
							2: { cellWidth: 80 },
							3: { cellWidth: 40, halign: "right" },
						},
					});

					const finalY2 = getLastAutoTableFinalY(doc) + 10;
					doc.setFontSize(11);
					doc.setFont("helvetica", "bold");
					doc.text("EKUITAS", 14, finalY2);

					autoTable(doc, {
						startY: finalY2 + 5,
						head: [["No", "Kode Akun", "Nama Akun", "Jumlah (Rp)"]],
						body: equity.map((a, i) => [
							(i + 1).toString(),
							a.kodeAkun,
							a.namaAkun,
							formatRupiah(a.saldo),
						]),
						foot: [["", "", "Total Ekuitas", formatRupiah(totalEquity)]],
						...tableStyles,
						columnStyles: {
							0: { cellWidth: 12, halign: "center" },
							1: { cellWidth: 25 },
							2: { cellWidth: 80 },
							3: { cellWidth: 40, halign: "right" },
						},
					});

					const finalY3 = getLastAutoTableFinalY(doc) + 8;
					doc.setDrawColor(0, 0, 0);
					doc.setLineWidth(0.5);
					doc.line(14, finalY3, pageWidth - 14, finalY3);
					doc.setFontSize(11);
					doc.setFont("helvetica", "bold");
					doc.setTextColor(0, 0, 0);
					doc.text("TOTAL KEWAJIBAN + EKUITAS:", 14, finalY3 + 8);
					doc.text(
						formatRupiah(totalLiabilities + totalEquity),
						pageWidth - 14,
						finalY3 + 8,
						{ align: "right" },
					);

					addSignature(finalY3 + 15);
				}

				const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

				return new NextResponse(new Uint8Array(pdfBuffer), {
					status: 200,
					headers: {
						"Content-Type": "application/pdf",
						"Content-Disposition": `attachment; filename=laporan-${type}-${new Date().toISOString().split("T")[0]}.pdf`,
					},
				});
			} catch (error) {
				console.error("Export PDF error:", error);
				return NextResponse.json(
					{ error: "Gagal mengexport data" },
					{ status: 500 },
				);
			}
		},
		{ requireAdmin: true },
	);
}
