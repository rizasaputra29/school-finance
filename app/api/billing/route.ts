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
import { validateBody } from "@/lib/api/api-validation";
import {
	getIdempotencyResult,
	setIdempotencyResult,
	isValidIdempotencyKey,
} from "@/lib/utils/utils-idempotency";
import { success, errors, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";
import {
	generateCicilanBillings,
	getRevenueAccountCode,
	PIUTANG_SISWA_ACCOUNT_CODE,
} from "@/lib/services/billing";
import { postToJournal } from "@/lib/services/journal";
import { autoCreatePiutangFromOverdueBillings } from "@/lib/services/piutang";

const MONTH_NAMES = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const createBillingSchema = z.object({
	studentId: z.string().min(1, "Siswa wajib dipilih"),
	jenisBiaya: z.string().min(1, "Jenis biaya wajib diisi"),
	jumlah: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseFloat(val) : val))
		.refine((val) => val > 0, "Jumlah harus lebih dari 0"),
	catatan: z.string().optional(),
	isCicilan: z.boolean().default(false),
	tenor: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseInt(val) : val))
		.optional(),
	academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
	tanggalJatuhTempo: z.string().optional(),
	keterangan: z.string().optional(),
});

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
	const header = req.headers.get("x-idempotency-key");
	if (!header) return null;
	return header;
}

function isBillingOverdue(billing: {
	tanggalJatuhTempo: Date | null;
	statusBayar: string;
}): boolean {
	if (billing.statusBayar === "Lunas") return false;
	if (!billing.tanggalJatuhTempo) return false;
	return new Date() > new Date(billing.tanggalJatuhTempo);
}

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		// Auto-create piutang for overdue billings (fire-and-forget)
		autoCreatePiutangFromOverdueBillings().catch(console.error);

		const { searchParams } = new URL(request.url);
		const page = searchParams.get("page") || "1";
		const limit = searchParams.get("limit") || "10";
		const studentId = searchParams.get("studentId");
		const statusBayar = searchParams.get("statusBayar");
		const jenisBiaya = searchParams.get("jenisBiaya");
		const search = searchParams.get("search");
		const overdue = searchParams.get("overdue");
		const academicYearId = searchParams.get("academicYearId");

		const skip = (parseInt(page) - 1) * parseInt(limit);
		const take = parseInt(limit);

		const where: Record<string, unknown> = {};

		if (studentId) where.studentId = studentId;
		if (statusBayar) where.statusBayar = statusBayar;
		if (jenisBiaya) where.jenisBiaya = jenisBiaya;
		if (academicYearId) where.academicYearId = academicYearId;

		if (search) {
			where.OR = [
				{ student: { nama: { contains: search, mode: "insensitive" } } },
				{ student: { nis: { contains: search, mode: "insensitive" } } },
				{ jenisBiaya: { contains: search, mode: "insensitive" } },
			];
		}

		if (overdue === "true") {
			where.statusBayar = "Belum Lunas";
		}

		try {
			const include: Record<string, unknown> = {
				student: {
					select: {
						id: true,
						nis: true,
						nama: true,
						kelas: true,
					},
				},
			};

			const [billings, total, aggregates, statusCounts] = await Promise.all([
				prisma.billing.findMany({
					where,
					include,
					orderBy: [{ tanggalJatuhTempo: "asc" }],
					skip,
					take,
				}),
				prisma.billing.count({ where }),
				prisma.billing.aggregate({
					where,
					_sum: { jumlah: true },
				}),
				prisma.billing.groupBy({
					by: ["statusBayar"],
					where,
					_sum: { jumlah: true },
					_count: { _all: true },
				}),
			]);

			const totalTagihan = aggregates._sum.jumlah || 0;
			let totalBelumLunas = 0;
			let totalLunas = 0;
			let countBelumLunas = 0;
			let countLunas = 0;

			for (const group of statusCounts) {
				if (group.statusBayar === "Belum Lunas") {
					totalBelumLunas = group._sum.jumlah || 0;
					countBelumLunas = group._count._all;
				} else if (group.statusBayar === "Lunas") {
					totalLunas = group._sum.jumlah || 0;
					countLunas = group._count._all;
				}
			}

			const unpaidWhere: Record<string, unknown> = { statusBayar: "Belum Lunas" };
			if (academicYearId) unpaidWhere.academicYearId = academicYearId;
			const allUnpaidBillings = await prisma.billing.findMany({
				where: unpaidWhere,
				select: { tanggalJatuhTempo: true, statusBayar: true },
			});
			const countOverdue = allUnpaidBillings.filter((b) =>
				isBillingOverdue(b),
			).length;

			return success(billings, {
				message: "Billings retrieved successfully",
				meta: {
					pagination: {
						page: parseInt(page),
						limit: take,
						total,
						totalPages: Math.ceil(total / take),
					},
					summary: {
						totalTagihan,
						totalBelumLunas,
						totalLunas,
						totalCicilan: 0,
						countBelumLunas,
						countLunas,
						countCicilan: 0,
						countOverdue,
					},
				},
			});
		} catch (err) {
			const { status, code, message } = handlePrismaError(err);
			return error(message, code, { status });
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(
		request,
		async () => {
			const ip = getClientIp(request);

			const rateLimitResult = rateLimit(`create:${ip}`, RATE_LIMITS.create);
			if (!rateLimitResult.success) {
				return errors.rateLimit(formatRateLimitError(rateLimitResult));
			}

			const body = await request.json();

			const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
			if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
				const cachedResult = getIdempotencyResult(idempotencyKey);
				if (cachedResult !== null) {
					return success(cachedResult, {
						message: "Billing created successfully",
						status: 201,
					});
				}
			}

			const validationErrors = validateBody(body, createBillingSchema);
			if (validationErrors) {
				return errors.validation(
					validationErrors.map((err) => ({
						field: err.field,
						message: err.message,
					})),
				);
			}

			const {
				studentId,
				jenisBiaya,
				jumlah,
				catatan,
				isCicilan,
				tenor,
				academicYearId,
				tanggalJatuhTempo,
				keterangan,
			} = body as z.infer<typeof createBillingSchema>;

			try {
				const existingBilling = await prisma.billing.findFirst({
					where: {
						studentId,
						jenisBiaya,
						academicYearId,
						bulan: { equals: null },
					},
				});

				if (existingBilling) {
					return errors.conflict(
						`Sudah ada tagihan untuk siswa ini dengan jenis biaya dan tahun ajaran yang sama`,
					);
				}

				const student = await prisma.student.findUnique({
					where: { id: studentId },
				});

				if (!student) {
					return errors.notFound("Siswa");
				}

					if (isCicilan) {
					if (!tenor || tenor < 1 || tenor > 12) {
						return errors.validation([
							{
								field: "tenor",
								message: "Tenor cicilan harus antara 1-12 bulan",
							},
						]);
					}
				}

				const billing = await prisma.$transaction(async (tx) => {
					if (isCicilan && tenor) {
						// Create N separate billings for cicilan
						const cicilanGroupId = crypto.randomUUID();
						const billingsData = generateCicilanBillings({
							studentId,
							jenisBiaya,
							jumlahTotal: jumlah,
							tenor,
							startDate: new Date(),
							academicYearId,
							cicilanGroupId,
						});

						const createdBillings = [];
						for (const billingData of billingsData) {
							const created = await tx.billing.create({
								data: {
									...billingData,
									catatan: catatan || null,
								},
							});
							createdBillings.push(created);
						}

						await tx.student.update({
							where: { id: studentId },
							data: {
								totalTagihan: { increment: jumlah },
								statusBayar: "Belum Lunas",
							},
						});

						return createdBillings[0]; // Return first billing as reference
					}

					// Non-cicilan: create single billing
					const created = await tx.billing.create({
						data: {
							studentId,
							jenisBiaya,
							jumlah,
							catatan: catatan || null,
							keterangan: keterangan || null,
							tanggalJatuhTempo: tanggalJatuhTempo
								? new Date(tanggalJatuhTempo)
								: null,
							statusBayar: "Belum Lunas",
							isCicilan: false,
							academicYearId,
						},
						include: {
							student: {
								select: {
									id: true,
									nis: true,
									nama: true,
									kelas: true,
								},
							},
						},
					});

					await tx.student.update({
						where: { id: studentId },
						data: {
							totalTagihan: { increment: jumlah },
							statusBayar: "Belum Lunas",
						},
					});

					return created;
				});

				if (idempotencyKey) {
					setIdempotencyResult(idempotencyKey, billing);
				}

				return success(billing, {
					message: "Billing created successfully",
					status: 201,
				});
			} catch (err) {
				const { status, code, message } = handlePrismaError(err);
				return error(message, code, { status });
			}
		},
		{ requireAdmin: true },
	);
}
