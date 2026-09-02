import { PrismaClient } from "@prisma/client";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";
import { syncAccountBalance } from "@/lib/accounting/accounting-balance";

type PrismaTransactionClient = Parameters<
	Parameters<PrismaClient["$transaction"]>[0]
>[0];

export interface JournalEntryLine {
	kodeAkun: string;
	debit: number;
	kredit: number;
}

export interface PostToJournalParams {
	tanggal: Date;
	keterangan: string;
	reference?: string;
	entries: JournalEntryLine[];
	/**
	 * User role determines initial status:
	 * - "owner" → auto-posted (status: "posted")
	 * - "admin" → draft (status: "draft", awaiting approval)
	 */
	userRole: "owner" | "admin" | "user";
	userEmail?: string;
}

export interface JournalResult {
	journalEntryId: string;
	status: string;
}

/**
 * Centralized service to post journal entries.
 * Validates double-entry balance, creates JournalEntry + JournalEntryLines,
 * and optionally posts (updates account balances) immediately for owner role.
 */
export async function postToJournal(
	tx: PrismaTransactionClient,
	params: PostToJournalParams,
): Promise<JournalResult> {
	const { tanggal, keterangan, reference, entries, userRole, userEmail } =
		params;

	// Validate entries exist
	if (!entries || entries.length === 0) {
		throw new Error("Jurnal harus memiliki minimal satu entri");
	}

	// Validate double-entry balance
	const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
	const totalKredit = entries.reduce((sum, e) => sum + e.kredit, 0);

	if (Math.abs(totalDebit - totalKredit) > 0.01) {
		throw new Error(
			`Jurnal tidak seimbang: total debit ${totalDebit} ≠ total kredit ${totalKredit}`,
		);
	}

	// Determine initial status based on role
	const isOwner = userRole === "owner";
	const initialStatus = isOwner ? "posted" : "draft";

	// Validate every account exists in the chart of accounts
	const accountCodes = [...new Set(entries.map((e) => e.kodeAkun))];
	const accounts = await tx.account.findMany({
		where: { kodeAkun: { in: accountCodes } },
	});

	const accountByCode = new Map(accounts.map((a) => [a.kodeAkun, a]));
	for (const code of accountCodes) {
		if (!accountByCode.has(code)) {
			throw new Error(`Akun ${code} tidak ditemukan dalam chart of accounts`);
		}
	}

	// Create JournalEntry
	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal,
			keterangan,
			reference: reference || null,
			status: initialStatus,
			postedAt: isOwner ? new Date() : null,
			postedBy: isOwner ? userEmail || "system" : null,
		},
	});

	// Create JournalEntryLines
	await tx.journalEntryLine.createMany({
		data: entries.map((entry) => ({
			journalEntryId: journalEntry.id,
			kodeAkun: entry.kodeAkun,
			debit: entry.debit,
			kredit: entry.kredit,
		})),
	});

	// Update account balances when journal is posted
	if (isOwner) {
		for (const entry of entries) {
			const account = accountByCode.get(entry.kodeAkun);
			if (account) {
				const saldoChange = computeSaldoChange(account, entry.debit, entry.kredit);
				await tx.account.update({
					where: { kodeAkun: entry.kodeAkun },
					data: { saldo: { increment: saldoChange } },
				});
				await syncAccountBalance(
					tx,
					entry.kodeAkun,
					saldoChange,
					tanggal,
				);
			}
		}
	}

	return {
		journalEntryId: journalEntry.id,
		status: initialStatus,
	};
}

/**
 * Approve a journal entry (admin → approved).
 * Only callable by owner or admin with approve permission.
 */
export async function approveJournalEntry(
	tx: PrismaTransactionClient,
	journalEntryId: string,
): Promise<void> {
	const journalEntry = await tx.journalEntry.findUnique({
		where: { id: journalEntryId },
	});

	if (!journalEntry) {
		throw new Error("Entri jurnal tidak ditemukan");
	}

	if (journalEntry.status !== "draft") {
		throw new Error(
			`Entri jurnal dengan status "${journalEntry.status}" tidak dapat disetujui`,
		);
	}

	await tx.journalEntry.update({
		where: { id: journalEntryId },
		data: {
			status: "approved",
		},
	});
}

/**
 * Post a journal entry (approved → posted).
 * Updates account balances for all entry lines.
 */
export async function postJournalEntry(
	tx: PrismaTransactionClient,
	journalEntryId: string,
	userEmail: string,
): Promise<void> {
	const journalEntry = await tx.journalEntry.findUnique({
		where: { id: journalEntryId },
		include: { entries: true },
	});

	if (!journalEntry) {
		throw new Error("Entri jurnal tidak ditemukan");
	}

	if (journalEntry.status !== "approved") {
		throw new Error(
			`Entri jurnal dengan status "${journalEntry.status}" tidak dapat diposting`,
		);
	}

	await tx.journalEntry.update({
		where: { id: journalEntryId },
		data: {
			status: "posted",
			postedAt: new Date(),
			postedBy: userEmail,
		},
	});
}
