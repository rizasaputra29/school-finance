import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";
import {
	computeLabaRugiForYear,
	resolveAcademicYear,
} from "@/lib/accounting/accounting-laba-rugi";

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { academicYearId, tahun } = query;

			const academicYear = await resolveAcademicYear(prisma, {
				academicYearId,
				tahun,
			});

			if (!academicYear) {
				return success(
					{
						aset: {
							aktivaLancar: [],
							aktivaTetap: [],
							totalAktivaLancar: 0,
							totalAktivaTetap: 0,
						},
						kewajiban: [],
						ekuitas: [],
					},
					{
						message: "Tahun ajaran tidak ditemukan",
						meta: {
							summary: {
								totalAset: 0,
								totalKewajiban: 0,
								totalEkuitas: 0,
								isBalance: true,
							},
						},
					},
				);
			}

			const startDate = academicYear.tanggalMulai;
			const endDate = academicYear.tanggalSelesai;
			const effectiveYearId = academicYear.id;

			// Only Asset, Liability, Equity accounts on balance sheet (Revenue/Expense close to laba rugi)
			const accounts = await prisma.account.findMany({
				where: {
					tipeAkun: { in: ["Asset", "Liability", "Equity"] },
				},
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			});

			// All journal entries up to endDate for Asset/Liability/Equity
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

			// Prefer the per-academic-year snapshot (kept in sync by posting paths);
			// fall back to journal-line computation when no snapshot exists yet.
			const accountBalanceRows = await prisma.accountBalance.findMany({
				where: {
					kodeAkun: { in: accounts.map((a) => a.kodeAkun) },
					academicYearId: effectiveYearId,
				},
			});
			const accountBalanceMap = new Map(
				accountBalanceRows.map((b) => [b.kodeAkun, b.saldo]),
			);

			const netBalances = new Map<string, number>();

			for (const account of accounts) {
				const cachedSaldo = accountBalanceMap.get(account.kodeAkun);
				if (cachedSaldo !== undefined) {
					netBalances.set(account.kodeAkun, cachedSaldo);
				} else {
					const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
					const netMovement = computeSaldoChange(
						account,
						movements.debit,
						movements.kredit,
					);
					netBalances.set(account.kodeAkun, netMovement);
				}
			}

			// Calculate laba rugi split using the shared helper so neraca
			// and the laba-rugi report always agree.
			const berjalan = await computeLabaRugiForYear(prisma, effectiveYearId);
			const labaRugiBerjalan = berjalan.labaRugi;

			// Laba Rugi Periode Sebelumnya = profit/loss of the academic year immediately before this one
			const previousYear = await prisma.academicYear.findFirst({
				where: {
					tanggalSelesai: { lt: academicYear.tanggalMulai },
				},
				orderBy: { tanggalSelesai: "desc" },
			});

			let labaRugiSebelumnya = 0;
			if (previousYear) {
				const sebelumnya = await computeLabaRugiForYear(
					prisma,
					previousYear.id,
				);
				labaRugiSebelumnya = sebelumnya.labaRugi;
			}

			const assetAccounts = accounts.filter((a) => a.tipeAkun === "Asset");
			const liabilityAccounts = accounts.filter((a) => a.tipeAkun === "Liability");
			const equityAccounts = accounts.filter((a) => a.tipeAkun === "Equity");

			const lancarCodes = ["101", "102", "103", "104", "105", "106"];
			const tetapCodes = ["107", "108", "109", "110", "111"];

			const mapAccount = (account: { kodeAkun: string; namaAkun: string; isContra: boolean }) => {
				const jumlah = netBalances.get(account.kodeAkun) || 0;
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: account.isContra ? -Math.abs(jumlah) : jumlah,
				};
			};

			const aktivaLancar = assetAccounts.filter((a) => lancarCodes.includes(a.kodeAkun)).map(mapAccount);
			const aktivaTetap = assetAccounts.filter((a) => tetapCodes.includes(a.kodeAkun)).map(mapAccount);

			const totalAktivaLancar = aktivaLancar.reduce((sum, item) => sum + item.jumlah, 0);
			const totalAktivaTetap = aktivaTetap.reduce((sum, item) => sum + item.jumlah, 0);
			const totalAset = totalAktivaLancar + totalAktivaTetap;

			const kewajibanData = liabilityAccounts.map((account) => ({
				kodeAkun: account.kodeAkun,
				namaAkun: account.namaAkun,
				jumlah: netBalances.get(account.kodeAkun) || 0,
			}));
			const totalKewajiban = kewajibanData.reduce((sum, item) => sum + item.jumlah, 0);

			const ekuitasData = equityAccounts
				.filter((a) => a.kodeAkun !== "302" && a.kodeAkun !== "303")
				.map((account) => ({
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: netBalances.get(account.kodeAkun) || 0,
				}));

			const labaRugiSebelumnyaItem = {
				kodeAkun: "302",
				namaAkun: "Laba (Rugi) Periode Sebelumnya",
				jumlah: labaRugiSebelumnya,
			};
			const labaRugiBerjalanItem = {
				kodeAkun: "303",
				namaAkun: "Laba (Rugi) Periode Berjalan",
				jumlah: labaRugiBerjalan,
			};

			const totalEkuitas =
				ekuitasData.reduce((sum, item) => sum + item.jumlah, 0) +
				labaRugiSebelumnya +
				labaRugiBerjalan;
			const totalLiabilitasEkuitas = totalKewajiban + totalEkuitas;
			const balanceDifference = totalAset - totalLiabilitasEkuitas;
			const isBalance = Math.abs(balanceDifference) < 0.01;

			return success(
				{
					aset: {
						aktivaLancar,
						aktivaTetap,
						totalAktivaLancar,
						totalAktivaTetap,
					},
					kewajiban: kewajibanData,
					ekuitas: [...ekuitasData, labaRugiSebelumnyaItem, labaRugiBerjalanItem],
				},
				{
					message: "Laporan neraca berhasil diambil",
					meta: {
						summary: {
							totalAset,
							totalKewajiban,
							totalEkuitas,
							totalLiabilitasEkuitas,
							isBalance,
							balanceDifference,
							labaRugiSebelumnya,
							labaRugiBerjalan,
						},
						academicYear: {
							startDate,
							endDate,
							tahunAjaran: academicYear.tahunAjaran,
						},
					},
				},
			);
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
