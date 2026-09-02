/**
 * One-time recompute of the AccountBalance snapshot cache.
 *
 * Run with:
 *   npx tsx scripts/recompute-account-balances.ts
 *
 * This recalculates every AccountBalance row from posted journal lines,
 * matching the logic used by /api/accounts?academicYearId=... so the
 * accounts page and reports show the correct current balances.
 */

import prisma from "@/lib/prisma";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";

async function main() {
	const accounts = await prisma.account.findMany();
	const academicYears = await prisma.academicYear.findMany();

	console.log(
		`Recomputing balances for ${accounts.length} accounts × ${academicYears.length} academic years...`,
	);

	let updated = 0;
	let created = 0;

	for (const academicYear of academicYears) {
		for (const account of accounts) {
			const isCarryForwardAccount =
				account.tipeAkun === "Asset" ||
				account.tipeAkun === "Liability" ||
				account.tipeAkun === "Equity";

			const lines = await prisma.journalEntryLine.aggregate({
				where: {
					kodeAkun: account.kodeAkun,
					journalEntry: {
						tanggal: isCarryForwardAccount
							? { lte: academicYear.tanggalSelesai }
							: {
									gte: academicYear.tanggalMulai,
									lte: academicYear.tanggalSelesai,
								},
						status: "posted",
					},
				},
				_sum: { debit: true, kredit: true },
			});

			const totalDebit = lines._sum.debit ?? 0;
			const totalKredit = lines._sum.kredit ?? 0;
			const saldo = computeSaldoChange(account, totalDebit, totalKredit);

			const existing = await prisma.accountBalance.findUnique({
				where: {
					kodeAkun_academicYearId: {
						kodeAkun: account.kodeAkun,
						academicYearId: academicYear.id,
					},
				},
			});

			if (existing) {
				if (Math.abs(existing.saldo - saldo) > 0.001) {
					await prisma.accountBalance.update({
						where: { id: existing.id },
						data: { saldo },
					});
					updated++;
				}
			} else {
				await prisma.accountBalance.create({
					data: {
						kodeAkun: account.kodeAkun,
						academicYearId: academicYear.id,
						saldo,
					},
				});
				created++;
			}
		}
	}

	console.log(`Done. Created ${created} rows, updated ${updated} rows.`);
}

main()
	.catch((error) => {
		console.error("Recompute failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
