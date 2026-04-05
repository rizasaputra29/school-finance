import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

// Define types inline for Prisma v7 compatibility
interface CashflowRecord {
	id: string;
	tanggal: Date;
	keterangan: string;
	kodeAkun: string;
	debit: number;
	kredit: number;
	account?: {
		namaAkun: string;
	};
}

interface AccountRecord {
	kodeAkun: string;
	namaAkun: string;
}

async function generateExcel(params: {
	startDate?: string;
	endDate?: string;
	kodeAkun?: string;
	type?: string;
	search?: string;
	page?: string;
	limit?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
	const {
		startDate,
		endDate,
		kodeAkun,
		type,
		search,
		page = "1",
		limit = "1000",
	} = params;

	// Build Prisma query
	const where: Record<string, unknown> = {};

	// Date range filter
	if (startDate && endDate) {
		where.tanggal = {
			gte: new Date(startDate),
			lte: new Date(endDate),
		};
	} else if (startDate) {
		where.tanggal = {
			gte: new Date(startDate),
		};
	} else if (endDate) {
		where.tanggal = {
			lte: new Date(endDate),
		};
	}

	// Account filter
	if (kodeAkun) {
		where.kodeAkun = kodeAkun;
	}

	// Transaction type filter
	if (type === "income") {
		where.debit = { gt: 0 };
	} else if (type === "expense") {
		where.kredit = { gt: 0 };
	}

	// Search filter
	if (search) {
		where.OR = [
			{ keterangan: { contains: search, mode: "insensitive" } },
			{ kodeAkun: { contains: search, mode: "insensitive" } },
		];
	}

	// Get pagination params
	const pageNum = parseInt(page, 10);
	const limitNum = parseInt(limit, 10);
	const skip = (pageNum - 1) * limitNum;

	// Fetch cashflow data with account info
	const cashflows = (await prisma.cashflow.findMany({
		where,
		orderBy: { tanggal: "desc" },
		skip,
		take: limitNum,
		include: {
			account: {
				select: {
					namaAkun: true,
				},
			},
		},
	})) as CashflowRecord[];

	// Get account map for namaAkun lookup
	const accounts = (await prisma.account.findMany({
		select: {
			kodeAkun: true,
			namaAkun: true,
		},
	})) as AccountRecord[];

	const accountMap = new Map(accounts.map((a) => [a.kodeAkun, a.namaAkun]));

	// Format data for Excel
	const excelData = cashflows.map((cf, index) => {
		const namaAkun = cf.account?.namaAkun || accountMap.get(cf.kodeAkun) || "";
		return {
			No: index + 1 + skip,
			Tanggal: new Date(cf.tanggal).toLocaleDateString("id-ID"),
			"Kode Akun": cf.kodeAkun,
			"Nama Akun": namaAkun,
			Keterangan: cf.keterangan,
			"Debit (Rp)": cf.debit > 0 ? cf.debit : "",
			"Kredit (Rp)": cf.kredit > 0 ? cf.kredit : "",
		};
	});

	// Add totals row
	const totalDebit = cashflows.reduce((sum, cf) => sum + cf.debit, 0);
	const totalKredit = cashflows.reduce((sum, cf) => sum + cf.kredit, 0);

	if (excelData.length > 0) {
		excelData.push({
			No: 0,
			Tanggal: "",
			"Kode Akun": "",
			"Nama Akun": "TOTAL",
			Keterangan: "",
			"Debit (Rp)": totalDebit,
			"Kredit (Rp)": totalKredit,
		});
	}

	// Create workbook
	const workbook = XLSX.utils.book_new();

	// Create header info
	const currentDate = new Date().toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const headerInfo = [
		["LAPORAN BUKU KAS"],
		["SEKOLAH"],
		[`Per ${currentDate}`],
		[],
	];

	if (startDate || endDate) {
		const dateRange = [
			startDate ? new Date(startDate).toLocaleDateString("id-ID") : "Awal",
			"sampai",
			endDate ? new Date(endDate).toLocaleDateString("id-ID") : "Sekarang",
		].join(" ");
		headerInfo.push([dateRange]);
		headerInfo.push([]);
	}

	// Create sheet
	const worksheet = XLSX.utils.aoa_to_sheet([
		...headerInfo,
		[
			"No",
			"Tanggal",
			"Kode Akun",
			"Nama Akun",
			"Keterangan",
			"Debit (Rp)",
			"Kredit (Rp)",
		],
		...excelData.map((row) => [
			row["No"],
			row["Tanggal"],
			row["Kode Akun"],
			row["Nama Akun"],
			row["Keterangan"],
			row["Debit (Rp)"],
			row["Kredit (Rp)"],
		]),
	]);

	// Set column widths
	worksheet["!cols"] = [
		{ wch: 5 }, // No
		{ wch: 12 }, // Tanggal
		{ wch: 12 }, // Kode Akun
		{ wch: 25 }, // Nama Akun
		{ wch: 40 }, // Keterangan
		{ wch: 18 }, // Debit
		{ wch: 18 }, // Kredit
	];

	XLSX.utils.book_append_sheet(workbook, worksheet, "Buku Kas");

	// Generate buffer
	const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
	const filename = `buku-kas-${new Date().toISOString().split("T")[0]}.xlsx`;

	return { buffer: Buffer.from(buffer), filename };
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				// Parse query params for filtering
				const query = getQueryParams(request);
				const { buffer, filename } = await generateExcel(query);

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
				console.error("Export Cashflow error:", error);
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
				const body = await request.json();
				const { buffer, filename } = await generateExcel(body);

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
				console.error("Export Cashflow error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
