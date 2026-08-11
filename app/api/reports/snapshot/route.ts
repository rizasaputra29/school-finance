/**
 * Report Snapshot API - Data freeze and snapshot functionality
 * Task 37: Data Freeze & Snapshot
 * Snapshot reports at closing - cannot change, only regenerate via reopen
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
	withAuthAppRouter,
	getQueryParams,
	AuthUser,
} from "@/lib/auth/auth-middleware";
import { roundAmount } from "@/lib/accounting/accounting-validation";
import { success, errors } from "@/lib/api/api-response";

const createSnapshotSchema = z.object({
	academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
	tipe: z.enum(["neraca", "labarugi", "cashflow"]),
});

const reopenSchema = z.object({
	academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
	reason: z.string().optional(),
});

async function calculatePeriodBalances(): Promise<{
	accounts: Array<{
		kodeAkun: string;
		namaAkun: string;
		tipeAkun: string;
		saldo: number;
	}>;
	totalAset: number;
	totalKewajiban: number;
	totalEkuitas: number;
	totalPendapatan: number;
	totalBeban: number;
}> {
	const accounts = await prisma.account.findMany({
		select: {
			kodeAkun: true,
			namaAkun: true,
			tipeAkun: true,
			saldo: true,
		},
	});

	const accountsWithBalances = accounts.map((a) => ({
		...a,
		saldo: roundAmount(a.saldo),
	}));

	const totalAset = accountsWithBalances
		.filter((a) => a.tipeAkun === "Asset")
		.reduce((sum, a) => sum + a.saldo, 0);

	const totalKewajiban = accountsWithBalances
		.filter((a) => a.tipeAkun === "Liability")
		.reduce((sum, a) => sum + a.saldo, 0);

	const totalEkuitas = accountsWithBalances
		.filter((a) => a.tipeAkun === "Equity")
		.reduce((sum, a) => sum + a.saldo, 0);

	const totalPendapatan = accountsWithBalances
		.filter((a) => a.tipeAkun === "Revenue")
		.reduce((sum, a) => sum + a.saldo, 0);

	const totalBeban = accountsWithBalances
		.filter((a) => a.tipeAkun === "Expense")
		.reduce((sum, a) => sum + a.saldo, 0);

	return {
		accounts: accountsWithBalances,
		totalAset: roundAmount(totalAset),
		totalKewajiban: roundAmount(totalKewajiban),
		totalEkuitas: roundAmount(totalEkuitas),
		totalPendapatan: roundAmount(totalPendapatan),
		totalBeban: roundAmount(totalBeban),
	};
}

async function createSnapshot(
	academicYearId: string,
	tipe: "neraca" | "labarugi" | "cashflow",
	userId?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const balances = await calculatePeriodBalances();

		let totalDebit = 0;
		let totalKredit = 0;

		switch (tipe) {
			case "neraca":
				totalDebit = balances.totalAset;
				totalKredit = balances.totalKewajiban + balances.totalEkuitas;
				break;
			case "labarugi":
				totalDebit = balances.totalBeban;
				totalKredit = balances.totalPendapatan;
				break;
			case "cashflow":
				const cashAccounts = balances.accounts.filter(
					(a) => a.kodeAkun.startsWith("111") || a.kodeAkun === "102",
				);
				totalDebit = cashAccounts.reduce((sum, a) => sum + a.saldo, 0);
				totalKredit = totalDebit;
				break;
		}

		await prisma.snapshot.deleteMany({
			where: { academicYearId, tipe },
		});

		await prisma.snapshot.create({
			data: {
				academicYearId,
				tipe,
				data: balances as unknown as import("@prisma/client").Prisma.InputJsonValue,
				totalDebit: roundAmount(totalDebit),
				totalKredit: roundAmount(totalKredit),
				createdBy: userId,
			},
		});

		return { success: true };
	} catch (error) {
		console.error("Create snapshot error:", error);
		return { success: false, error: "Gagal membuat snapshot" };
	}
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const query = getQueryParams(request);
			const { academicYearId, tipe } = query;

			if (!academicYearId) {
				return errors.validation([
					{ field: "academicYearId", message: "Tahun ajaran wajib dipilih" },
				]);
			}

			const where: Record<string, unknown> = { academicYearId };

			if (tipe) {
				where.tipe = tipe;
			}

			const snapshots = await prisma.snapshot.findMany({
				where,
				orderBy: { createdAt: "desc" },
			});

			return success(
				snapshots.map((s) => ({
					id: s.id,
					tipe: s.tipe,
					totalDebit: s.totalDebit,
					totalKredit: s.totalKredit,
					createdAt: s.createdAt,
					createdBy: s.createdBy,
				})),
				{
					message: "Data snapshot berhasil diambil",
					meta: { academicYearId },
				},
			);
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user: AuthUser) => {
			const body = await request.json();
			const validation = createSnapshotSchema.safeParse(body);
			if (!validation.success) {
				return errors.validation(
					validation.error.errors.map((err) => ({
						field: err.path.join("."),
						message: err.message,
					})),
				);
			}

			const { academicYearId, tipe } = validation.data;

			const yearRecord = await prisma.academicYear.findUnique({
				where: { id: academicYearId },
			});

			if (!yearRecord) {
				return errors.badRequest("Tahun ajaran tidak ditemukan");
			}

			if (!yearRecord.isArchived) {
				return errors.badRequest(
					"Tahun ajaran belum diarsipkan. Snapshot hanya bisa dibuat untuk tahun ajaran yang sudah ditutup/diarsipkan.",
				);
			}

			const result = await createSnapshot(academicYearId, tipe, user.id);

			if (!result.success) {
				return errors.internal(result.error || "Gagal membuat snapshot");
			}

			return success(
				{
					academicYearId,
					tipe,
				},
				{
					message: `Snapshot ${tipe} untuk tahun ajaran ${yearRecord.tahunAjaran} berhasil dibuat`,
					status: 201,
				},
			);
		},
		{ requireAdmin: true },
	);
}

export async function DELETE(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async (user: AuthUser) => {
			if (user.role !== "owner") {
				return errors.forbidden(
					"Hanya owner yang dapat menghapus snapshot tahun ajaran",
				);
			}

			const body = await request.json();
			const validation = reopenSchema.safeParse(body);
			if (!validation.success) {
				return errors.validation(
					validation.error.errors.map((err) => ({
						field: err.path.join("."),
						message: err.message,
					})),
				);
			}

			const { academicYearId, reason } = validation.data;

			await prisma.snapshot.deleteMany({
				where: { academicYearId },
			});

			await prisma.academicYear.update({
				where: { id: academicYearId },
				data: {
					isArchived: false,
					isActive: true,
				},
			});

			await prisma.auditTrail.create({
				data: {
					action: "reopen",
					entity: "academicYear",
					entityId: academicYearId,
					userId: user.id,
					newData: JSON.stringify({ reason }),
				},
			});

			const yearRecord = await prisma.academicYear.findUnique({
				where: { id: academicYearId },
				select: { tahunAjaran: true },
			});

			return success(
				{
					academicYearId,
				},
				{
					message: `Tahun ajaran ${yearRecord?.tahunAjaran || ""} berhasil dibuka kembali. Snapshot telah dihapus.`,
				},
			);
		},
		{ requireAdmin: true },
	);
}
