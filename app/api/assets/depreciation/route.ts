/**
 * Asset Depreciation API
 * Auto-generates depreciation journal entries for fixed assets.
 * Depreciation is recognised in full annual amounts on each transaction-date
 * anniversary. Double-entry: Debit "Beban Penyusutan", Credit the
 * "Akumulasi Penyusutan Aktiva Tetap" contra account (111). Fixed-asset
 * accounts (107-110) remain at gross cost.
 *
 * Depreciation is calculated per academic year so entries fall inside the
 * selected/active year instead of being hard-coded to 31 December.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import {
	calculateDepreciation,
	type AssetDepreciationData,
	type DepreciationCalculation,
} from "@/lib/accounting/accounting-depreciation";
import {
	processDepreciationForAssetRange,
	processDepreciationCatchUpToAcademicYear,
	findOrCreateDepreciationAccounts,
	getDepreciableAssetData,
	createOpeningDepreciationEntries,
} from "@/lib/accounting/accounting-depreciation-service";

// Validation schema for manual depreciation trigger
const depreciateSchema = z.object({
	academicYearId: z.string().optional(),
	year: z.number().int().min(2000).max(2100).optional(),
	assetId: z.string().optional(),
	force: z.boolean().optional().default(false),
	opening: z.boolean().optional().default(false),
	capDate: z
		.string()
		.or(z.date())
		.transform((val) => new Date(val))
		.optional(),
});

// Response types
interface AssetWithDepreciation extends AssetDepreciationData {
	depreciation?: DepreciationCalculation;
}

interface DepreciationApiResponse {
	success: boolean;
	academicYearId?: string;
	year?: number;
	assetsProcessed: number;
	totalDepreciation: number;
	message: string;
	details?: {
		assets: AssetWithDepreciation[];
		entries: Array<{
			kodeAkun: string;
			debit: number;
			kredit: number;
			keterangan: string;
		}>;
	};
}

async function resolveAcademicYear(
	academicYearId?: string,
	year?: number,
) {
	if (academicYearId) {
		const ay = await prisma.academicYear.findUnique({
			where: { id: academicYearId },
		});
		if (ay) return ay;
	}

	if (year) {
		const ay = await prisma.academicYear.findFirst({
			where: {
				tanggalMulai: { lte: new Date(`${year}-12-31`) },
				tanggalSelesai: { gte: new Date(`${year}-01-01`) },
			},
			orderBy: { tanggalMulai: "desc" },
		});
		if (ay) return ay;
	}

	// Fall back to the currently active academic year
	return prisma.academicYear.findFirst({
		where: { isActive: true },
		orderBy: { tanggalMulai: "desc" },
	});
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const { searchParams } = new URL(request.url);
				const queryYear = searchParams.get("year");
				const academicYearId = searchParams.get("academicYearId");
				const assetId = searchParams.get("assetId");

				const year = queryYear
					? parseInt(queryYear, 10)
					: new Date().getFullYear();

				let academicYear: Awaited<
					ReturnType<typeof prisma.academicYear.findUnique>
				> = null;
				if (academicYearId) {
					academicYear = await prisma.academicYear.findUnique({
						where: { id: academicYearId },
					});
				}
				if (!academicYear && year) {
					academicYear = await prisma.academicYear.findFirst({
						where: {
							tanggalMulai: { lte: new Date(`${year}-12-31`) },
							tanggalSelesai: { gte: new Date(`${year}-01-01`) },
						},
						orderBy: { tanggalMulai: "desc" },
					});
				}
				if (!academicYear) {
					academicYear = await prisma.academicYear.findFirst({
						where: { isActive: true },
						orderBy: { tanggalMulai: "desc" },
					});
				}

				const resolvedYear = academicYear?.tanggalSelesai.getFullYear() ?? year;

				// Get depreciation expense account code
				const { bebanPenyusutanCode } = await findOrCreateDepreciationAccounts(prisma);

				// Get assets
				let assets = await getDepreciableAssetData(prisma);

				if (assetId) {
					assets = assets.filter((a) => a.id === assetId);
				}

				// Calculate depreciation for each asset
				const assetsWithDepreciation = assets.map((asset) => {
					const calc = academicYear
						? calculateDepreciation(asset, academicYear)
						: null;
					return {
						...asset,
						depreciation: calc,
						isDepreciable: !asset.isTanah && asset.status === "Active",
					};
				});

				// Get account info
				const bebanAccount = await prisma.account.findUnique({
					where: { kodeAkun: bebanPenyusutanCode },
				});

				// Calculate totals
				const depreciableAssets = assetsWithDepreciation.filter(
					(a) => a.isDepreciable,
				);
				const totalAcquisition = depreciableAssets.reduce(
					(sum, a) => sum + a.hargaPerolehan,
					0,
				);
				const totalCurrentDepreciation = depreciableAssets.reduce(
					(sum, a) => sum + (a.depreciation?.currentYearDepreciation || 0),
					0,
				);
				const totalAccumulated = depreciableAssets.reduce(
					(sum, a) => sum + (a.depreciation?.accumulatedDepreciation || 0),
					0,
				);
				const totalRemainingLife = depreciableAssets.reduce(
					(sum, a) => sum + (a.depreciation?.remainingUsefulLife || 0),
					0,
				);

				return success(assetsWithDepreciation, {
					message: "Depreciation data retrieved successfully",
					meta: {
						year: resolvedYear,
						academicYearId: academicYearId ?? undefined,
						accounts: {
							bebanPenyusutan: {
								kodeAkun: bebanPenyusutanCode,
								namaAkun: bebanAccount?.namaAkun,
								tipeAkun: bebanAccount?.tipeAkun,
							},
						},
						summary: {
							totalAssets: assets.length,
							depreciableAssets: depreciableAssets.length,
							totalAcquisition,
							totalCurrentYearDepreciation: totalCurrentDepreciation,
							totalAccumulatedDepreciation: totalAccumulated,
							totalRemainingUsefulLife: totalRemainingLife,
						},
					},
				});
			} catch (error) {
				console.error("Depreciation API error:", error);
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
			try {
				const body = await request.json();

				// Validate request body
				const validationResult = depreciateSchema.safeParse(body);
				if (!validationResult.success) {
					return errors.validation(
						validationResult.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const { academicYearId, year, assetId, force, opening, capDate } =
					validationResult.data;

				// Handle opening-entry creation for existing assets with historical depreciation
				if (opening) {
					const openingResult = await prisma.$transaction(async (tx) =>
						createOpeningDepreciationEntries(tx, { force }),
					);
					return success(openingResult, {
						message:
							openingResult.assetsProcessed > 0
								? `Penyusutan awal dibuat untuk ${openingResult.assetsProcessed} aset`
								: "Tidak ada penyusutan awal yang perlu dibuat",
					});
				}

				const targetAcademicYear = await resolveAcademicYear(
					academicYearId,
					year,
				);

				if (!targetAcademicYear) {
					return errors.badRequest("Tidak ada tahun ajaran yang aktif");
				}

				let results: DepreciationApiResponse[] = [];

				await prisma.$transaction(async (tx) => {
					if (assetId) {
						const rangeResults = await processDepreciationForAssetRange(
							tx,
							assetId,
							targetAcademicYear.id,
							{ force, capDate },
						);
						results = rangeResults.map((r) => ({
							success: true,
							academicYearId: r.academicYearId,
							assetsProcessed: r.assetsProcessed,
							totalDepreciation: r.totalDepreciation,
							message: `Depreciation processed`,
							details: {
								assets: [],
								entries: r.entries,
							},
						}));
					} else {
						// Catch up every asset from its acquisition year through the
						// target academic year. Idempotent via per-year references.
						const catchUpResults = await processDepreciationCatchUpToAcademicYear(
							tx,
							targetAcademicYear.id,
							{ force, capDate },
						);
						results = catchUpResults.map((r) => ({
							success: true,
							academicYearId: r.academicYearId,
							assetsProcessed: r.assetsProcessed,
							totalDepreciation: r.totalDepreciation,
							message: `Depreciation processed`,
							details: {
								assets: [],
								entries: r.entries,
							},
						}));
					}
				});

				// Aggregate results across all processed years
				const processedResults = results.filter(
					(r) => r.assetsProcessed > 0 || r.totalDepreciation > 0 || force,
				);
				const totalAssetsProcessed = processedResults.reduce(
					(sum, r) => sum + r.assetsProcessed,
					0,
				);
				const totalDepreciation = processedResults.reduce(
					(sum, r) => sum + r.totalDepreciation,
					0,
				);

				const responseResult: DepreciationApiResponse = {
					success: true,
					academicYearId: targetAcademicYear.id,
					year,
					assetsProcessed: totalAssetsProcessed,
					totalDepreciation,
					message:
						totalAssetsProcessed > 0
							? `Depreciation processed for ${totalAssetsProcessed} asset(s) across ${processedResults.length} year(s)`
							: (results[results.length - 1]?.message ??
								"No depreciation to process"),
					details: {
						assets: processedResults.flatMap(
							(r) => r.details?.assets || [],
						),
						entries: processedResults.flatMap(
							(r) => r.details?.entries || [],
						),
					},
				};

				return success(responseResult, { message: responseResult.message });
			} catch (error) {
				console.error("Depreciation API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
