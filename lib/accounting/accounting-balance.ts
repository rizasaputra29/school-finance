/**
 * Account balance snapshot helpers.
 *
 * Keeps the AccountBalance cache in sync with posted journal activity
 * so the accounts page (and reports that rely on snapshots) reflect
 * the latest ledger state without full recomputation on every request.
 */

import { PrismaClient } from "@prisma/client";

type PrismaTransactionClient = Parameters<
	Parameters<PrismaClient["$transaction"]>[0]
>[0];

/**
 * Find the academic year that contains the given date.
 */
async function findAcademicYearForDate(
	tx: PrismaTransactionClient,
	tanggal: Date,
): Promise<{ id: string; tanggalMulai: Date; tanggalSelesai: Date } | null> {
	const year = await tx.academicYear.findFirst({
		where: {
			tanggalMulai: { lte: tanggal },
			tanggalSelesai: { gte: tanggal },
		},
		orderBy: { tanggalMulai: "desc" },
	});

	return year;
}

/**
 * Increment (or decrement) the cached AccountBalance for an account
 * within the academic year that contains the given transaction date.
 *
 * If no academic year covers the date, this is a no-op — the caller is
 * responsible for ensuring the transaction is recorded in a valid period.
 */
export async function syncAccountBalance(
	tx: PrismaTransactionClient,
	kodeAkun: string,
	saldoChange: number,
	tanggal: Date,
): Promise<void> {
	// Skip no-op updates to avoid unnecessary DB work.
	if (Math.abs(saldoChange) < 0.0001) return;

	const academicYear = await findAcademicYearForDate(tx, tanggal);
	if (!academicYear) return;

	await tx.accountBalance.upsert({
		where: {
			kodeAkun_academicYearId: {
				kodeAkun,
				academicYearId: academicYear.id,
			},
		},
		update: {
			saldo: { increment: saldoChange },
		},
		create: {
			kodeAkun,
			academicYearId: academicYear.id,
			saldo: saldoChange,
		},
	});
}
