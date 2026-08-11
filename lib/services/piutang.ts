import prisma from "@/lib/prisma";
import { postToJournal } from "./journal";
import {
	PIUTANG_SISWA_ACCOUNT_CODE,
	PIUTANG_KARYAWAN_ACCOUNT_CODE,
	HUTANG_USAHA_ACCOUNT_CODE,
	getRevenueAccountCode,
	getExpenseAccountCode,
} from "./billing";

/**
 * Auto-create piutang journal entries from overdue billings.
 * Called lazily when billing pages are loaded.
 * Idempotent — uses reference field to avoid duplicate entries.
 */
export async function autoCreatePiutangFromOverdueBillings(): Promise<number> {
	const now = new Date();
	let createdCount = 0;

	// 1. Mark overdue installments as Jatuh Tempo
	await prisma.installment.updateMany({
		where: {
			status: "Belum Bayar",
			tanggalJatuhTempo: { lt: now },
		},
		data: {
			status: "Jatuh Tempo",
		},
	});

	// 2. Find overdue student billings without piutang journal entries
	const overdueBillings = await prisma.billing.findMany({
		where: {
			statusBayar: "Belum Lunas",
			tanggalJatuhTempo: { lt: now },
		},
		include: {
			student: { select: { id: true, nama: true, nis: true } },
		},
	});

	for (const billing of overdueBillings) {
		const reference = `piutang-billing-${billing.id}`;
		const existing = await prisma.journalEntry.findUnique({
			where: { reference },
		});
		if (existing) continue;

		const revenueCode = getRevenueAccountCode(billing.jenisBiaya);
		await prisma.$transaction(async (tx) => {
			await postToJournal(tx, {
				tanggal: now,
				keterangan: `Piutang ${billing.jenisBiaya} - ${billing.student.nama} (${billing.student.nis})${billing.keterangan ? ` - ${billing.keterangan}` : ""}`,
				reference,
				entries: [
					{
						kodeAkun: PIUTANG_SISWA_ACCOUNT_CODE,
						debit: billing.jumlah,
						kredit: 0,
					},
					{
						kodeAkun: revenueCode,
						debit: 0,
						kredit: billing.jumlah,
					},
				],
				userRole: "owner",
				userEmail: "system",
			});

			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Piutang ${billing.jenisBiaya} - ${billing.student.nama} - Piutang`,
					kodeAkun: PIUTANG_SISWA_ACCOUNT_CODE,
					kategori: "piutang",
					cashflowCategory: "OPS",
					debit: billing.jumlah,
					kredit: 0,
					referenceId: billing.id,
				},
			});
			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Piutang ${billing.jenisBiaya} - ${billing.student.nama} - Pendapatan`,
					kodeAkun: revenueCode,
					kategori: "piutang",
					cashflowCategory: "OPS",
					debit: 0,
					kredit: billing.jumlah,
					referenceId: billing.id,
				},
			});
		});
		createdCount++;
	}

	// 3. Find overdue employee billings (tagihan) without piutang journal entries
	const overdueEmployeeBillings = await prisma.employeeBilling.findMany({
		where: {
			statusBayar: "Belum Lunas",
			tanggalJatuhTempo: { lt: now },
			tipe: "tagihan",
		},
		include: {
			employee: { select: { id: true, nama: true, nip: true } },
		},
	});

	for (const billing of overdueEmployeeBillings) {
		const reference = `piutang-emp-billing-${billing.id}`;
		const existing = await prisma.journalEntry.findUnique({
			where: { reference },
		});
		if (existing) continue;

		const revenueCode = getRevenueAccountCode(billing.jenisBiaya);
		await prisma.$transaction(async (tx) => {
			await postToJournal(tx, {
				tanggal: now,
				keterangan: `Piutang ${billing.jenisBiaya} - ${billing.employee.nama} (${billing.employee.nip})${billing.keterangan ? ` - ${billing.keterangan}` : ""}`,
				reference,
				entries: [
					{
						kodeAkun: PIUTANG_KARYAWAN_ACCOUNT_CODE,
						debit: billing.jumlah,
						kredit: 0,
					},
					{
						kodeAkun: revenueCode,
						debit: 0,
						kredit: billing.jumlah,
					},
				],
				userRole: "owner",
				userEmail: "system",
			});

			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Piutang ${billing.jenisBiaya} - ${billing.employee.nama} - Piutang`,
					kodeAkun: PIUTANG_KARYAWAN_ACCOUNT_CODE,
					kategori: "piutang",
					cashflowCategory: "OPS",
					debit: billing.jumlah,
					kredit: 0,
					referenceId: billing.id,
				},
			});
			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Piutang ${billing.jenisBiaya} - ${billing.employee.nama} - Pendapatan`,
					kodeAkun: revenueCode,
					kategori: "piutang",
					cashflowCategory: "OPS",
					debit: 0,
					kredit: billing.jumlah,
					referenceId: billing.id,
				},
			});
		});
		createdCount++;
	}

	// 4. Find overdue employee billings (pembayaran/salary) without expense accrual
	const overdueEmployeePayments = await prisma.employeeBilling.findMany({
		where: {
			statusBayar: "Belum Lunas",
			tanggalJatuhTempo: { lt: now },
			tipe: "pembayaran",
		},
		include: {
			employee: { select: { id: true, nama: true, nip: true } },
		},
	});

	for (const billing of overdueEmployeePayments) {
		const reference = `expense-emp-billing-${billing.id}`;
		const existing = await prisma.journalEntry.findUnique({
			where: { reference },
		});
		if (existing) continue;

		const expenseCode = getExpenseAccountCode(billing.jenisBiaya);
		await prisma.$transaction(async (tx) => {
			await postToJournal(tx, {
				tanggal: now,
				keterangan: `Beban ${billing.jenisBiaya} - ${billing.employee.nama} (${billing.employee.nip})${billing.keterangan ? ` - ${billing.keterangan}` : ""}`,
				reference,
				entries: [
					{
						kodeAkun: expenseCode,
						debit: billing.jumlah,
						kredit: 0,
					},
					{
						kodeAkun: HUTANG_USAHA_ACCOUNT_CODE,
						debit: 0,
						kredit: billing.jumlah,
					},
				],
				userRole: "owner",
				userEmail: "system",
			});

			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Beban ${billing.jenisBiaya} - ${billing.employee.nama} - Beban`,
					kodeAkun: expenseCode,
					kategori: "pengeluaran",
					cashflowCategory: "OPS",
					debit: billing.jumlah,
					kredit: 0,
					referenceId: billing.id,
				},
			});
			await tx.cashflow.create({
				data: {
					tanggal: now,
					keterangan: `Beban ${billing.jenisBiaya} - ${billing.employee.nama} - Hutang`,
					kodeAkun: HUTANG_USAHA_ACCOUNT_CODE,
					kategori: "pengeluaran",
					cashflowCategory: "OPS",
					debit: 0,
					kredit: billing.jumlah,
					referenceId: billing.id,
				},
			});
		});
		createdCount++;
	}

	return createdCount;
}
