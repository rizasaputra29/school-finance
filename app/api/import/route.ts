import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	rateLimit,
	RATE_LIMITS,
	getClientIp,
	formatRateLimitError,
} from "@/lib/api/api-rate-limit";
import {
	validateDataset,
	SHEET_CONFIGS,
	processInBatches,
	findDuplicateCashflow,
	buildErrorResponse,
	BatchProgress,
	ValidatedRow,
	ImportResult,
} from "@/lib/import/import-validator";
import { success, errors } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";
import { parseExcelDate } from "@/lib/utils/utils-date";

// ============================================
// Type Definitions
// ============================================

interface CashflowRow {
	Tanggal?: string | number;
	Keterangan?: string;
	"Kode Akun"?: string;
	Debit?: number;
	Kredit?: number;
}

interface StudentRow {
	NIS?: string;
	Nama?: string;
	Kelas?: string;
	"Tahun Masuk"?: number;
	"Status Bayar"?: string;
	"Total Tagihan"?: number;
	"Total Bayar"?: number;
}

interface AccountRow {
	"Kode Akun"?: string;
	"Nama Akun"?: string;
	"Tipe Akun"?: string;
	Saldo?: number;
}

// ============================================
// Pure Helper Functions
// ============================================

function createImportResult(): ImportResult {
	return {
		inserted: 0,
		updated: 0,
		skipped: 0,
		errors: 0,
		details: [],
	};
}

function parseCashflowDate(value: string | number | undefined): Date | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "number") return parseExcelDate(value);
	const date = new Date(value);
	return isNaN(date.getTime()) ? null : date;
}

// ============================================
// Batch Processors
// ============================================

async function processAccountBatch(
	rows: ValidatedRow[],
): Promise<
	{ row: number; success: boolean; error?: string; updated?: boolean }[]
> {
	const results: {
		row: number;
		success: boolean;
		error?: string;
		updated?: boolean;
	}[] = [];

	for (const validatedRow of rows) {
		const rowNum = validatedRow.row;
		const data = validatedRow.data;

		try {
			const kodeAkun = String(data.kodeAkun || "");

			if (!kodeAkun) {
				results.push({
					row: rowNum,
					success: false,
					error: "Kode Akun wajib diisi",
				});
				continue;
			}

			const existingAccount = await prisma.account.findUnique({
				where: { kodeAkun },
			});

			if (existingAccount) {
				await prisma.account.update({
					where: { kodeAkun },
					data: {
						namaAkun: String(data.namaAkun || ""),
						tipeAkun: String(data.tipeAkun || "Other"),
						saldo: Number(data.saldo) || 0,
					},
				});
				results.push({ row: rowNum, success: true, updated: true });
			} else {
				await prisma.account.create({
					data: {
						kodeAkun,
						namaAkun: String(data.namaAkun || ""),
						tipeAkun: String(data.tipeAkun || "Other"),
						saldo: Number(data.saldo) || 0,
					},
				});
				results.push({ row: rowNum, success: true, updated: false });
			}
		} catch (error) {
			results.push({
				row: rowNum,
				success: false,
				error: `Gagal import: ${(error as Error).message}`,
			});
		}
	}

	return results;
}

async function processStudentBatch(
	rows: ValidatedRow[],
): Promise<
	{ row: number; success: boolean; error?: string; updated?: boolean }[]
> {
	const results: {
		row: number;
		success: boolean;
		error?: string;
		updated?: boolean;
	}[] = [];

	for (const validatedRow of rows) {
		const rowNum = validatedRow.row;
		const data = validatedRow.data;

		try {
			const nis = String(data.nis || "");

			if (!nis) {
				results.push({ row: rowNum, success: false, error: "NIS wajib diisi" });
				continue;
			}

			const existingStudent = await prisma.student.findUnique({
				where: { nis },
			});

			if (existingStudent) {
				await prisma.student.update({
					where: { nis },
					data: {
						nama: String(data.nama || ""),
						kelas: String(data.kelas || ""),
						tahunMasuk: Number(data.tahunMasuk) || new Date().getFullYear(),
						statusBayar: String(data.statusBayar || "Belum Lunas"),
						totalTagihan: Number(data.totalTagihan) || 0,
						totalBayar: Number(data.totalBayar) || 0,
					},
				});
				results.push({ row: rowNum, success: true, updated: true });
			} else {
				await prisma.student.create({
					data: {
						nis,
						nama: String(data.nama || ""),
						kelas: String(data.kelas || ""),
						tahunMasuk: Number(data.tahunMasuk) || new Date().getFullYear(),
						statusBayar: String(data.statusBayar || "Belum Lunas"),
						totalTagihan: Number(data.totalTagihan) || 0,
						totalBayar: Number(data.totalBayar) || 0,
						status: "Active",
					},
				});
				results.push({ row: rowNum, success: true, updated: false });
			}
		} catch (error) {
			results.push({
				row: rowNum,
				success: false,
				error: `Gagal import: ${(error as Error).message}`,
			});
		}
	}

	return results;
}

async function processCashflowBatch(
	rows: ValidatedRow[],
	importTotals: { debit: number; kredit: number; count: number },
): Promise<
	{ row: number; success: boolean; error?: string; skipped?: boolean }[]
> {
	const results: {
		row: number;
		success: boolean;
		error?: string;
		skipped?: boolean;
	}[] = [];

	for (const validatedRow of rows) {
		const rowNum = validatedRow.row;
		const data = validatedRow.data;

		try {
			const tanggal = parseCashflowDate(
				data.tanggal as string | number | undefined,
			);
			if (!tanggal) {
				results.push({
					row: rowNum,
					success: false,
					error: "Tanggal tidak valid",
				});
				continue;
			}

			const kodeAkun = String(data.kodeAkun || "");
			if (!kodeAkun) {
				results.push({
					row: rowNum,
					success: false,
					error: "Kode Akun wajib diisi",
				});
				continue;
			}

			const debit = Number(data.debit) || 0;
			const kredit = Number(data.kredit) || 0;
			const keterangan = String(data.keterangan || "");

			// Track import totals
			importTotals.debit += debit;
			importTotals.kredit += kredit;
			importTotals.count++;

			// Check for duplicate
			const duplicateId = await findDuplicateCashflow(prisma, {
				tanggal,
				kodeAkun,
				debit,
				kredit,
				keterangan,
			});

			if (duplicateId) {
				results.push({ row: rowNum, success: false, skipped: true });
				continue;
			}

			// Update account balance
			const account = await prisma.account.findUnique({ where: { kodeAkun } });

			if (account) {
				let balanceChange = 0;

				if (account.tipeAkun === "Asset") {
					balanceChange = debit - kredit;
				} else if (
					account.tipeAkun === "Liability" ||
					account.tipeAkun === "Equity"
				) {
					balanceChange = kredit - debit;
				} else if (account.tipeAkun === "Revenue") {
					balanceChange = debit;
				} else if (account.tipeAkun === "Expense") {
					balanceChange = kredit;
				}

				await prisma.account.update({
					where: { kodeAkun },
					data: { saldo: { increment: balanceChange } },
				});
			}

			await prisma.cashflow.create({
				data: {
					tanggal,
					kodeAkun,
					debit,
					kredit,
					keterangan,
				},
			});

			results.push({ row: rowNum, success: true });
		} catch (error) {
			results.push({
				row: rowNum,
				success: false,
				error: `Gagal import: ${(error as Error).message}`,
			});
		}
	}

	return results;
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			// Rate Limiting for Import
			const ip = getClientIp(request);
			const identifier = `import:${ip}`;
			const rateLimitResult = rateLimit(identifier, RATE_LIMITS.import);

			if (!rateLimitResult.success) {
				return errors.rateLimit(formatRateLimitError(rateLimitResult));
			}

			try {
				const body = await request.json();
				const { fileData, sheets, type = "excel" } = body;

				if (!fileData) {
					return errors.validation([
						{ field: "fileData", message: "File data tidak ditemukan" },
					]);
				}

				// Track validation errors
				const validationErrors: Array<{
					row: number;
					sheet: string;
					error: string;
				}> = [];

				// Results tracking
				const results = {
					accounts: createImportResult(),
					students: createImportResult(),
					cashflow: createImportResult(),
					billings: createImportResult(),
				};

				// Track totals for sync validation
				const importTotals = {
					cashflow: { debit: 0, kredit: 0, count: 0 },
				};

				// Progress callback for batch processing
				const reportProgress = (sheetName: string, progress: BatchProgress) => {
					console.log(
						`[${sheetName}] Progress: ${progress.percentage}% (${progress.processed}/${progress.total})`,
					);
				};

				if (type === "json") {
					const jsonStr = Buffer.from(fileData, "base64").toString("utf-8");
					const jsonData = JSON.parse(jsonStr);
					const data = jsonData.data || jsonData;

					// Process Accounts
					if (data.accounts && Array.isArray(data.accounts)) {
						const validation = validateDataset(
							data.accounts,
							SHEET_CONFIGS.accounts,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							processAccountBatch,
							(progress) => reportProgress("Akun", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								if (result.updated) results.accounts.updated++;
								else results.accounts.inserted++;
							} else {
								results.accounts.errors++;
								if (result.error) {
									results.accounts.details.push({
										row: result.row,
										error: result.error,
									});
								}
							}
						}
					}

					// Process Students
					if (data.students && Array.isArray(data.students)) {
						const validation = validateDataset(
							data.students,
							SHEET_CONFIGS.students,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							processStudentBatch,
							(progress) => reportProgress("Data Siswa", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								if (result.updated) results.students.updated++;
								else results.students.inserted++;
							} else {
								results.students.errors++;
								if (result.error) {
									results.students.details.push({
										row: result.row,
										error: result.error,
									});
								}
							}
						}
					}

					// Process Cashflow
					if (data.cashflow && Array.isArray(data.cashflow)) {
						const validation = validateDataset(
							data.cashflow,
							SHEET_CONFIGS.cashflow,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							(batch) => processCashflowBatch(batch, importTotals.cashflow),
							(progress) => reportProgress("Cashflow", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								results.cashflow.inserted++;
							} else if (result.skipped) {
								results.cashflow.skipped++;
							} else {
								results.cashflow.errors++;
							}
						}
					}

					// Process Billings
					if (data.billings && Array.isArray(data.billings)) {
						const validation = validateDataset(
							data.billings,
							SHEET_CONFIGS.billings,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						for (const validatedRow of validation.validatedData) {
							try {
								const nis = String(validatedRow.data.nis || "");
								const student = await prisma.student.findUnique({
									where: { nis },
								});

								if (!student) {
									results.billings.errors++;
									results.billings.details.push({
										row: validatedRow.row,
										error: `Siswa dengan NIS ${nis} tidak ditemukan`,
									});
									continue;
								}

								await prisma.billing.create({
									data: {
										studentId: student.id,
										jenisBiaya: String(validatedRow.data.jenisBiaya || ""),
										jumlah: Number(validatedRow.data.jumlah) || 0,
										periodeBulan: String(validatedRow.data.periodeBulan || ""),
										statusBayar: String(
											validatedRow.data.statusBayar || "Belum Lunas",
										),
										tanggalBayar: validatedRow.data.tanggalBayar
											? new Date(validatedRow.data.tanggalBayar as string)
											: null,
									},
								});

								// Update Piutang if Belum Lunas
								if (validatedRow.data.statusBayar === "Belum Lunas") {
									const piutangAccount = await prisma.account.findUnique({
										where: { kodeAkun: "103" },
									});

									if (piutangAccount) {
										await prisma.account.update({
											where: { kodeAkun: "103" },
											data: {
												saldo: {
													increment: Number(validatedRow.data.jumlah) || 0,
												},
											},
										});
									}
								}

								results.billings.inserted++;
							} catch (error) {
								results.billings.errors++;
								results.billings.details.push({
									row: validatedRow.row,
									error: `Gagal import: ${(error as Error).message}`,
								});
							}
						}
					}
				} else {
					// Parse the Excel file from base64
					const buffer = Buffer.from(fileData, "base64");
					const workbook = XLSX.read(buffer, { type: "buffer" });

					// Process Cashflow sheet
					if (
						(!sheets || sheets.includes("Cashflow")) &&
						workbook.SheetNames.includes("Cashflow")
					) {
						const sheet = workbook.Sheets["Cashflow"];
						const rawData = XLSX.utils.sheet_to_json<CashflowRow>(sheet);
						const data = rawData.map((row, i) => ({ ...row, _rowNum: i + 2 }));

						const validation = validateDataset(
							data as unknown as Record<string, unknown>[],
							SHEET_CONFIGS.cashflow,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							(batch) => processCashflowBatch(batch, importTotals.cashflow),
							(progress) => reportProgress("Cashflow", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								results.cashflow.inserted++;
							} else if (result.skipped) {
								results.cashflow.skipped++;
							} else {
								results.cashflow.errors++;
							}
						}
					}

					// Process Data Siswa sheet
					if (
						(!sheets || sheets.includes("Data Siswa")) &&
						workbook.SheetNames.includes("Data Siswa")
					) {
						const sheet = workbook.Sheets["Data Siswa"];
						const rawData = XLSX.utils.sheet_to_json<StudentRow>(sheet);
						const data = rawData.map((row, i) => ({ ...row, _rowNum: i + 2 }));

						const validation = validateDataset(
							data as unknown as Record<string, unknown>[],
							SHEET_CONFIGS.students,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							processStudentBatch,
							(progress) => reportProgress("Data Siswa", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								if (result.updated) results.students.updated++;
								else results.students.inserted++;
							} else {
								results.students.errors++;
								if (result.error) {
									results.students.details.push({
										row: result.row,
										error: result.error,
									});
								}
							}
						}
					}

					// Process Akun sheet
					if (
						(!sheets || sheets.includes("Akun")) &&
						workbook.SheetNames.includes("Akun")
					) {
						const sheet = workbook.Sheets["Akun"];
						const rawData = XLSX.utils.sheet_to_json<AccountRow>(sheet);
						const data = rawData.map((row, i) => ({ ...row, _rowNum: i + 2 }));

						const validation = validateDataset(
							data as unknown as Record<string, unknown>[],
							SHEET_CONFIGS.accounts,
						);
						validationErrors.push(...buildErrorResponse(validation.errors));

						const batchResults = await processInBatches(
							validation.validatedData,
							100,
							processAccountBatch,
							(progress) => reportProgress("Akun", progress),
						);

						for (const result of batchResults) {
							if (result.success) {
								if (result.updated) results.accounts.updated++;
								else results.accounts.inserted++;
							} else {
								results.accounts.errors++;
								if (result.error) {
									results.accounts.details.push({
										row: result.row,
										error: result.error,
									});
								}
							}
						}
					}
				}

				// Build sync validation info
				const syncValidation = {
					cashflow: {
						totalImported: results.cashflow.inserted,
						totalSkipped: results.cashflow.skipped,
						totalErrors: results.cashflow.errors,
						importTotals: importTotals.cashflow,
						isValid: results.cashflow.errors === 0,
					},
					accounts: {
						totalInserted: results.accounts.inserted,
						totalUpdated: results.accounts.updated,
						totalErrors: results.accounts.errors,
						isValid: results.accounts.errors === 0,
					},
					students: {
						totalInserted: results.students.inserted,
						totalUpdated: results.students.updated,
						totalErrors: results.students.errors,
						isValid: results.students.errors === 0,
					},
				};

				// Build warning message if duplicates were skipped
				const warnings: string[] = [];
				if (results.cashflow.skipped > 0) {
					warnings.push(
						`${results.cashflow.skipped} transaksi duplikat dilewati untuk menghindari duplikasi data`,
					);
				}
				if (results.cashflow.errors > 0) {
					warnings.push(
						`${results.cashflow.errors} transaksi gagal diimport karena error`,
					);
				}
				if (results.accounts.updated > 0) {
					warnings.push(
						`${results.accounts.updated} akun diperbarui (kode akun sudah ada)`,
					);
				}
				if (results.students.updated > 0) {
					warnings.push(
						`${results.students.updated} siswa diperbarui (NIS sudah ada)`,
					);
				}

				// Build summary for user
				const summary = {
					totalAccounts: results.accounts.inserted + results.accounts.updated,
					totalStudents: results.students.inserted + results.students.updated,
					totalCashflow: results.cashflow.inserted,
					accountsInserted: results.accounts.inserted,
					accountsUpdated: results.accounts.updated,
					accountsErrors: results.accounts.errors,
					studentsInserted: results.students.inserted,
					studentsUpdated: results.students.updated,
					studentsErrors: results.students.errors,
				};

				// Build response with required format
				const response = {
					results: {
						accounts: {
							inserted: results.accounts.inserted,
							updated: results.accounts.updated,
							errors: results.accounts.errors,
						},
						students: {
							inserted: results.students.inserted,
							updated: results.students.updated,
							errors: results.students.errors,
						},
						cashflow: {
							inserted: results.cashflow.inserted,
							skipped: results.cashflow.skipped,
							errors: results.cashflow.errors,
						},
						billings: {
							inserted: results.billings.inserted,
							errors: results.billings.errors,
						},
					},
					errors: validationErrors,
					summary,
					syncValidation,
					warnings: warnings.length > 0 ? warnings : undefined,
				};

				const message =
					warnings.length > 0
						? "Import selesai dengan peringatan"
						: "Import berhasil";
				return success(response, { message });
			} catch (error) {
				console.error("Import error:", error);
				return handlePrismaErrorResponse(error);
			}
		},
		{ requireAdmin: true },
	);
}
