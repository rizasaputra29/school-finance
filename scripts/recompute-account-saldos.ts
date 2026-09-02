/**
 * One-time recompute of account.saldo from all posted journal lines.
 *
 * Run with:
 *   npx tsx scripts/recompute-account-saldos.ts
 *
 * Use this after fixing account metadata (e.g. 111 Akumulasi Penyusutan
 * becoming a contra-asset) so the running balance reflects the correct
 * normal balance.
 */

import prisma from "@/lib/prisma";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";

async function main() {
	const accounts = await prisma.account.findMany();
	console.log(`Recomputing saldo for ${accounts.length} accounts...`);

	let updated = 0;
	for (const account of accounts) {
		const lines = await prisma.journalEntryLine.aggregate({
			where: {
				kodeAkun: account.kodeAkun,
				journalEntry: { status: "posted" },
			},
			_sum: { debit: true, kredit: true },
		});

		const totalDebit = lines._sum.debit ?? 0;
		const totalKredit = lines._sum.kredit ?? 0;
		const saldo = computeSaldoChange(account, totalDebit, totalKredit);

		if (Math.abs(account.saldo - saldo) > 0.001) {
			await prisma.account.update({
				where: { kodeAkun: account.kodeAkun },
				data: { saldo },
			});
			updated++;
		}
	}

	console.log(`Done. Updated ${updated} accounts.`);
}

main()
	.catch((error) => {
		console.error("Recompute failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
