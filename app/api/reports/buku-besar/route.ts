import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter, getQueryParams } from "@/lib/auth/auth-middleware";
import { Account, Prisma } from "@prisma/client";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

type JournalEntryLineWithJournal = Prisma.JournalEntryLineGetPayload<{
	include: {
		journalEntry: {
			select: {
				tanggal: true;
				keterangan: true;
				reference: true;
			};
		};
	};
}>;

interface ReportWhere {
	kodeAkun?: string | { in: string[] };
	journalEntry?: {
		tanggal: {
			gte?: Date;
			lte?: Date;
		};
	};
}

const DEBIT_NORMAL_ACCOUNTS = ["Asset", "Aset", "Expense", "Beban"];

async function parseQueryParams(query: Record<string, string>) {
	const page = parseInt(query.page) || 1;
	const limit = Math.min(parseInt(query.limit) || 1000, 5000);
	let startDate = query.startDate ? new Date(query.startDate) : null;
	let endDate = query.endDate ? new Date(query.endDate) : null;
	const kodeAkun = query.kodeAkun || undefined;
	let academicYearId = query.academicYearId || undefined;

	// If academicYearId is provided, use its date range
	if (academicYearId) {
		const academicYear = await prisma.academicYear.findUnique({
			where: { id: academicYearId },
		});
		if (academicYear) {
			startDate = academicYear.tanggalMulai;
			endDate = academicYear.tanggalSelesai;
		}
	}

	// If no explicit dates or academic year, default to active academic year
	if (!startDate && !endDate) {
		const activeYear = await prisma.academicYear.findFirst({
			where: { isActive: true },
		});
		if (activeYear) {
			startDate = activeYear.tanggalMulai;
			endDate = activeYear.tanggalSelesai;
			academicYearId = activeYear.id;
		}
	}

	return { startDate, endDate, kodeAkun, academicYearId, page, limit };
}

type QueryParams = Awaited<ReturnType<typeof parseQueryParams>>;

async function getLedgerForAccount(
	account: Account,
	params: QueryParams,
	priorBalances: Map<string, number>,
	periodLines: Map<string, JournalEntryLineWithJournal[]>,
) {
	const isDebitNormal = DEBIT_NORMAL_ACCOUNTS.includes(account.tipeAkun);

	// Calculate opening balance using pre-fetched aggregate
	let openingBalance = account.saldo;
	if (params.startDate) {
		// Revenue/Expense accounts reset to 0 at the start of each academic year
		const isRevenueExpense = ["Revenue", "Expense"].includes(account.tipeAkun);
		if (isRevenueExpense && params.academicYearId) {
			openingBalance = 0;
		} else {
			const priorNet = priorBalances.get(account.kodeAkun) || 0;
			openingBalance += isDebitNormal ? priorNet : -priorNet;
		}
	}

	// Get lines for this account from pre-fetched data
	const lines = periodLines.get(account.kodeAkun) || [];

	const skip = (params.page - 1) * params.limit;
	const paginatedLines = lines.slice(skip, skip + params.limit);
	const totalLines = lines.length;

	// Calculate running balance
	let runningBalance = openingBalance;
	const data = paginatedLines.map((line) => {
		runningBalance += isDebitNormal
			? line.debit - line.kredit
			: line.kredit - line.debit;

		return {
			id: line.id,
			tanggal: line.journalEntry.tanggal.toISOString().split("T")[0],
			keterangan: line.journalEntry.keterangan || "-",
			reference: line.journalEntry.reference,
			debit: line.debit,
			kredit: line.kredit,
			saldo: runningBalance,
		};
	});

	let totalDebit = 0;
	let totalKredit = 0;
	lines.forEach((line) => {
		totalDebit += line.debit;
		totalKredit += line.kredit;
	});

	return {
		account: {
			kodeAkun: account.kodeAkun,
			namaAkun: account.namaAkun,
			tipeAkun: account.tipeAkun,
		},
		data,
		summary: {
			openingBalance,
			totalDebit,
			totalKredit,
			endingBalance: runningBalance,
		},
		pagination: {
			page: params.page,
			limit: params.limit,
			total: totalLines,
			totalPages: Math.ceil(totalLines / params.limit),
		},
	};
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const query = getQueryParams(request);
			const params = await parseQueryParams(query);

			let targetAccounts: Account[] = [];

			if (params.kodeAkun && params.kodeAkun !== "Semua") {
				const account = await prisma.account.findUnique({
					where: { kodeAkun: params.kodeAkun },
				});
				if (!account) {
					return errors.notFound("Akun tidak ditemukan");
				}
				targetAccounts = [account];
			} else {
				targetAccounts = await prisma.account.findMany({
					orderBy: { kodeAkun: "asc" },
				});
			}

			const kodeAkuns = targetAccounts.map((a) => a.kodeAkun);

			// Batch fetch 1: Get all opening balance aggregates in one query
			const priorBalances = new Map<string, number>();
			if (params.startDate) {
				const priorLinesByAccount = await prisma.journalEntryLine.groupBy({
					by: ["kodeAkun"],
					where: {
						kodeAkun: { in: kodeAkuns },
						journalEntry: {
							tanggal: { lt: params.startDate },
							status: "posted",
						},
					},
					_sum: { debit: true, kredit: true },
				});

				for (const group of priorLinesByAccount) {
					const pd = group._sum.debit || 0;
					const pk = group._sum.kredit || 0;
					priorBalances.set(group.kodeAkun, pd - pk);
				}
			}

			// Batch fetch 2: Get all period lines in one query
			const periodWhere: ReportWhere = {
				kodeAkun: { in: kodeAkuns },
			};

			if (params.startDate || params.endDate) {
				periodWhere.journalEntry = { tanggal: {} };
				if (params.startDate)
					periodWhere.journalEntry!.tanggal.gte = params.startDate;
				if (params.endDate)
					periodWhere.journalEntry!.tanggal.lte = params.endDate;
			}

			const allPeriodLines = await prisma.journalEntryLine.findMany({
				where: periodWhere,
				include: {
					journalEntry: {
						select: {
							tanggal: true,
							keterangan: true,
							reference: true,
						},
					},
				},
				orderBy: [
					{ journalEntry: { tanggal: "asc" } },
					{ journalEntry: { createdAt: "asc" } },
				],
			});

			// Group lines by account
			const periodLinesByAccount = new Map<
				string,
				JournalEntryLineWithJournal[]
			>();
			for (const line of allPeriodLines) {
				const existing = periodLinesByAccount.get(line.kodeAkun) || [];
				existing.push(line);
				periodLinesByAccount.set(line.kodeAkun, existing);
			}

			// Process each account with pre-fetched data
			const reports = await Promise.all(
				targetAccounts.map((account) =>
					getLedgerForAccount(
						account,
						params,
						priorBalances,
						periodLinesByAccount,
					),
				),
			);

			// If only one account requested, still return inside reports array for consistency
			return success(reports, {
				message: "Laporan buku besar berhasil diambil",
			});
		} catch (error) {
			return handlePrismaErrorResponse(error);
		}
	});
}
