/**
 * Depreciation service - shared business logic for posting depreciation
 * journal entries, updating the Asset register, and keeping the COA in sync.
 *
 * Depreciation is recognised in full annual amounts on each transaction-date
 * anniversary. The journal entry debits "Beban Penyusutan" and credits the
 * "Akumulasi Penyusutan Aktiva Tetap" contra account (111). Fixed-asset
 * accounts (107-110) remain at gross cost; the contra account carries the
 * accumulated depreciation, so COA net book value is preserved.
 *
 * This module is meant to be called from API routes (asset purchase,
 * depreciation batch, seeding) inside a Prisma transaction.
 */

import type { PrismaClient } from "@prisma/client";
import {
	calculateDepreciationForPeriod,
	filterDepreciableAssets,
	type AssetDepreciationData,
} from "./accounting-depreciation";
import { computeSaldoChange } from "./accounting-chart-of-accounts";
import { syncAccountBalance } from "./accounting-balance";

// Transaction client type matching the one used across the app
type PrismaTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface DepreciationAccountCodes {
	bebanPenyusutanCode: string;
	akumulasiPenyusutanCode: string;
}

interface DepreciationEntry {
	kodeAkun: string;
	debit: number;
	kredit: number;
	keterangan: string;
}

interface ProcessAcademicYearResult {
	academicYearId: string;
	assetsProcessed: number;
	totalDepreciation: number;
	entries: DepreciationEntry[];
}

const DEFAULT_BEBAN_CODE = "600";
const DEFAULT_AKUMULASI_CODE = "111";

/**
 * Find or create the standard depreciation accounts.
 */
export async function findOrCreateDepreciationAccounts(
	tx: PrismaTx,
): Promise<DepreciationAccountCodes> {
	let accounts = await tx.account.findMany({
		where: {
			OR: [
				{ namaAkun: { contains: "Beban Penyusutan", mode: "insensitive" } },
				{ namaAkun: { contains: "Akumulasi Penyusutan", mode: "insensitive" } },
			],
		},
	});

	if (accounts.length < 2) {
		const hasBeban = accounts.some((a) =>
			a.namaAkun.toLowerCase().includes("beban"),
		);
		const hasAkumulasi = accounts.some((a) =>
			a.namaAkun.toLowerCase().includes("akumulasi"),
		);

		if (!hasBeban) {
			await tx.account.create({
				data: {
					kodeAkun: DEFAULT_BEBAN_CODE,
					namaAkun: "Beban Penyusutan Aktiva Tetap",
					tipeAkun: "Expense",
					saldo: 0,
					normalBalance: "debit",
					isContra: false,
					isSystem: true,
				},
			});
		}

		if (!hasAkumulasi) {
			await tx.account.create({
				data: {
					kodeAkun: DEFAULT_AKUMULASI_CODE,
					namaAkun: "Akumulasi Penyusutan Aktiva Tetap",
					tipeAkun: "Asset",
					saldo: 0,
					normalBalance: "kredit",
					isContra: true,
					isSystem: true,
				},
			});
		}

		accounts = await tx.account.findMany({
			where: {
				OR: [
					{ namaAkun: { contains: "Beban Penyusutan", mode: "insensitive" } },
					{ namaAkun: { contains: "Akumulasi Penyusutan", mode: "insensitive" } },
				],
			},
		});
	}

	const beban = accounts.find(
		(a) => a.tipeAkun === "Expense" && a.namaAkun.toLowerCase().includes("penyusutan"),
	);
	const akumulasi = accounts.find(
		(a) => a.tipeAkun === "Asset" && a.namaAkun.toLowerCase().includes("akumulasi"),
	);

	return {
		bebanPenyusutanCode: beban?.kodeAkun || DEFAULT_BEBAN_CODE,
		akumulasiPenyusutanCode: akumulasi?.kodeAkun || DEFAULT_AKUMULASI_CODE,
	};
}

/**
 * Get all active, depreciable assets.
 */
export async function getDepreciableAssetData(tx: PrismaTx): Promise<AssetDepreciationData[]> {
	const assets = await tx.asset.findMany({
		where: { status: "Active" },
		include: { account: true },
		orderBy: { tanggalPerolehan: "asc" },
	});

	return assets.map((asset) => ({
		id: asset.id,
		kodeAkun: asset.kodeAkun,
		nama: asset.nama,
		kategori: asset.kategori,
		tanggalPerolehan: asset.tanggalPerolehan,
		hargaPerolehan: asset.hargaPerolehan,
		umurTeknis: asset.umurTeknis,
		nilaiResidu: asset.nilaiResidu,
		isTanah: asset.isTanah,
		status: asset.status,
		alreadyDepreciatedAmount: asset.alreadyDepreciatedAmount,
		alreadyDepreciatedYears: asset.alreadyDepreciatedYears,
		sisaUmurTeknis: asset.sisaUmurTeknis,
	}));
}

function buildDepreciationJournalEntries(
	assetId: string,
	assetName: string,
	akumulasiPenyusutanCode: string,
	amount: number,
	academicYear: { tahunAjaran: string },
	bebanCode: string,
): DepreciationEntry[] {
	if (amount <= 0) return [];

	return [
		{
			kodeAkun: bebanCode,
			debit: amount,
			kredit: 0,
			keterangan: `Beban Penyusutan [${assetId}] ${assetName} - ${academicYear.tahunAjaran}`,
		},
		{
			kodeAkun: akumulasiPenyusutanCode,
			debit: 0,
			kredit: amount,
			keterangan: `Akumulasi Penyusutan [${assetId}] ${assetName} - ${academicYear.tahunAjaran}`,
		},
	];
}

function computeUpdatedAssetFields(asset: AssetDepreciationData, periodDepreciation: number) {
	const newAlreadyDepreciatedAmount =
		(asset.alreadyDepreciatedAmount ?? 0) + periodDepreciation;
	const newAlreadyDepreciatedYears = (asset.alreadyDepreciatedYears ?? 0) + 1;
	const newSisaUmurTeknis = Math.max(
		0,
		asset.umurTeknis - newAlreadyDepreciatedYears,
	);

	return {
		alreadyDepreciatedAmount: newAlreadyDepreciatedAmount,
		alreadyDepreciatedYears: newAlreadyDepreciatedYears,
		sisaUmurTeknis: newSisaUmurTeknis,
	};
}

function getDepreciationReference(
	assetId: string,
	academicYearId: string,
	yearIndex: number,
) {
	return `depreciation-${assetId}-${academicYearId}-${yearIndex}`;
}

export async function deleteDepreciationEntryByReference(tx: PrismaTx, reference: string) {
	const existing = await tx.journalEntry.findUnique({
		where: { reference },
		include: { entries: { include: { account: true } } },
	});
	if (existing) {
		// Reverse the balance impacts before removing the journal lines so the
		// COA stays consistent when old entries are replaced.
		for (const line of existing.entries) {
			if (!line.account) continue;
			const saldoChange = computeSaldoChange(
				line.account,
				line.debit,
				line.kredit,
			);
			await tx.account.update({
				where: { kodeAkun: line.kodeAkun },
				data: { saldo: { decrement: saldoChange } },
			});
			await syncAccountBalance(
				tx,
				line.kodeAkun,
				-saldoChange,
				existing.tanggal,
			);
		}

		await tx.journalEntryLine.deleteMany({
			where: { journalEntryId: existing.id },
		});
		await tx.journalEntry.delete({ where: { id: existing.id } });
	}
}

/**
 * Process depreciation for a single asset in a single academic year.
 * Creates/updates the per-asset journal entry, account balances, snapshots, and asset row.
 */
async function processDepreciationForSingleAssetYear(
	tx: PrismaTx,
	asset: AssetDepreciationData,
	academicYear: {
		id: string;
		tahunAjaran: string;
		tanggalMulai: Date;
		tanggalSelesai: Date;
	},
	codes: DepreciationAccountCodes,
	options: { force?: boolean; capDate?: Date } = {},
): Promise<ProcessAcademicYearResult> {
	const { force = false, capDate = new Date() } = options;

	const periodEnd = academicYear.tanggalSelesai < capDate
		? academicYear.tanggalSelesai
		: capDate;
	const amount = calculateDepreciationForPeriod(asset, academicYear.tanggalMulai, periodEnd);

	if (amount <= 0) {
		return {
			academicYearId: academicYear.id,
			assetsProcessed: 0,
			totalDepreciation: 0,
			entries: [],
		};
	}

	const nextYearIndex = asset.alreadyDepreciatedYears ?? 0;
	const reference = getDepreciationReference(asset.id, academicYear.id, nextYearIndex);

	if (force) {
		await deleteDepreciationEntryByReference(tx, reference);
	}

	// One-time cleanup: remove legacy single-entry-per-asset-per-year records
	// that used the old reference format without a year index.
	const legacyReference = `depreciation-${asset.id}-${academicYear.id}`;
	await deleteDepreciationEntryByReference(tx, legacyReference);

	const existingEntry = await tx.journalEntry.findUnique({ where: { reference } });
	if (existingEntry && !force) {
		return {
			academicYearId: academicYear.id,
			assetsProcessed: 0,
			totalDepreciation: 0,
			entries: [],
		};
	}

	const entries = buildDepreciationJournalEntries(
		asset.id,
		asset.nama,
		codes.akumulasiPenyusutanCode,
		amount,
		academicYear,
		codes.bebanPenyusutanCode,
	);

	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal: academicYear.tanggalSelesai,
			keterangan: `Penyusutan Aktiva Tetap [${asset.id}] ${asset.nama} - ${academicYear.tahunAjaran}`,
			reference,
			status: "posted",
		},
	});

	await tx.journalEntryLine.createMany({
		data: entries.map((entry) => ({
			journalEntryId: journalEntry.id,
			kodeAkun: entry.kodeAkun,
			debit: entry.debit,
			kredit: entry.kredit,
		})),
	});

	const accounts = await tx.account.findMany({
		where: {
			kodeAkun: { in: [codes.bebanPenyusutanCode, codes.akumulasiPenyusutanCode] },
		},
	});
	const accountMap = new Map(accounts.map((a) => [a.kodeAkun, a]));

	const accountUpdates = entries
		.map((entry) => {
			const account = accountMap.get(entry.kodeAkun);
			if (!account) return null;
			const saldoChange = computeSaldoChange(account, entry.debit, entry.kredit);
			return { kodeAkun: entry.kodeAkun, saldoChange };
		})
		.filter(Boolean) as { kodeAkun: string; saldoChange: number }[];

	await Promise.all(
		accountUpdates.map(({ kodeAkun, saldoChange }) =>
			tx.account.update({
				where: { kodeAkun },
				data: { saldo: { increment: saldoChange } },
			}),
		),
	);

	await Promise.all(
		accountUpdates.map(({ kodeAkun, saldoChange }) =>
			syncAccountBalance(tx, kodeAkun, saldoChange, academicYear.tanggalSelesai),
		),
	);

	const updates = computeUpdatedAssetFields(asset, amount);
	await tx.asset.update({ where: { id: asset.id }, data: updates });

	return {
		academicYearId: academicYear.id,
		assetsProcessed: 1,
		totalDepreciation: amount,
		entries,
	};
}

/**
 * Process depreciation for a single academic year.
 * Creates/updates per-asset journal entries, account balances, snapshots, and asset rows.
 */
export async function processDepreciationForAcademicYear(
	tx: PrismaTx,
	academicYearId: string,
	options: { assetId?: string; force?: boolean; capDate?: Date } = {},
): Promise<ProcessAcademicYearResult> {
	const { assetId, force = false, capDate = new Date() } = options;

	const academicYear = await tx.academicYear.findUnique({
		where: { id: academicYearId },
	});
	if (!academicYear) {
		throw new Error(`Tahun ajaran tidak ditemukan: ${academicYearId}`);
	}

	const codes = await findOrCreateDepreciationAccounts(tx);

	// One-time cleanup: remove legacy single-entry-per-year records so they do
	// not duplicate the new per-asset entries.
	await deleteDepreciationEntryByReference(tx, `depreciation-${academicYearId}`);

	const assets = await getDepreciableAssetData(tx);
	const depreciableAssets = filterDepreciableAssets(assets).filter(
		(a) => !assetId || a.id === assetId,
	);

	const results: ProcessAcademicYearResult[] = [];
	for (const asset of depreciableAssets) {
		const result = await processDepreciationForSingleAssetYear(
			tx,
			asset,
			academicYear,
			codes,
			{ force, capDate },
		);
		results.push(result);
	}

	return {
		academicYearId,
		assetsProcessed: results.reduce((sum, r) => sum + r.assetsProcessed, 0),
		totalDepreciation: results.reduce((sum, r) => sum + r.totalDepreciation, 0),
		entries: results.flatMap((r) => r.entries),
	};
}

/**
 * Process depreciation for all active depreciable assets from each asset's
 * acquisition academic year up to and including the target academic year.
 * Idempotent: already-posted years are skipped unless force is true.
 */
export async function processDepreciationCatchUpToAcademicYear(
	tx: PrismaTx,
	targetAcademicYearId: string,
	options: { force?: boolean; capDate?: Date } = {},
): Promise<ProcessAcademicYearResult[]> {
	const assets = await getDepreciableAssetData(tx);
	const depreciableAssets = filterDepreciableAssets(assets);

	const results: ProcessAcademicYearResult[] = [];
	for (const asset of depreciableAssets) {
		const rangeResults = await processDepreciationForAssetRange(
			tx,
			asset.id,
			targetAcademicYearId,
			{ ...options, useYearEnd: true },
		);
		results.push(...rangeResults);
	}
	return results;
}

/**
 * Process depreciation for a single asset from its acquisition academic year
 * up to and including the target academic year.
 */
export async function processDepreciationForAssetRange(
	tx: PrismaTx,
	assetId: string,
	targetAcademicYearId: string,
	options: { force?: boolean; capDate?: Date; useYearEnd?: boolean } = {},
): Promise<ProcessAcademicYearResult[]> {
	const asset = await tx.asset.findUnique({ where: { id: assetId } });
	if (!asset) throw new Error(`Aset tidak ditemukan: ${assetId}`);
	if (asset.isTanah || asset.status !== "Active") return [];

	const targetYear = await tx.academicYear.findUnique({
		where: { id: targetAcademicYearId },
	});
	if (!targetYear) throw new Error(`Tahun ajaran tidak ditemukan: ${targetAcademicYearId}`);

	const { force = false, capDate = new Date(), useYearEnd = false } = options;
	const codes = await findOrCreateDepreciationAccounts(tx);

	// Find all academic years from the asset acquisition date up to the target year
	const allYears = await tx.academicYear.findMany({
		where: {
			tanggalSelesai: { gte: asset.tanggalPerolehan },
			tanggalMulai: { lte: targetYear.tanggalSelesai },
		},
		orderBy: { tanggalMulai: "asc" },
	});

	// One-time cleanup: remove legacy single-entry-per-year records for every
	// academic year in the range so they do not duplicate new per-asset entries.
	for (const year of allYears) {
		await deleteDepreciationEntryByReference(tx, `depreciation-${year.id}`);
	}

	const assetData: AssetDepreciationData = {
		id: asset.id,
		kodeAkun: asset.kodeAkun,
		nama: asset.nama,
		kategori: asset.kategori,
		tanggalPerolehan: asset.tanggalPerolehan,
		hargaPerolehan: asset.hargaPerolehan,
		umurTeknis: asset.umurTeknis,
		nilaiResidu: asset.nilaiResidu,
		isTanah: asset.isTanah,
		status: asset.status,
		alreadyDepreciatedAmount: asset.alreadyDepreciatedAmount,
		alreadyDepreciatedYears: asset.alreadyDepreciatedYears,
		sisaUmurTeknis: asset.sisaUmurTeknis,
	};

	const results: ProcessAcademicYearResult[] = [];
	for (const year of allYears) {
		const result = await processDepreciationForSingleAssetYear(
			tx,
			assetData,
			year,
			codes,
			{ force, capDate: useYearEnd ? year.tanggalSelesai : capDate },
		);
		results.push(result);

		// Update accumulated fields in memory so subsequent years see the new base
		assetData.alreadyDepreciatedAmount =
			(assetData.alreadyDepreciatedAmount ?? 0) + result.totalDepreciation;
		if (result.totalDepreciation > 0) {
			assetData.alreadyDepreciatedYears =
				(assetData.alreadyDepreciatedYears ?? 0) + 1;
			assetData.sisaUmurTeknis = Math.max(
				0,
				assetData.umurTeknis - (assetData.alreadyDepreciatedYears ?? 0),
			);
		}
	}

	return results;
}

/**
 * Create opening depreciation journal entries for assets that already have
 * historical accumulated depreciation (alreadyDepreciatedAmount > 0).
 * This ensures the COA matches the asset register on first setup.
 */
export async function createOpeningDepreciationEntries(
	tx: PrismaTx,
	options: { force?: boolean } = {},
): Promise<{ assetsProcessed: number; totalAmount: number }> {
	const { force = false } = options;
	const reference = "opening-depreciation";

	const earliestYear = await tx.academicYear.findFirst({
		orderBy: { tanggalMulai: "asc" },
	});
	if (!earliestYear) {
		return { assetsProcessed: 0, totalAmount: 0 };
	}

	const { bebanPenyusutanCode, akumulasiPenyusutanCode } =
		await findOrCreateDepreciationAccounts(tx);

	if (force) {
		const existing = await tx.journalEntry.findUnique({
			where: { reference },
			include: { entries: { include: { account: true } } },
		});
		if (existing) {
			for (const line of existing.entries) {
				if (!line.account) continue;
				const saldoChange = computeSaldoChange(
					line.account,
					line.debit,
					line.kredit,
				);
				await tx.account.update({
					where: { kodeAkun: line.kodeAkun },
					data: { saldo: { decrement: saldoChange } },
				});
				await syncAccountBalance(
					tx,
					line.kodeAkun,
					-saldoChange,
					existing.tanggal,
				);
			}
			await tx.journalEntryLine.deleteMany({
				where: { journalEntryId: existing.id },
			});
			await tx.journalEntry.delete({ where: { id: existing.id } });
		}
	}

	const existingEntry = await tx.journalEntry.findUnique({ where: { reference } });
	if (existingEntry) {
		return { assetsProcessed: 0, totalAmount: 0 };
	}

	const assets = await tx.asset.findMany({
		where: {
			status: "Active",
			isTanah: false,
			alreadyDepreciatedAmount: { gt: 0 },
		},
	});

	if (assets.length === 0) {
		return { assetsProcessed: 0, totalAmount: 0 };
	}

	const entries: DepreciationEntry[] = [];
	let totalAmount = 0;

	for (const asset of assets) {
		const amount = asset.alreadyDepreciatedAmount;
		if (amount <= 0) continue;
		entries.push(
			{
				kodeAkun: bebanPenyusutanCode,
				debit: amount,
				kredit: 0,
				keterangan: `Beban Penyusutan Awal [${asset.id}] ${asset.nama}`,
			},
			{
				kodeAkun: akumulasiPenyusutanCode,
				debit: 0,
				kredit: amount,
				keterangan: `Akumulasi Penyusutan Awal [${asset.id}] ${asset.nama}`,
			},
		);
		totalAmount += amount;
	}

	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal: earliestYear.tanggalMulai,
			keterangan: `Penyusutan Awal Aktiva Tetap - ${earliestYear.tahunAjaran}`,
			reference,
			status: "posted",
		},
	});

	await tx.journalEntryLine.createMany({
		data: entries.map((entry) => ({
			journalEntryId: journalEntry.id,
			kodeAkun: entry.kodeAkun,
			debit: entry.debit,
			kredit: entry.kredit,
		})),
	});

	const accountCodes = [
		bebanPenyusutanCode,
		akumulasiPenyusutanCode,
	];
	const accountMap = new Map(
		(
			await tx.account.findMany({
				where: { kodeAkun: { in: accountCodes } },
			})
		).map((a) => [a.kodeAkun, a]),
	);

	const saldoChanges = entries
		.map((entry) => {
			const account = accountMap.get(entry.kodeAkun);
			if (!account) return null;
			return {
				kodeAkun: entry.kodeAkun,
				saldoChange: computeSaldoChange(account, entry.debit, entry.kredit),
			};
		})
		.filter(Boolean) as { kodeAkun: string; saldoChange: number }[];

	await Promise.all(
		saldoChanges.map(({ kodeAkun, saldoChange }) =>
			tx.account.update({
				where: { kodeAkun },
				data: { saldo: { increment: saldoChange } },
			}),
		),
	);

	await Promise.all(
		saldoChanges.map(({ kodeAkun, saldoChange }) =>
			syncAccountBalance(tx, kodeAkun, saldoChange, earliestYear.tanggalMulai),
		),
	);

	return { assetsProcessed: assets.length, totalAmount };
}
