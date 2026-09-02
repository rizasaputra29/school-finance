import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";

const EQUITY_OPENING_CODES = ["300", "301", "302"];
const PRIVE_CODE = "304";

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
					return success({ saldoAwal: [], pendapatan: [], beban: [], prive: { kodeAkun: PRIVE_CODE, namaAkun: "Prive", jumlah: 0 }, saldoAkhir: 0 }, {
						message: "Tahun ajaran tidak ditemukan",
						meta: { summary: { saldoAwal: 0, totalPendapatan: 0, totalBeban: 0, prive: 0, saldoAkhir: 0 } },
					});
				}
				startDate = academicYear.tanggalMulai;
				endDate = academicYear.tanggalSelesai;
			} else {
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (!activeYear) {
					return success({ saldoAwal: [], pendapatan: [], beban: [], prive: { kodeAkun: PRIVE_CODE, namaAkun: "Prive", jumlah: 0 }, saldoAkhir: 0 }, {
						message: "Tidak ada tahun ajaran aktif",
						meta: { summary: { saldoAwal: 0, totalPendapatan: 0, totalBeban: 0, prive: 0, saldoAkhir: 0 } },
					});
				}
				startDate = activeYear.tanggalMulai;
				endDate = activeYear.tanggalSelesai;
			}

			const accounts = await prisma.account.findMany({
				where: {
					tipeAkun: { in: ["Asset", "Liability", "Equity", "Revenue", "Expense"] },
				},
				orderBy: [{ tipeAkun: "asc" }, { kodeAkun: "asc" }],
			});

			const accountLookup = new Map<string, typeof accounts[number]>();
			for (const account of accounts) {
				accountLookup.set(account.kodeAkun, account);
			}

			// Opening balance: everything before startDate, excluding closing entries
			const openingLineTotals = await prisma.journalEntryLine.groupBy({
				by: ["kodeAkun"],
				_sum: { debit: true, kredit: true },
				where: {
					journalEntry: {
						tanggal: { lt: startDate },
						status: "posted",
						reference: { not: { startsWith: "closing:" } },
					},
				},
			});

			const openingMovements = new Map<string, { debit: number; kredit: number }>();
			for (const line of openingLineTotals) {
				openingMovements.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			// Period movements: within academic year, excluding closing entries
			const periodLineTotals = await prisma.journalEntryLine.groupBy({
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

			const periodMovements = new Map<string, { debit: number; kredit: number }>();
			for (const line of periodLineTotals) {
				periodMovements.set(line.kodeAkun, {
					debit: line._sum.debit || 0,
					kredit: line._sum.kredit || 0,
				});
			}

			const calcBalance = (account: typeof accounts[number], movements: { debit: number; kredit: number }) => {
				const netMovement = computeSaldoChange(
					account,
					movements.debit,
					movements.kredit,
				);
				return account.saldo + netMovement;
			};

			// Saldo Awal: equity opening accounts (300, 301, 302 = Laba Rugi Periode Sebelumnya)
			const saldoAwalItems = EQUITY_OPENING_CODES
				.map((code) => accountLookup.get(code))
				.filter((a): a is typeof accounts[number] => !!a)
				.map((account) => {
					const movements = openingMovements.get(account.kodeAkun) || { debit: 0, kredit: 0 };
					return {
						kodeAkun: account.kodeAkun,
						namaAkun: account.namaAkun,
						jumlah: calcBalance(account, movements),
					};
				});

			const saldoAwal = saldoAwalItems.reduce((sum, item) => sum + item.jumlah, 0);

			// Revenue from current period only
			const revenueAccounts = accounts.filter((a) => a.tipeAkun === "Revenue");
			const pendapatan = revenueAccounts.map((account) => {
				const movements = periodMovements.get(account.kodeAkun) || { debit: 0, kredit: 0 };
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: movements.kredit - movements.debit,
				};
			});
			const totalPendapatan = pendapatan.reduce((sum, item) => sum + item.jumlah, 0);

			// Expense from current period only
			const expenseAccounts = accounts.filter((a) => a.tipeAkun === "Expense");
			const beban = expenseAccounts.map((account) => {
				const movements = periodMovements.get(account.kodeAkun) || { debit: 0, kredit: 0 };
				return {
					kodeAkun: account.kodeAkun,
					namaAkun: account.namaAkun,
					jumlah: movements.debit - movements.kredit,
				};
			});
			const totalBeban = beban.reduce((sum, item) => sum + item.jumlah, 0);

			// Prive from current period
			const priveAccount = accountLookup.get(PRIVE_CODE);
			const priveMovements = periodMovements.get(PRIVE_CODE) || { debit: 0, kredit: 0 };
			const priveJumlah = priveAccount
				? calcBalance(priveAccount, priveMovements)
				: 0;

			const labaRugiBerjalan = totalPendapatan - totalBeban;
			const saldoAkhir = saldoAwal + labaRugiBerjalan - priveJumlah;

			return success(
				{
					saldoAwal: saldoAwalItems,
					pendapatan,
					beban,
					prive: {
						kodeAkun: PRIVE_CODE,
						namaAkun: priveAccount?.namaAkun || "Prive",
						jumlah: priveJumlah,
					},
					saldoAkhir,
				},
				{
					message: "Laporan perubahan aset neto berhasil diambil",
					meta: {
						summary: {
							saldoAwal,
							totalPendapatan,
							totalBeban,
							labaRugiBerjalan,
							prive: priveJumlah,
							saldoAkhir,
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
