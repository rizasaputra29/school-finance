import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
	console.log("Seeding AccountBalance snapshots...\n");

	const academicYears = await prisma.academicYear.findMany({
		orderBy: { tanggalMulai: "asc" },
	});

	if (academicYears.length === 0) {
		console.log("No academic years found. Nothing to seed.");
		return;
	}

	console.log(`Found ${academicYears.length} academic year(s):`);
	for (const ay of academicYears) {
		console.log(`  - ${ay.tahunAjaran} (${ay.tanggalMulai.toISOString().slice(0, 10)} → ${ay.tanggalSelesai.toISOString().slice(0, 10)})`);
	}

	const accounts = await prisma.account.findMany({
		orderBy: { kodeAkun: "asc" },
	});

	console.log(`\nFound ${accounts.length} account(s).\n`);

	let created = 0;
	let skipped = 0;
	let errors = 0;

	for (const ay of academicYears) {
		console.log(`\nProcessing ${ay.tahunAjaran}...`);

		for (const account of accounts) {
			try {
				const existing = await prisma.accountBalance.findUnique({
					where: {
						kodeAkun_academicYearId: {
							kodeAkun: account.kodeAkun,
							academicYearId: ay.id,
						},
					},
				});

				if (existing) {
					skipped++;
					continue;
				}

				const lines = await prisma.journalEntryLine.aggregate({
					where: {
						kodeAkun: account.kodeAkun,
						journalEntry: {
							tanggal: { lte: ay.tanggalSelesai },
							status: "posted",
						},
					},
					_sum: { debit: true, kredit: true },
				});

				const totalDebit = lines._sum.debit ?? 0;
				const totalKredit = lines._sum.kredit ?? 0;

				const isDebitNormal = ["Asset", "Expense"].includes(
					account.tipeAkun,
				);
				const saldo = isDebitNormal
					? totalDebit - totalKredit
					: totalKredit - totalDebit;

				await prisma.accountBalance.create({
					data: {
						kodeAkun: account.kodeAkun,
						academicYearId: ay.id,
						saldo,
					},
				});

				created++;
				console.log(`  ✓ ${account.kodeAkun} ${account.namaAkun}: ${saldo.toLocaleString("id-ID")}`);
			} catch (err) {
				errors++;
				console.error(
					`  ✗ ${account.kodeAkun} ${account.namaAkun}: ${err instanceof Error ? err.message : err}`,
				);
			}
		}
	}

	console.log("\n--- Summary ---");
	console.log(`Created: ${created}`);
	console.log(`Skipped (already exists): ${skipped}`);
	console.log(`Errors: ${errors}`);
	console.log("\nDone.");
}

main()
	.catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
