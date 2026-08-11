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
import { success, errors, error } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";

import { EMPLOYEE_REVENUE_ACCOUNT } from "@/lib/services/billing";
import { autoCreatePiutangFromOverdueBillings } from "@/lib/services/piutang";

function isEmployeeBillingOverdue(billing: {
	createdAt: Date;
	statusBayar: string;
	tanggalJatuhTempo: Date | null;
}): boolean {
	if (billing.statusBayar === "Lunas") return false;
	if (!billing.tanggalJatuhTempo) return false;
	return new Date() > new Date(billing.tanggalJatuhTempo);
}

const createEmployeeBillingSchema = z.object({
	employeeId: z.string().min(1, "Karyawan wajib dipilih"),
	jenisBiaya: z.string().min(1, "Jenis biaya wajib diisi"),
	academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
	jumlah: z
		.union([z.number(), z.string()])
		.transform((val) => (typeof val === "string" ? parseFloat(val) : val))
		.refine((val) => val > 0, "Jumlah harus lebih dari 0"),
	catatan: z.string().optional(),
	tipe: z.enum(["tagihan", "pembayaran"]).default("tagihan"),
	tanggalJatuhTempo: z.string().optional(),
	keterangan: z.string().optional(),
});

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		// Auto-create piutang for overdue billings (fire-and-forget)
		autoCreatePiutangFromOverdueBillings().catch(console.error);

		const { searchParams } = new URL(request.url);
		const page = searchParams.get("page") || "1";
		const limit = searchParams.get("limit") || "10";
		const employeeId = searchParams.get("employeeId");
		const statusBayar = searchParams.get("statusBayar");
		const tipe = searchParams.get("tipe");
		const search = searchParams.get("search");
		const overdue = searchParams.get("overdue");
		const academicYearId = searchParams.get("academicYearId");

		const skip = (parseInt(page) - 1) * parseInt(limit);
		const take = parseInt(limit);

		const where: Record<string, unknown> = {};
		if (employeeId) where.employeeId = employeeId;
		if (statusBayar) where.statusBayar = statusBayar;
		if (tipe) where.tipe = tipe;
		if (academicYearId) where.academicYearId = academicYearId;

		if (search) {
			where.OR = [
				{ employee: { nama: { contains: search, mode: "insensitive" } } },
				{ employee: { nip: { contains: search, mode: "insensitive" } } },
				{ jenisBiaya: { contains: search, mode: "insensitive" } },
			];
		}

		if (overdue === "true") {
			where.statusBayar = "Belum Lunas";
		}

		try {
			const include: Record<string, unknown> = {
				employee: {
					select: {
						id: true,
						nip: true,
						nama: true,
						jabatan: true,
					},
				},
			};

			const [billings, total, aggregates, statusCounts] = await Promise.all([
				prisma.employeeBilling.findMany({
					where,
					include,
					orderBy: [{ tanggalJatuhTempo: "asc" }],
					skip,
					take,
				}),
				prisma.employeeBilling.count({ where }),
				prisma.employeeBilling.aggregate({
					where,
					_sum: { jumlah: true },
				}),
				prisma.employeeBilling.groupBy({
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
			const allUnpaidBillings = await prisma.employeeBilling.findMany({
				where: unpaidWhere,
				select: { createdAt: true, statusBayar: true, tanggalJatuhTempo: true },
			});
			const countOverdue = allUnpaidBillings.filter((b) =>
				isEmployeeBillingOverdue(b),
			).length;

			return success(billings, {
				message: "Employee billings retrieved successfully",
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
						countBelumLunas,
						countLunas,
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

			const rateLimitResult = rateLimit(`create-emp-billing:${ip}`, RATE_LIMITS.create);
			if (!rateLimitResult.success) {
				return errors.rateLimit(formatRateLimitError(rateLimitResult));
			}

			const body = await request.json();

			const validationErrors = validateBody(body, createEmployeeBillingSchema);
			if (validationErrors) {
				return errors.validation(
					validationErrors.map((err) => ({
						field: err.field,
						message: err.message,
					})),
				);
			}

			const {
				employeeId,
				jenisBiaya,
				jumlah,
				catatan,
				tipe,
				academicYearId,
				tanggalJatuhTempo,
				keterangan,
			} = body as z.infer<typeof createEmployeeBillingSchema>;

			try {
				const existingBilling = await prisma.employeeBilling.findFirst({
					where: {
						employeeId,
						jenisBiaya,
						academicYearId,
						bulan: { equals: null },
					},
				});

				if (existingBilling) {
					return errors.conflict(
						`Tagihan ${jenisBiaya} untuk tahun ajaran sudah ada untuk karyawan ini`,
					);
				}

				const employee = await prisma.employee.findUnique({
					where: { id: employeeId },
				});

				if (!employee) {
					return errors.notFound("Karyawan");
				}

				const billing = await prisma.$transaction(async (tx) => {
					const created = await tx.employeeBilling.create({
						data: {
							employeeId,
							jenisBiaya,
							academicYearId,
							jumlah,
							catatan: catatan || null,
							keterangan: keterangan || null,
							tanggalJatuhTempo: tanggalJatuhTempo
								? new Date(tanggalJatuhTempo)
								: null,
							statusBayar: "Belum Lunas",
							tipe,
					},
						include: {
							employee: {
								select: {
									id: true,
									nip: true,
									nama: true,
									jabatan: true,
								},
							},
						},
					});

					await tx.employee.update({
						where: { id: employeeId },
						data: {
							totalTagihan: { increment: jumlah },
							statusBayar: "Belum Lunas",
						},
					});

					return created;
				});

				return success(billing, {
					message: "Tagihan karyawan berhasil dibuat",
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
