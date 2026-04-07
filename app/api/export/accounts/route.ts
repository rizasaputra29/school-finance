import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import type { AccountRecord } from "@/types/export-records";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateFull } from "@/lib/utils/utils-date";

async function generateExcel(): Promise<{ buffer: Buffer; filename: string }> {
	// Fetch all accounts ordered by kodeAkun
	const accounts = (await prisma.account.findMany({
		orderBy: { kodeAkun: "asc" },
	})) as AccountRecord[];

	// Format data for Excel with required columns
	const excelRows = accounts.map((account, index) => [
		index + 1,
		account.kodeAkun,
		account.namaAkun,
		account.tipeAkun,
		account.saldo ? formatRupiah(account.saldo) : "",
	]);

	// Add totals row
	const totalSaldo = accounts.reduce((sum, a) => sum + a.saldo, 0);

	if (excelRows.length > 0) {
		excelRows.push(["", "", "TOTAL", "", formatRupiah(totalSaldo)]);
	}

	// Create workbook
	const workbook = XLSX.utils.book_new();

	// Create header info
	const currentDate = formatDateFull(new Date());

	const headerInfo = [
		["LAPORAN DATA AKUN"],
		["SEKOLAH"],
		[`Per ${currentDate}`],
		[],
	];

	// Create sheet with header and data
	const worksheet = XLSX.utils.aoa_to_sheet([
		...headerInfo,
		["No", "Kode Akun", "Nama Akun", "Tipe Akun", "Saldo (Rp)"],
		...excelRows,
	]);

	// Set column widths
	worksheet["!cols"] = [
		{ wch: 5 }, // No
		{ wch: 15 }, // Kode Akun
		{ wch: 30 }, // Nama Akun
		{ wch: 15 }, // Tipe Akun
		{ wch: 20 }, // Saldo
	];

	XLSX.utils.book_append_sheet(workbook, worksheet, "Akun");

	// Generate buffer
	const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
	const filename = `data-akun-${new Date().toISOString().split("T")[0]}.xlsx`;

	return { buffer: Buffer.from(buffer), filename };
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { buffer, filename } = await generateExcel();

				// Return file download response
				return new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type":
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						"Content-Disposition": `attachment; filename=${filename}`,
					},
				});
			} catch (error) {
				console.error("Export Accounts error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { buffer, filename } = await generateExcel();

				// Return file download response
				return new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type":
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						"Content-Disposition": `attachment; filename=${filename}`,
					},
				});
			} catch (error) {
				console.error("Export Accounts error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
