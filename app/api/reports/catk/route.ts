import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";
import { resolveAcademicYear } from "@/lib/accounting/accounting-laba-rugi";

interface AccountRecord {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	kategori: string | null;
	saldo: number;
	normalBalance?: string | null;
	isContra: boolean;
}

const AKTIVA_LANCAR_CODES = ["101", "102", "103", "104", "105", "106"];
const AKTIVA_TETAP_CODES = ["107", "108", "109", "110", "111"];

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { tahun, academicYearId } = query;

			const year = await resolveAcademicYear(prisma, {
				academicYearId: academicYearId as string | undefined,
				tahun: tahun as string | undefined,
			});

			if (!year) {
				return handlePrismaErrorResponse(new Error("Tahun ajaran tidak ditemukan"));
			}

			const accounts = (await prisma.account.findMany({
				where: {
					tipeAkun: {
						in: ["Asset", "Liability", "Equity", "Revenue", "Expense"],
					},
				},
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			})) as AccountRecord[];

			// Posted-line balance for balance-sheet accounts: all posted lines up to year-end.
			const balanceLineTotals = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: { lte: year.tanggalSelesai },
						status: "posted",
					},
				},
			});

			// Posted-line balance for P&L accounts: only lines inside the academic year,
			// excluding closing entries so the result matches /api/reports/laba-rugi.
			const plLineTotals = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: {
							gte: year.tanggalMulai,
							lte: year.tanggalSelesai,
						},
						status: "posted",
						reference: { not: { startsWith: "closing:" } },
					},
				},
			});

			const balanceMap = new Map<string, { debit: number; kredit: number }>();
			for (const line of balanceLineTotals) {
				balanceMap.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			const plMap = new Map<string, { debit: number; kredit: number }>();
			for (const line of plLineTotals) {
				plMap.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			const getYearSaldo = (account: AccountRecord) => {
				const isPlAccount = account.tipeAkun === "Revenue" || account.tipeAkun === "Expense";
				const movements = isPlAccount
					? plMap.get(account.kodeAkun) || { debit: 0, kredit: 0 }
					: balanceMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
				return computeSaldoChange(account, movements.debit, movements.kredit);
			};

			const assetAccounts = accounts.filter((a) => a.tipeAkun === "Asset");
			const liabilityAccounts = accounts.filter(
				(a) => a.tipeAkun === "Liability",
			);
			const equityAccounts = accounts.filter((a) => a.tipeAkun === "Equity");
			const revenueAccounts = accounts.filter((a) => a.tipeAkun === "Revenue");
			const expenseAccounts = accounts.filter((a) => a.tipeAkun === "Expense");

			const lancarItems = assetAccounts
				.filter((a) => AKTIVA_LANCAR_CODES.includes(a.kodeAkun))
				.map((account) => {
					const yearSaldo = getYearSaldo(account);
					const jumlah = account.isContra ? -Math.abs(yearSaldo) : yearSaldo;
					return {
						kodeAkun: account.kodeAkun,
						namaAkun: account.namaAkun,
						jumlah,
						yearSaldo,
					};
				});

			const tetapItems = assetAccounts
				.filter((a) => AKTIVA_TETAP_CODES.includes(a.kodeAkun))
				.map((account) => {
					const yearSaldo = getYearSaldo(account);
					const isContra = account.isContra || account.kodeAkun === "111";
					const jumlah = isContra ? -Math.abs(yearSaldo) : yearSaldo;
					return {
						kodeAkun: account.kodeAkun,
						namaAkun: account.namaAkun,
						jumlah,
						penyusutan: isContra ? Math.abs(yearSaldo) : 0,
						yearSaldo,
					};
				});

			const totalLancar = lancarItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);
			const totalTetap = tetapItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);
			const totalAset = totalLancar + totalTetap;

			const kewajibanItems = liabilityAccounts.map((account) => {
				const yearSaldo = getYearSaldo(account);
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: yearSaldo,
					yearSaldo,
				};
			});

			const totalKewajiban = kewajibanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const asetNetoItems = equityAccounts.map((account) => {
				const yearSaldo = getYearSaldo(account);
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: yearSaldo,
					yearSaldo,
				};
			});

			const totalAsetNeto = asetNetoItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const pendapatanItems = revenueAccounts.map((account) => {
				const yearSaldo = getYearSaldo(account);
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: yearSaldo,
					yearSaldo,
				};
			});

			const totalPendapatan = pendapatanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const bebanItems = expenseAccounts.map((account) => {
				const yearSaldo = getYearSaldo(account);
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: yearSaldo,
					yearSaldo,
				};
			});

			const totalBeban = bebanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			return success(
				{
					informasiUmum: {
						namaYayasan: "YAYASAN AL MADEENA",
						alamat: "",
						dasarHukum: "",
					},
					kebijakanAkuntansi: {
						metodeAkuntansi: "Akrual",
						basisPencatatan: "Double Entry",
						kebijakanDepresiasi: "Metode Garis Lurus (Straight Line)",
					},
					aset: {
						lancar: lancarItems,
						tetap: tetapItems,
						totalLancar,
						totalTetap,
						totalAset,
					},
					kewajiban: {
						items: kewajibanItems,
						totalKewajiban,
					},
					asetNeto: {
						tidakTerikat: asetNetoItems,
						totalAsetNeto,
					},
					pendapatan: {
						items: pendapatanItems,
						totalPendapatan,
					},
					beban: {
						items: bebanItems,
						totalBeban,
					},
				},
				{
					message: "Catatan atas laporan keuangan berhasil diambil",
					meta: {
						filters: {
							tahun: tahun ? parseInt(tahun, 10) : null,
							academicYearId: academicYearId || null,
							tahunAjaran: year.tahunAjaran,
						},
					},
				},
			);
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
