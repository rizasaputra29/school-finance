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
	console.log("Starting cashflow group backfill...");

	// Find all cashflows with null referenceId
	const unlinkedCashflows = await prisma.cashflow.findMany({
		where: { referenceId: null },
		orderBy: [{ tanggal: "asc" }, { keterangan: "asc" }],
	});

	console.log(`Found ${unlinkedCashflows.length} unlinked cashflow records`);

	// Group by tanggal + keterangan
	const groups = new Map<
		string,
		typeof unlinkedCashflows
	>();

	for (const cf of unlinkedCashflows) {
		const dateKey = cf.tanggal.toISOString().split("T")[0];
		const groupKey = `${dateKey}|${cf.keterangan}`;
		if (!groups.has(groupKey)) {
			groups.set(groupKey, []);
		}
		groups.get(groupKey)!.push(cf);
	}

	console.log(`Grouped into ${groups.size} potential transactions`);

	const groupEntries = Array.from(groups.entries());
	let updatedCount = 0;
	let skippedCount = 0;

	for (const [groupKey, cashflows] of groupEntries) {
		// Only process groups with 2+ entries (double-entry transactions)
		if (cashflows.length < 2) {
			skippedCount++;
			continue;
		}

		// Try to find the linked journal entry
		// Look for a journal entry that references these cashflows
		const firstCf = cashflows[0];
		const dateStart = new Date(firstCf.tanggal);
		dateStart.setHours(0, 0, 0, 0);
		const dateEnd = new Date(firstCf.tanggal);
		dateEnd.setHours(23, 59, 59, 999);

		// Find journal entries that match this transaction
		const journalEntries = await prisma.journalEntry.findMany({
			where: {
				tanggal: {
					gte: dateStart,
					lte: dateEnd,
				},
				entries: {
					some: {
						kodeAkun: cashflows[0].kodeAkun,
					},
				},
			},
			include: { entries: true },
		});

		// Find the best matching journal entry
		let matchingJournal = null;
		for (const je of journalEntries) {
			const jeCodes = je.entries.map((e) => e.kodeAkun).sort();
			const cfCodes = cashflows.map((c) => c.kodeAkun).sort();
			if (
				jeCodes.length === cfCodes.length &&
				jeCodes.every((code, i) => code === cfCodes[i])
			) {
				matchingJournal = je;
				break;
			}
		}

		// Use journal entry ID as referenceId, or generate a UUID
		const referenceId = matchingJournal?.id || crypto.randomUUID();

		// Update all cashflows in this group
		await prisma.cashflow.updateMany({
			where: {
				id: { in: cashflows.map((cf) => cf.id) },
			},
			data: {
				referenceId,
			},
		});

		updatedCount += cashflows.length;
		console.log(
			`Updated group "${groupKey}" with ${cashflows.length} entries (ref: ${referenceId})`,
		);
	}

	console.log("\nBackfill complete!");
	console.log(`  Updated: ${updatedCount} records`);
	console.log(`  Skipped: ${skippedCount} single-entry records`);
}

main()
	.catch((e) => {
		console.error("Backfill failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
