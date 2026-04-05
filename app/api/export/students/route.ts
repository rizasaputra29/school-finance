import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

interface StudentRecord {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
	tahunMasuk: number;
	namaOrtu: string | null;
	noTelp: string | null;
	statusBayar: string;
	status: string;
}

async function generateExcel(): Promise<{ buffer: Buffer; filename: string }> {
	const students = (await prisma.student.findMany({
		where: { status: "Active" },
		orderBy: { nama: "asc" },
	})) as StudentRecord[];

	const excelRows = students.map((student, index) => [
		index + 1,
		student.nis,
		student.nama,
		student.kelas || "",
		student.tahunMasuk || "",
		student.namaOrtu || "",
		student.noTelp || "",
	]);

	const totalSiswa = students.length;

	if (excelRows.length > 0) {
		excelRows.push(["", "", `Total: ${totalSiswa} Siswa`, "", "", "", ""]);
	}

	const workbook = XLSX.utils.book_new();

	const currentDate = new Date().toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	const headerInfo = [
		["LAPORAN DATA SISWA"],
		["SEKOLAH"],
		[`Per ${currentDate}`],
		[],
	];

	const worksheet = XLSX.utils.aoa_to_sheet([
		...headerInfo,
		["No", "NIS", "Nama", "Kelas", "Tahun Masuk", "Nama Ortu", "No Telp"],
		...excelRows,
	]);

	worksheet["!cols"] = [
		{ wch: 5 },
		{ wch: 15 },
		{ wch: 25 },
		{ wch: 10 },
		{ wch: 12 },
		{ wch: 25 },
		{ wch: 15 },
	];

	XLSX.utils.book_append_sheet(workbook, worksheet, "Data Siswa");

	const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
	const filename = `data-siswa-${new Date().toISOString().split("T")[0]}.xlsx`;

	return { buffer: Buffer.from(buffer), filename };
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { buffer, filename } = await generateExcel();

				return new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type":
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						"Content-Disposition": `attachment; filename=${filename}`,
					},
				});
			} catch (error) {
				console.error("Export Students error:", error);
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

				return new NextResponse(new Uint8Array(buffer), {
					status: 200,
					headers: {
						"Content-Type":
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						"Content-Disposition": `attachment; filename=${filename}`,
					},
				});
			} catch (error) {
				console.error("Export Students error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
