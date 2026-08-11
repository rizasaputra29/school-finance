import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

const DEBIT_NORMAL_ACCOUNTS = ["Asset", "Aset", "Expense", "Beban"];

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { academicYearId } = query;

			let startDate: Date;
			let endDate: Date;

			if (academicYearId) {
				const academicYear = await prisma.academicYear.findUnique({
					where: { id: academicYearId },
				});
				if (!academicYear) {
					return success({ aset: { aktivaLancar: [], aktivaTetap: [], totalAktivaLancar: 0, totalAktivaTetap: 0 }, kewajiban: [], ekuitas: [] }, {
						message: "Tahun ajaran tidak ditemukan",
						meta: { summary: { totalAset: 0, totalKewajiban: 0, totalEkuitas: 0, isBalance: true } },
					});
				}
				startDate = academicYear.tanggalMulai;
				endDate = academicYear.tanggalSelesai;
			} else {
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (!activeYear) {
					return success({ aset: { aktivaLancar: [], aktivaTetap: [], totalAktivaLancar: 0, totalAktivaTetap: 0 }, kewajiban: [], ekuitas: [] }, {
						message: "Tidak ada tahun ajaran aktif",
						meta: { summary: { totalAset: 0, totalKewajiban: 0, totalEkuitas: 0, isBalance: true } },
					});
				}
				startDate = activeYear.tanggalMulai;
				endDate = activeYear.tanggalSelesai;
			}

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

			const netBalances = new Map<string, number>();

			for (const account of accounts) {
				const movements = accountMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };
				const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);
				const netMovement = isDebitNormal
					? movements.debit - movements.kredit
					: movements.kredit - movements.debit;
				netBalances.set(account.kodeAkun, account.saldo + netMovement);
			}

			// Calculate laba rugi split
			const revenueExpenseAccounts = await prisma.account.findMany({
				where: { tipeAkun: { in: ["Revenue", "Expense"] } },
			});

			// Current year Revenue/Expense, excluding closing entries
			const currentYearLines = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: { gte: startDate, lte: endDate },
						status: "posted",
						reference: { not: { startsWith: "closing:" } },
					},
				},
			});

			const currentMap = new Map<string, { debit: number; kredit: number }>();
			for (const line of currentYearLines) {
				currentMap.set(line.kodeAkun, { debit: line._sum.debit || 0, kredit: line._sum.kredit || 0 });
			}

			let labaRugiBerjalan = 0;

			for (const account of revenueExpenseAccounts) {
				const isRevenue = account.tipeAkun === "Revenue";
				const current = currentMap.get(account.kodeAkun) || { debit: 0, kredit: 0 };

				const currentBal = isRevenue
					? current.kredit - current.debit
					: current.debit - current.kredit;

				if (isRevenue) {
					labaRugiBerjalan += currentBal;
				} else {
					labaRugiBerjalan -= currentBal;
				}
			}

			// 302 Laba Rugi Periode Sebelumnya: read actual account balance (carried forward from prior years)
			let labaRugiSebelumnya = 0;
			if (academicYearId) {
				const balance302 = await prisma.accountBalance.findUnique({
					where: { kodeAkun_academicYearId: { kodeAkun: "302", academicYearId } },
				});
				labaRugiSebelumnya = balance302?.saldo ?? 0;
			} else {
				const account302 = await prisma.account.findFirst({
					where: { kodeAkun: "302" },
				});
				labaRugiSebelumnya = account302?.saldo ?? 0;
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
						academicYear: { startDate, endDate },
					},
				},
			);
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
