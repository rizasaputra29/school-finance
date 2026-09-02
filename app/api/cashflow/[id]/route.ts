import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	getIdempotencyResult,
	setIdempotencyResult,
	isValidIdempotencyKey,
} from "@/lib/utils/utils-idempotency";
import { success, errors, noContent, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import { computeSaldoChange } from "@/lib/accounting/accounting-chart-of-accounts";
import { syncAccountBalance } from "@/lib/accounting/accounting-balance";

/**
 * Helper to convert PrismaErrorResult to NextResponse
 */
function prismaErrorToResponse(err: unknown) {
	const prismaError = handlePrismaError(err);
	return error(prismaError.message, prismaError.code, {
		status: prismaError.status,
	});
}

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
	const header = req.headers.get("x-idempotency-key");
	if (!header) return null;
	return header;
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([{ field: "id", message: "ID tidak valid" }]);
		}

		// Check for idempotency key in headers
		const idempotencyKey = getIdempotencyKeyFromNextRequest(request);

		// Check for idempotency - return cached result if same request
		if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
			const cachedResult = getIdempotencyResult(idempotencyKey);
			if (cachedResult !== null) {
				return success(cachedResult, {
					message: "Data berhasil diambil dari cache",
				});
			}
		}

		const body = await request.json();
		const {
			tanggal,
			keterangan,
			kodeAkun,
			kategori,
			debit,
			kredit,
			status,
			entries,
		} = body;

		// Handle status update (approve/reject)
		if (status) {
			const validStatuses = ["draft", "approved", "posted", "rejected"];
			if (!validStatuses.includes(status)) {
				return errors.validation([
					{
						field: "status",
						message: `Status tidak valid. Status yang diperbolehkan: ${validStatuses.join(", ")}`,
					},
				]);
			}

			try {
				const result = await prisma.$transaction(async (tx) => {
					// Get existing cashflow
					const oldCashflow = await tx.cashflow.findUnique({
						where: { id },
					});

					if (!oldCashflow) {
						throw new Error("Transaksi tidak ditemukan");
					}

					// Find all related cashflows in the same group
					const groupCashflows = oldCashflow.referenceId
						? await tx.cashflow.findMany({
								where: { referenceId: oldCashflow.referenceId },
							})
						: [oldCashflow];

					// If changing to 'posted' or 'approved', update account balances
					if (
						(status === "posted" || status === "approved") &&
						oldCashflow.status === "draft"
					) {
						for (const cf of groupCashflows) {
							const account = await tx.account.findUnique({
								where: { kodeAkun: cf.kodeAkun },
							});

						if (account) {
							const saldoChange = computeSaldoChange(
								account,
								cf.debit,
								cf.kredit,
							);

							await tx.account.update({
								where: { kodeAkun: cf.kodeAkun },
								data: { saldo: { increment: saldoChange } },
							});
							await syncAccountBalance(
								tx,
								cf.kodeAkun,
								saldoChange,
								cf.tanggal,
							);
						}
						}
					}

					// Update cashflow status for all in group
					const groupIds = groupCashflows.map((cf) => cf.id);
					await tx.cashflow.updateMany({
						where: { id: { in: groupIds } },
						data: { status },
					});

					return groupCashflows;
				});

				if (idempotencyKey) {
					setIdempotencyResult(idempotencyKey, result);
				}

				return success(result, {
					message: `Status transaksi berhasil diubah menjadi ${status}`,
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (message.includes("tidak ditemukan")) {
					return errors.notFound("Transaksi");
				}
				return prismaErrorToResponse(error);
			}
		}

		// Handle grouped edit (entries array)
		if (entries && Array.isArray(entries) && entries.length > 0) {
			try {
				const result = await prisma.$transaction(async (tx) => {
					// 1. Get existing cashflow and its group
					const oldCashflow = await tx.cashflow.findUnique({
						where: { id },
					});

					if (!oldCashflow) {
						throw new Error("Transaksi tidak ditemukan");
					}

					const groupCashflows = oldCashflow.referenceId
						? await tx.cashflow.findMany({
								where: { referenceId: oldCashflow.referenceId },
							})
						: [oldCashflow];

					// 2. Reverse old balances for all entries in the group
					for (const cf of groupCashflows) {
						const account = await tx.account.findUnique({
							where: { kodeAkun: cf.kodeAkun },
						});

						if (account) {
							const reverseChange = computeSaldoChange(
								account,
								cf.kredit,
								cf.debit,
							);

							await tx.account.update({
								where: { kodeAkun: cf.kodeAkun },
								data: { saldo: { increment: reverseChange } },
							});
							await syncAccountBalance(
								tx,
								cf.kodeAkun,
								reverseChange,
								cf.tanggal,
							);
						}
					}

					// 3. Validate new entries balance
					const totalDebit = entries.reduce(
						(sum: number, e: { debit: number }) => sum + e.debit,
						0,
					);
					const totalKredit = entries.reduce(
						(sum: number, e: { kredit: number }) => sum + e.kredit,
						0,
					);

					if (Math.abs(totalDebit - totalKredit) > 0.01) {
						throw new Error(
							`Jurnal tidak seimbang: total debit ${totalDebit} ≠ total kredit ${totalKredit}`,
						);
					}

					// 4. Delete old cashflow records in the group
					const oldGroupIds = groupCashflows.map((cf) => cf.id);
					await tx.cashflow.deleteMany({
						where: { id: { in: oldGroupIds } },
					});

					// 5. Create new cashflow records with updated data
					const groupReferenceId =
						oldCashflow.referenceId || oldCashflow.id;
					const newCashflows = [];
					for (const entry of entries) {
						const isBankAccount =
							entry.kodeAkun.startsWith("111") ||
							entry.kodeAkun === "102";
						const source = isBankAccount ? "bank" : "kas";

						const cashflow = await tx.cashflow.create({
							data: {
								tanggal: tanggal ? new Date(tanggal) : oldCashflow.tanggal,
								keterangan: keterangan || oldCashflow.keterangan,
								kodeAkun: entry.kodeAkun,
								kategori: kategori || oldCashflow.kategori,
								debit: entry.debit,
								kredit: entry.kredit,
								source,
								status: oldCashflow.status,
								referenceId: groupReferenceId,
							} as never,
						});
						newCashflows.push(cashflow);
					}

					// 6. Apply new balances for all entries
					const newTanggal = tanggal ? new Date(tanggal) : oldCashflow.tanggal;
					for (const entry of entries) {
						const account = await tx.account.findUnique({
							where: { kodeAkun: entry.kodeAkun },
						});

						if (account) {
							const saldoChange = computeSaldoChange(
								account,
								entry.debit,
								entry.kredit,
							);

							await tx.account.update({
								where: { kodeAkun: entry.kodeAkun },
								data: { saldo: { increment: saldoChange } },
							});
							await syncAccountBalance(
								tx,
								entry.kodeAkun,
								saldoChange,
								newTanggal,
							);
						}
					}

					// 7. Update linked JournalEntry if exists
					if (oldCashflow.referenceId) {
						const journalEntry = await tx.journalEntry.findUnique({
							where: { id: oldCashflow.referenceId },
						});
						if (journalEntry) {
							await tx.journalEntryLine.deleteMany({
								where: { journalEntryId: journalEntry.id },
							});
							await tx.journalEntryLine.createMany({
								data: entries.map(
									(entry: {
										kodeAkun: string;
										debit: number;
										kredit: number;
									}) => ({
										journalEntryId: journalEntry.id,
										kodeAkun: entry.kodeAkun,
										debit: entry.debit,
										kredit: entry.kredit,
									}),
								),
							});
							await tx.journalEntry.update({
								where: { id: journalEntry.id },
								data: {
									tanggal: tanggal
										? new Date(tanggal)
										: journalEntry.tanggal,
									keterangan: keterangan || journalEntry.keterangan,
								},
							});
						}
					}

					return newCashflows;
				});

				// Cache result for idempotency
				if (idempotencyKey) {
					setIdempotencyResult(idempotencyKey, result);
				}

				return success(result, {
					message: "Transaksi berhasil diperbarui",
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (message.includes("tidak ditemukan")) {
					if (message.includes("Akun baru")) {
						return errors.notFound("Akun");
					}
					return errors.notFound("Transaksi");
				}
				if (message.includes("Jurnal tidak seimbang")) {
					return errors.validation([
						{ field: "entries", message },
					]);
				}
				return prismaErrorToResponse(error);
			}
		}

		// Single entry edit (legacy)
		const newDebit = parseFloat(debit) || 0;
		const newKredit = parseFloat(kredit) || 0;

		try {
			const result = await prisma.$transaction(async (tx) => {
				// 1. Get existing cashflow
				const oldCashflow = await tx.cashflow.findUnique({
					where: { id },
				});

				if (!oldCashflow) {
					throw new Error("Transaksi tidak ditemukan");
				}

				// 2. Reverse effect on OLD Account
				const oldAccount = await tx.account.findUnique({
					where: { kodeAkun: oldCashflow.kodeAkun },
				});

				if (oldAccount) {
					const reverseChange = computeSaldoChange(
						oldAccount,
						oldCashflow.kredit,
						oldCashflow.debit,
					);

					await tx.account.update({
						where: { kodeAkun: oldCashflow.kodeAkun },
						data: { saldo: { increment: reverseChange } },
					});
				}

				// 3. Apply effect on NEW Account
				const newAccount = await tx.account.findUnique({
					where: { kodeAkun },
				});

				if (!newAccount) {
					throw new Error(`Akun baru dengan kode ${kodeAkun} tidak ditemukan`);
				}

			const newChange = computeSaldoChange(newAccount, newDebit, newKredit);

			await tx.account.update({
				where: { kodeAkun },
				data: { saldo: { increment: newChange } },
			});

				// 4. Update Cashflow
				const updatedCashflow = await tx.cashflow.update({
					where: { id },
					data: {
						tanggal: new Date(tanggal),
						keterangan,
						kodeAkun,
						kategori: kategori || null,
						debit: newDebit,
						kredit: newKredit,
					},
				});

				return updatedCashflow;
			});

			// Cache result for idempotency
			if (idempotencyKey) {
				setIdempotencyResult(idempotencyKey, result);
			}

			return success(result, { message: "Transaksi berhasil diperbarui" });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("tidak ditemukan")) {
				if (message.includes("Akun baru")) {
					return errors.notFound("Akun");
				}
				return errors.notFound("Transaksi");
			}
			return prismaErrorToResponse(error);
		}
	});
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([{ field: "id", message: "ID tidak valid" }]);
		}

		// Check for idempotency
		const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
		if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
			const cachedResult = getIdempotencyResult(idempotencyKey);
			if (cachedResult !== null) {
				return noContent();
			}
		}

		try {
			await prisma.$transaction(async (tx) => {
				// 1. Get existing cashflow
				const cashflow = await tx.cashflow.findUnique({
					where: { id },
				});

				if (!cashflow) {
					throw new Error("Transaksi tidak ditemukan");
				}

				// 2. Find all related cashflows in the same group (by referenceId)
				const groupCashflows = cashflow.referenceId
					? await tx.cashflow.findMany({
							where: { referenceId: cashflow.referenceId },
						})
					: [cashflow];

				// 3. Reverse effect on Account for each cashflow in the group
				for (const cf of groupCashflows) {
					const account = await tx.account.findUnique({
						where: { kodeAkun: cf.kodeAkun },
					});

					if (account) {
						const reverseChange = computeSaldoChange(
							account,
							cf.kredit,
							cf.debit,
						);

						await tx.account.update({
							where: { kodeAkun: cf.kodeAkun },
							data: { saldo: { increment: reverseChange } },
						});
					}
				}

				// 4. Delete all cashflows in the group
				const groupIds = groupCashflows.map((cf) => cf.id);
				await tx.cashflow.deleteMany({
					where: { id: { in: groupIds } },
				});

				// 5. Delete linked JournalEntry if referenceId matches a journal entry
				if (cashflow.referenceId) {
					const journalEntry = await tx.journalEntry.findUnique({
						where: { id: cashflow.referenceId },
					});
					if (journalEntry) {
						await tx.journalEntryLine.deleteMany({
							where: { journalEntryId: journalEntry.id },
						});
						await tx.journalEntry.delete({
							where: { id: journalEntry.id },
						});
					}
				}
			});

			// Cache result for idempotency
			if (idempotencyKey) {
				setIdempotencyResult(idempotencyKey, { deleted: true, id });
			}

			return noContent();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("tidak ditemukan")) {
				return errors.notFound("Transaksi");
			}
			return prismaErrorToResponse(error);
		}
	});
}
