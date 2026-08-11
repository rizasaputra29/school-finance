import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { success } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

interface CashflowRecord {
	id: string;
	kodeAkun: string;
	kategori: string | null;
	cashflowCategory: string | null;
	debit: number;
	kredit: number;
	account: {
		kodeAkun: string;
		namaAkun: string;
		saldo: number;
	};
}

interface GroupedItem {
	kodeAkun: string;
	namaAkun: string;
	jumlah: number;
	subKategori?: string;
}

const isOperasiRevenue = (kodeAkun: string): boolean => kodeAkun.startsWith("4");
const isOperasiExpense = (kodeAkun: string): boolean =>
	kodeAkun.startsWith("5") || kodeAkun.startsWith("6");

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const { bulan, tahun, academicYearId } = query;

			let month = bulan ? parseInt(bulan, 10) : null;
			let year = tahun ? parseInt(tahun, 10) : null;

			const dateFilter: { gte?: Date; lte?: Date } = {};

			// If academicYearId is provided, use its date range
			if (academicYearId) {
				const academicYear = await prisma.academicYear.findUnique({
					where: { id: academicYearId },
				});
				if (academicYear) {
					dateFilter.gte = academicYear.tanggalMulai;
					dateFilter.lte = academicYear.tanggalSelesai;
					month = academicYear.tanggalMulai.getMonth() + 1;
					year = academicYear.tanggalMulai.getFullYear();
				}
			} else if (month && year) {
				dateFilter.gte = new Date(year, month - 1, 1);
				dateFilter.lte = new Date(year, month, 0, 23, 59, 59);
			} else if (year) {
				dateFilter.gte = new Date(year, 0, 1);
				dateFilter.lte = new Date(year, 11, 31, 23, 59, 59);
			} else {
				// Default to active academic year
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (activeYear) {
					dateFilter.gte = activeYear.tanggalMulai;
					dateFilter.lte = activeYear.tanggalSelesai;
				}
			}

			const cashflowWhere: Record<string, unknown> = {
				status: "posted",
				isReversed: false,
				cashflowCategory: { not: null },
			};
			if (dateFilter.gte || dateFilter.lte) {
				cashflowWhere.tanggal = dateFilter;
			}

			const cashflows = (await prisma.cashflow
				.findMany({
					where: cashflowWhere,
					include: {
						account: {
							select: { kodeAkun: true, namaAkun: true, saldo: true },
						},
					},
				})
				.then((rows) => rows as unknown)) as CashflowRecord[];

			const operasiMap = new Map<
				string,
				{ namaAkun: string; debit: number; kredit: number; subKategori: string }
			>();
			const investasiMap = new Map<
				string,
				{ namaAkun: string; debit: number; kredit: number }
			>();
			const pendanaanMap = new Map<
				string,
				{ namaAkun: string; debit: number; kredit: number }
			>();

			for (const cf of cashflows) {
				const category = cf.cashflowCategory;
				const namaAkun = cf.account.namaAkun;

				if (category === "OPS") {
					if (isOperasiRevenue(cf.kodeAkun)) {
						const existing = operasiMap.get(cf.kodeAkun);
						if (existing) {
							existing.debit += cf.debit;
							existing.kredit += cf.kredit;
						} else {
							operasiMap.set(cf.kodeAkun, {
								namaAkun,
								debit: cf.debit,
								kredit: cf.kredit,
								subKategori: "Penerimaan",
							});
						}
					} else if (isOperasiExpense(cf.kodeAkun)) {
						const existing = operasiMap.get(cf.kodeAkun);
						if (existing) {
							existing.debit += cf.debit;
							existing.kredit += cf.kredit;
						} else {
							operasiMap.set(cf.kodeAkun, {
								namaAkun,
								debit: cf.debit,
								kredit: cf.kredit,
								subKategori: "Pembayaran",
							});
						}
					}
				} else if (category === "INV") {
					const existing = investasiMap.get(cf.kodeAkun);
					if (existing) {
						existing.debit += cf.debit;
						existing.kredit += cf.kredit;
					} else {
						investasiMap.set(cf.kodeAkun, {
							namaAkun,
							debit: cf.debit,
							kredit: cf.kredit,
						});
					}
				} else if (category === "FIN") {
					const existing = pendanaanMap.get(cf.kodeAkun);
					if (existing) {
						existing.debit += cf.debit;
						existing.kredit += cf.kredit;
					} else {
						pendanaanMap.set(cf.kodeAkun, {
							namaAkun,
							debit: cf.debit,
							kredit: cf.kredit,
						});
					}
				}
			}

			const operasiItems: GroupedItem[] = [];
			for (const [kodeAkun, data] of operasiMap) {
				const netAmount = data.debit - data.kredit;
				if (data.subKategori === "Penerimaan") {
					operasiItems.push({
						kodeAkun,
						namaAkun: data.namaAkun,
						jumlah: Math.abs(netAmount),
						subKategori: data.subKategori,
					});
				} else {
					operasiItems.push({
						kodeAkun,
						namaAkun: data.namaAkun,
						jumlah: -Math.abs(netAmount),
						subKategori: data.subKategori,
					});
				}
			}

			operasiItems.sort((a, b) => {
				if (a.subKategori !== b.subKategori) {
					return a.subKategori === "Penerimaan" ? -1 : 1;
				}
				return a.kodeAkun.localeCompare(b.kodeAkun);
			});

			const investasiItems: GroupedItem[] = [];
			for (const [kodeAkun, data] of investasiMap) {
				investasiItems.push({
					kodeAkun,
					namaAkun: data.namaAkun,
					jumlah: data.debit - data.kredit,
				});
			}
			investasiItems.sort((a, b) => a.kodeAkun.localeCompare(b.kodeAkun));

			const pendanaanItems: GroupedItem[] = [];
			for (const [kodeAkun, data] of pendanaanMap) {
				pendanaanItems.push({
					kodeAkun,
					namaAkun: data.namaAkun,
					jumlah: data.debit - data.kredit,
				});
			}
			pendanaanItems.sort((a, b) => a.kodeAkun.localeCompare(b.kodeAkun));

			const totalOperasi = operasiItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);
			const totalInvestasi = investasiItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);
			const totalPendanaan = pendanaanItems.reduce(
				(sum, item) => sum + item.jumlah,
				0,
			);

			const kasBankAccounts = await prisma.account.findMany({
				where: { kodeAkun: { in: ["101", "102"] } },
				select: { kodeAkun: true, saldo: true },
			});

			let saldoKasAwal = 0;
			for (const acc of kasBankAccounts) {
				saldoKasAwal += acc.saldo;
			}

			if (dateFilter.gte) {
				const priorCashflows = await prisma.cashflow.findMany({
					where: {
						status: "posted",
						isReversed: false,
						tanggal: { lt: dateFilter.gte },
						kodeAkun: { in: ["101", "102"] },
					},
					select: { debit: true, kredit: true },
				});

				const priorNet = priorCashflows.reduce(
					(sum, cf) => sum + cf.debit - cf.kredit,
					0,
				);
				saldoKasAwal += priorNet;
			}

			const kenaikanKas = totalOperasi + totalInvestasi + totalPendanaan;
			const saldoKasAkhir = saldoKasAwal + kenaikanKas;

			const operasiClean = operasiItems.map(
				({ subKategori, ...rest }) => rest,
			);

			return success(
				{
					operasi: {
						items: operasiClean,
						total: totalOperasi,
					},
					investasi: {
						items: investasiItems,
						total: totalInvestasi,
					},
					pendanaan: {
						items: pendanaanItems,
						total: totalPendanaan,
					},
					saldoKasAwal,
					saldoKasAkhir,
				},
				{
					message: "Laporan arus kas berhasil diambil",
					meta: {
						summary: {
							kasBersihOperasi: totalOperasi,
							kasBersihInvestasi: totalInvestasi,
							kasBersihPendanaan: totalPendanaan,
							kenaikanKas,
							saldoKasAwal,
							saldoKasAkhir,
						},
						filters: { bulan: month, tahun: year, academicYearId },
						academicYear: {
							tanggalMulai: dateFilter.gte?.toISOString() || null,
							tanggalSelesai: dateFilter.lte?.toISOString() || null,
						},
					},
				},
			);
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
