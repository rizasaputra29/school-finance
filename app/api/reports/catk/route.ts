import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

interface AccountRecord {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	kategori: string | null;
	saldo: number;
	isContra: boolean;
}

const DEBIT_NORMAL_ACCOUNTS = ["Asset", "Aset", "Expense", "Beban"];

const AKTIVA_LANCAR_CODES = ["101", "102", "103", "104", "105", "106"];
const AKTIVA_TETAP_CODES = ["107", "108", "109", "110", "111"];

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { tahun } = query;

			let endDate = new Date();
			if (tahun) {
				const year = parseInt(tahun, 10);
				endDate = new Date(year, 11, 31, 23, 59, 59);
			}

			const accounts = (await prisma.account.findMany({
				where: {
					tipeAkun: {
						in: ["Asset", "Liability", "Equity", "Revenue", "Expense"],
					},
				},
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			})) as AccountRecord[];

			const lineTotals = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: { lte: endDate },
						status: "posted",
					},
				},
			});

			const accountMap = new Map<string, { debit: number; kredit: number }>();
			for (const line of lineTotals) {
				accountMap.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			const netBalances = new Map<string, number>();

			for (const account of accounts) {
				const movements = accountMap.get(account.kodeAkun) || {
					debit: 0,
					kredit: 0,
				};
				const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);

				const netMovement = isDebitNormal
					? movements.debit - movements.kredit
					: movements.kredit - movements.debit;
				const totalBalance = account.saldo + netMovement;

				netBalances.set(account.kodeAkun, totalBalance);
			}

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
					const jumlah = netBalances.get(account.kodeAkun) || 0;
					return {
						kodeAkun: account.kodeAkun,
						namaAkun: account.namaAkun,
						jumlah: account.isContra ? -Math.abs(jumlah) : jumlah,
					};
				});

			const tetapItems = assetAccounts
				.filter((a) => AKTIVA_TETAP_CODES.includes(a.kodeAkun))
				.map((account) => {
					const jumlah = netBalances.get(account.kodeAkun) || 0;
					const isContra = account.isContra || account.kodeAkun === "111";
					return {
						kodeAkun: account.kodeAkun,
						namaAkun: account.namaAkun,
						jumlah: isContra ? -Math.abs(jumlah) : jumlah,
						penyusutan: isContra ? Math.abs(jumlah) : 0,
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
				const jumlah = netBalances.get(account.kodeAkun) || 0;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah,
				};
			});

			const totalKewajiban = kewajibanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const asetNetoItems = equityAccounts.map((account) => {
				const jumlah = netBalances.get(account.kodeAkun) || 0;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah,
				};
			});

			const totalAsetNeto = asetNetoItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const pendapatanItems = revenueAccounts.map((account) => {
				const jumlah = netBalances.get(account.kodeAkun) || 0;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah,
				};
			});

			const totalPendapatan = pendapatanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const bebanItems = expenseAccounts.map((account) => {
				const jumlah = netBalances.get(account.kodeAkun) || 0;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah,
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
						},
					},
				},
			);
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
