/**
 * Depreciation Repair API
 *
 * One-time/admin repair endpoint that rebuilds depreciation journal entries
 * from scratch for active depreciable assets. This is useful when legacy
 * prorated entries or stale asset counters cause a mismatch between:
 *  - asset-derived accumulated depreciation, and
 *  - the Beban Penyusutan (600) / fixed-asset (107-110) balances in the COA.
 *
 * The repair:
 *  1. Deletes all existing depreciation journal entries for the affected assets
 *     (including the shared opening-depreciation entry).
 *  2. Resets asset counters: alreadyDepreciatedAmount, alreadyDepreciatedYears,
 *     and sisaUmurTeknis.
 *  3. Re-runs anniversary-based full-year depreciation catch-up through the
 *     target academic year, posting Debit 600 / Credit Akumulasi Penyusutan (111).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import {
	deleteDepreciationEntryByReference,
	processDepreciationForAssetRange,
} from "@/lib/accounting/accounting-depreciation-service";

const repairSchema = z.object({
	academicYearId: z.string().optional(),
	assetId: z.string().optional(),
});

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			try {
				const body = await request.json();
				const validationResult = repairSchema.safeParse(body);
				if (!validationResult.success) {
					return errors.validation(
						validationResult.error.errors.map((err) => ({
							field: err.path.join("."),
							message: err.message,
						})),
					);
				}

				const { academicYearId, assetId } = validationResult.data;

				const targetYear = academicYearId
					? await prisma.academicYear.findUnique({
							where: { id: academicYearId },
					  })
					: await prisma.academicYear.findFirst({
							where: { isActive: true },
							orderBy: { tanggalMulai: "desc" },
					  });

				if (!targetYear) {
					return errors.badRequest("Tidak ada tahun ajaran target");
				}

				const result = await prisma.$transaction(async (tx) => {
					const assets = await tx.asset.findMany({
						where: {
							status: "Active",
							isTanah: false,
							...(assetId ? { id: assetId } : {}),
						},
					});

					// Remove the shared opening-depreciation entry; it will be rebuilt
					// correctly by the range processor if still needed.
					await deleteDepreciationEntryByReference(tx, "opening-depreciation");

					let totalEntriesCreated = 0;
					let totalDepreciation = 0;

					for (const asset of assets) {
						// Find and delete every per-asset depreciation journal entry,
						// including legacy references.
						const perAssetEntries = await tx.journalEntry.findMany({
							where: {
								OR: [
									{
										reference: {
											startsWith: `depreciation-${asset.id}-`,
										},
									},
									{ reference: `depreciation-${asset.id}` },
								],
							},
						});

						for (const entry of perAssetEntries) {
							if (!entry.reference) continue;
							await deleteDepreciationEntryByReference(tx, entry.reference);
						}

						// Reset counters so the range processor starts from year 0.
						await tx.asset.update({
							where: { id: asset.id },
							data: {
								alreadyDepreciatedAmount: 0,
								alreadyDepreciatedYears: 0,
								sisaUmurTeknis: asset.umurTeknis,
							},
						});

						// Re-post depreciation from acquisition year up to target year.
						const rangeResults = await processDepreciationForAssetRange(
							tx,
							asset.id,
							targetYear.id,
							{ useYearEnd: true },
						);

						totalEntriesCreated += rangeResults.reduce(
							(sum, r) => sum + r.assetsProcessed,
							0,
						);
						totalDepreciation += rangeResults.reduce(
							(sum, r) => sum + r.totalDepreciation,
							0,
						);
					}

					return {
						assetsRepaired: assets.length,
						targetAcademicYearId: targetYear.id,
						targetTahunAjaran: targetYear.tahunAjaran,
						entriesCreated: totalEntriesCreated,
						totalDepreciation,
					};
				});

				return success(result, {
					message: `Penyusutan berhasil diperbaiki untuk ${result.assetsRepaired} aset (total ${result.totalDepreciation.toLocaleString("id-ID")}).`,
				});
			} catch (error) {
				console.error("Depreciation repair API error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
