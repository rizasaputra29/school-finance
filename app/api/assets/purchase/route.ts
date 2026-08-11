/**
 * Asset Purchase API
 * Handles purchase of fixed assets (equipment, vehicles, buildings, land)
 * and non-asset expenses (supplies, services, maintenance)
 *
 * Double-entry logic:
 * - Asset purchase: Debit Aset (Asset account), Credit Kas/Bank (payment)
 * - Non-asset: Debit Beban (Expense account), Credit Kas/Bank (payment)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	rateLimit,
	RATE_LIMITS,
	getClientIp,
	formatRateLimitError,
} from "@/lib/api/api-rate-limit";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

type PrismaTransactionClient = Parameters<
	Parameters<typeof prisma.$transaction>[0]
>[0];

// Asset categories that are true fixed assets (tracked in Asset model)
const ASSET_CATEGORIES = ["Peralatan", "Kendaraan", "Bangunan", "Tanah"];

// Non-asset categories that go directly to expense
const NON_ASSET_CATEGORIES = [
	"Supplies",
	"Services",
	"Maintenance",
	"Perlengkapan",
	"Jasa",
	"Perawatan",
];

// Validation schema for asset purchase
const purchaseSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	nama: z.string().min(1, "Nama item wajib diisi"),
	kategori: z.string().min(1, "Kategori wajib diisi"),
	jumlah: z.number().positive("Jumlah harus lebih dari 0"),
	kodeAkun: z.string().min(1, "Kode akun wajib dipilih dari COA"),
	kodeAkunPembayaran: z.string().min(1, "Kode akun pembayaran wajib dipilih dari COA"),
	lokasi: z.string().optional(),
	umurTeknis: z.number().int().min(0).max(50).optional(), // Years for depreciation
	nilaiResidu: z.number().min(0).optional().default(0),
	keterangan: z.string().optional(),
});

// Response type
interface PurchaseResponse {
	success: boolean;
	message: string;
	data?: {
		cashflows: Array<{
			id: string;
			kodeAkun: string;
			debit: number;
			kredit: number;
			keterangan: string;
		}>;
		asset?: {
			id: string;
			nama: string;
			kategori: string;
			hargaPerolehan: number;
			tanggalPerolehan: Date;
		};
		journalEntry?: {
			id: string;
			tanggal: Date;
			keterangan: string;
		};
		entries: Array<{
			kodeAkun: string;
			debit: number;
			kredit: number;
			keterangan: string;
		}>;
	};
}

/**
 * Determine if category is an asset or expense
 */
function isAssetCategory(kategori: string): boolean {
	return ASSET_CATEGORIES.includes(kategori);
}

/**
 * Process asset purchase transaction
 */
async function processPurchase(
	tx: PrismaTransactionClient,
	data: {
		tanggal: string;
		nama: string;
		kategori: string;
		jumlah: number;
		kodeAkun: string;
		kodeAkunPembayaran: string;
		lokasi?: string;
		umurTeknis?: number;
		nilaiResidu?: number;
		keterangan?: string;
	},
): Promise<PurchaseResponse["data"]> {
	const isAsset = isAssetCategory(data.kategori);

	// Validate payment account exists and is an Asset account
	const paymentAccountCode = data.kodeAkunPembayaran;
	const paymentAccount = await tx.account.findUnique({
		where: { kodeAkun: paymentAccountCode },
	});
	if (!paymentAccount) {
		throw new Error(
			`Akun pembayaran dengan kode ${paymentAccountCode} tidak ditemukan`,
		);
	}
	if (paymentAccount.tipeAkun !== "Asset") {
		throw new Error(
			`Akun pembayaran ${paymentAccountCode} harus bertipe Asset`,
		);
	}

	// Get the target account from COA
	const targetAccountCode = data.kodeAkun;
	const targetAccount = await tx.account.findUnique({
		where: { kodeAkun: targetAccountCode },
	});

	if (!targetAccount) {
		throw new Error(`Akun dengan kode ${targetAccountCode} tidak ditemukan`);
	}

	// Validate target account type matches purchase type
	if (isAsset && targetAccount.tipeAkun !== "Asset") {
		throw new Error(
			`Akun ${targetAccountCode} harus bertipe Asset untuk pembelian aktiva`,
		);
	}
	if (!isAsset && targetAccount.tipeAkun !== "Expense") {
		throw new Error(
			`Akun ${targetAccountCode} harus bertipe Expense untuk pembelian beban`,
		);
	}

	// Build double-entry transactions
	const transactionKeterangan =
		data.keterangan ||
		(isAsset
			? `Pembelian Aktiva: ${data.nama}`
			: `Pembelian Beban: ${data.nama}`);
	const entries = isAsset
		? [
				// Asset purchase: Debit Aset, Credit Kas/Bank
				{
					kodeAkun: targetAccountCode,
					debit: data.jumlah,
					kredit: 0,
					keterangan: transactionKeterangan,
				},
				{
					kodeAkun: paymentAccountCode,
					debit: 0,
					kredit: data.jumlah,
					keterangan: transactionKeterangan,
				},
			]
		: [
				// Non-asset: Debit Beban, Credit Kas/Bank
				{
					kodeAkun: targetAccountCode,
					debit: data.jumlah,
					kredit: 0,
					keterangan: transactionKeterangan,
				},
				{
					kodeAkun: paymentAccountCode,
					debit: 0,
					kredit: data.jumlah,
					keterangan: transactionKeterangan,
				},
			];

	// Create journal entry first so cashflow records can reference it
	const journalEntry = await tx.journalEntry.create({
		data: {
			tanggal: new Date(data.tanggal),
			keterangan: transactionKeterangan,
			reference: `asset-purchase-${Date.now()}`,
		},
	});

	for (const entry of entries) {
		await tx.journalEntryLine.create({
			data: {
				journalEntryId: journalEntry.id,
				kodeAkun: entry.kodeAkun,
				debit: entry.debit,
				kredit: entry.kredit,
			},
		});
	}

	// Process all entries and update account balances
	const createdCashflows = [];

	for (const entry of entries) {
		// Get account for balance calculation
		const account = await tx.account.findUnique({
			where: { kodeAkun: entry.kodeAkun },
		});

		if (!account) {
			throw new Error(`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`);
		}

		// Calculate balance adjustment based on account type
		const isDebitNormal = ["Asset", "Expense"].includes(account.tipeAkun);
		let saldoChange = 0;

		if (isDebitNormal) {
			saldoChange = entry.debit - entry.kredit;
		} else {
			saldoChange = entry.kredit - entry.debit;
		}

		// Update account balance
		await tx.account.update({
			where: { kodeAkun: entry.kodeAkun },
			data: {
				saldo: { increment: saldoChange },
			},
		});

		// Create cashflow record
		const cashflow = await tx.cashflow.create({
			data: {
				tanggal: new Date(data.tanggal),
				keterangan: entry.keterangan,
				kodeAkun: entry.kodeAkun,
				kategori: isAsset ? "aset" : "pengeluaran",
				cashflowCategory: isAsset ? "INV" : "OPS",
				debit: entry.debit,
				kredit: entry.kredit,
				source:
					paymentAccount.namaAkun.toLowerCase().includes("bank")
						? "bank"
						: "kas",
				referenceId: journalEntry.id,
			} as never,
		});

		createdCashflows.push({
			id: cashflow.id,
			kodeAkun: cashflow.kodeAkun,
			debit: cashflow.debit,
			kredit: cashflow.kredit,
			keterangan: cashflow.keterangan,
		});
	}

	// Update AccountBalance snapshots for the active academic year
	const purchaseDate = new Date(data.tanggal);
	const academicYearForPurchase = await tx.academicYear.findFirst({
		where: {
			tanggalMulai: { lte: purchaseDate },
			tanggalSelesai: { gte: purchaseDate },
		},
	});

	if (academicYearForPurchase) {
		for (const entry of entries) {
			const account = await tx.account.findUnique({
				where: { kodeAkun: entry.kodeAkun },
			});
			if (!account) continue;

			const isDebitNormal = ["Asset", "Expense"].includes(account.tipeAkun);
			const saldoChange = isDebitNormal
				? entry.debit - entry.kredit
				: entry.kredit - entry.debit;

			await tx.accountBalance
				.upsert({
					where: {
						kodeAkun_academicYearId: {
							kodeAkun: entry.kodeAkun,
							academicYearId: academicYearForPurchase.id,
						},
					},
					update: { saldo: { increment: saldoChange } },
					create: {
						kodeAkun: entry.kodeAkun,
						academicYearId: academicYearForPurchase.id,
						saldo: saldoChange,
					},
				})
				.catch(() => {});
		}
	}

	// If it's an asset, create Asset record for tracking
	let assetRecord = null;
	if (isAsset) {
		const isTanah = data.kategori === "Tanah";
		const umur = isTanah
			? 0
			: data.umurTeknis || getDefaultUmurTeknis(data.kategori);

		const asset = await tx.asset.create({
			data: {
				kodeAkun: targetAccountCode,
				nama: data.nama,
				kategori: data.kategori,
				lokasi: data.lokasi || null,
				tanggalPerolehan: new Date(data.tanggal),
				hargaPerolehan: data.jumlah,
				umurTeknis: umur,
				nilaiResidu: data.nilaiResidu || 0,
				isTanah: isTanah,
				status: "Active",
			},
		});

		assetRecord = {
			id: asset.id,
			nama: asset.nama,
			kategori: asset.kategori,
			hargaPerolehan: asset.hargaPerolehan,
			tanggalPerolehan: asset.tanggalPerolehan,
		};
	}

	return {
		cashflows: createdCashflows,
		asset: assetRecord || undefined,
		journalEntry: {
			id: journalEntry.id,
			tanggal: journalEntry.tanggal,
			keterangan: journalEntry.keterangan,
		},
		entries,
	};
}

/**
 * Get default technical life based on category
 */
function getDefaultUmurTeknis(kategori: string): number {
	const defaultUmurMap: Record<string, number> = {
		Peralatan: 5,
		Kendaraan: 10,
		Bangunan: 20,
	};
	return defaultUmurMap[kategori] || 5;
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const page = searchParams.get("page") || "1";
				const limit = searchParams.get("limit") || "20";
				const isAsset = searchParams.get("isAsset");
				const startDate = searchParams.get("startDate");
				const endDate = searchParams.get("endDate");
				const academicYearId = searchParams.get("academicYearId");
				const search = searchParams.get("search");
				const skip = (parseInt(page) - 1) * parseInt(limit);

				// Build where clause
				const where: Record<string, unknown> = {};

				// Filter by asset purchases
				if (isAsset === "true") {
					where.kategori = { in: ASSET_CATEGORIES };
				} else if (isAsset === "false") {
					where.kategori = { in: NON_ASSET_CATEGORIES };
				}

				// Carry-forward filter: assets acquired on or before the academic year end
				let academicYear: Awaited<
					ReturnType<typeof prisma.academicYear.findUnique>
				> = null;
				if (academicYearId) {
					academicYear = await prisma.academicYear.findUnique({
						where: { id: academicYearId },
					});
					if (academicYear) {
						where.tanggalPerolehan = { lte: academicYear.tanggalSelesai };
					}
				} else if (startDate && endDate) {
					where.tanggal = {
						gte: new Date(startDate),
						lte: new Date(endDate),
					};
				}

				// Search filter
				if (search) {
					where.OR = [
						{ nama: { contains: search, mode: "insensitive" } },
						{ kategori: { contains: search, mode: "insensitive" } },
					];
				}

				// Get all purchases (both Asset records and Cashflows)
				const [
					assetPurchases,
					nonAssetPurchases,
					totalAssets,
					totalNonAssets,
				]: [
					Awaited<ReturnType<typeof prisma.asset.findMany>> | [],
					Awaited<ReturnType<typeof prisma.cashflow.findMany>> | [],
					number,
					number,
				] = await Promise.all([
					// Asset purchases from Asset table
					isAsset !== "false"
						? prisma.asset.findMany({
								where,
								orderBy: { tanggalPerolehan: "desc" },
								skip,
								take: parseInt(limit),
								include: { account: true },
							})
						: Promise.resolve([]),
					// Non-asset purchases from Cashflow (expense categories)
					isAsset !== "true"
						? prisma.cashflow.findMany({
								where: {
									kategori: "pengeluaran",
									...(startDate && endDate
										? {
												tanggal: {
													gte: new Date(startDate),
													lte: new Date(endDate),
												},
											}
										: {}),
								},
								orderBy: { tanggal: "desc" },
								take: parseInt(limit),
							})
						: Promise.resolve([]),
					isAsset !== "false"
						? prisma.asset.count({ where })
						: Promise.resolve(0),
					isAsset !== "true"
						? prisma.cashflow.count({ where: { kategori: "pengeluaran" } })
						: Promise.resolve(0),
				]);

				// Determine total count
				let total = 0;
				if (isAsset === "true") total = totalAssets;
				else if (isAsset === "false") total = totalNonAssets;
				else total = totalAssets + totalNonAssets;

				// Compute per-academic-year depreciation values for assets
				const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

				function computeAssetYearValues(
					asset: (typeof assetPurchases)[number],
				) {
					if (!academicYear) {
						return {
							bookValue: asset.isTanah
								? asset.hargaPerolehan
								: asset.hargaPerolehan - asset.alreadyDepreciatedAmount,
							sisaUmurTeknis: asset.isTanah
								? null
								: (asset.sisaUmurTeknis ??
									asset.umurTeknis - asset.alreadyDepreciatedYears),
							accumulatedDepreciation: asset.isTanah
								? 0
								: asset.alreadyDepreciatedAmount,
							depreciatedYears: asset.isTanah
								? 0
								: asset.alreadyDepreciatedYears,
						};
					}

					const yearEnd = academicYear.tanggalSelesai;
					const purchaseDate = asset.tanggalPerolehan;

					if (asset.isTanah || asset.umurTeknis === 0) {
						return {
							bookValue: asset.hargaPerolehan,
							sisaUmurTeknis: null,
							accumulatedDepreciation: 0,
							depreciatedYears: 0,
						};
					}

					const yearsElapsed = Math.max(
						0,
						Math.floor(
							(yearEnd.getTime() - purchaseDate.getTime()) / MS_PER_YEAR,
						),
					);
					const depreciatedYears = Math.min(yearsElapsed, asset.umurTeknis);
					const annualDepreciation =
						(asset.hargaPerolehan - asset.nilaiResidu) / asset.umurTeknis;
					const accumulatedDepreciation =
						depreciatedYears * annualDepreciation;
					const bookValue = asset.hargaPerolehan - accumulatedDepreciation;
					const sisaUmurTeknis = asset.umurTeknis - depreciatedYears;

					return {
						bookValue: Math.max(bookValue, asset.nilaiResidu),
						sisaUmurTeknis: Math.max(sisaUmurTeknis, 0),
						accumulatedDepreciation: Math.min(
							accumulatedDepreciation,
							asset.hargaPerolehan - asset.nilaiResidu,
						),
						depreciatedYears,
					};
				}

				return success(
					{
						assets: assetPurchases.map((a) => {
							const computed = computeAssetYearValues(a);
							return {
								id: a.id,
								nama: a.nama,
								kategori: a.kategori,
								jumlah: a.hargaPerolehan,
								tanggal: a.tanggalPerolehan,
								lokasi: a.lokasi,
								isAsset: true,
								umurTeknis: a.umurTeknis,
								nilaiResidu: a.nilaiResidu,
								isTanah: a.isTanah,
								status: a.status,
								...computed,
							};
						}),
						expenses: nonAssetPurchases.map((c) => ({
							id: c.id,
							nama: c.keterangan,
							kategori: c.kategori,
							jumlah: c.debit,
							tanggal: c.tanggal,
							isAsset: false,
						})),
						categories: {
							assets: ASSET_CATEGORIES,
							nonAssets: NON_ASSET_CATEGORIES,
						},
					},
					{
						message: "Assets retrieved successfully",
						meta: {
							pagination: {
								page: parseInt(page),
								limit: parseInt(limit),
								total,
								totalPages: Math.ceil(total / parseInt(limit)),
							},
						},
					},
				);
			} catch (error) {
				console.error("Asset Purchase API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const ip = getClientIp(request);

			try {
				// Rate limiting for payment operations
				const rateLimitResult = rateLimit(`purchase:${ip}`, RATE_LIMITS.create);
				if (!rateLimitResult.success) {
					return errors.rateLimit(formatRateLimitError(rateLimitResult), {
						"Retry-After": Math.ceil(
							(rateLimitResult.reset - Date.now()) / 1000,
						).toString(),
					});
				}

				const body = await request.json();

				// Validate request body
				const validation = purchaseSchema.safeParse(body);
				if (!validation.success) {
					return errors.validation(
						validation.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const data = validation.data;

				// Process the purchase in a transaction
				try {
					const result = await prisma.$transaction(async (tx) => {
						return processPurchase(tx, data);
					});

					return success(result, {
						message: isAssetCategory(data.kategori)
							? `Pembelian aktiva "${data.nama}" berhasil`
							: `Pengeluaran "${data.nama}" berhasil dicatat`,
						status: 201,
					});
				} catch (error) {
					console.error("Purchase transaction error:", error);
					const message =
						error instanceof Error ? error.message : "Unknown error";
					return errors.badRequest(message);
				}
			} catch (error) {
				console.error("Asset Purchase API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
