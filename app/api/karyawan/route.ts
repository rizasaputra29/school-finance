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
import { success, errors, noContent } from "@/lib/api/api-response";
import { handlePrismaErrorResponse } from "@/lib/utils/utils-prisma-errors";

const createEmployeeSchema = z.object({
	nip: z.string().min(1, "NIP wajib diisi"),
	nama: z.string().min(1, "Nama wajib diisi").max(200),
	jabatan: z.string().min(1, "Jabatan wajib diisi"),
	jenisKelamin: z.enum(["L", "P"]).optional(),
	noTelp: z.string().optional(),
	alamat: z.string().optional(),
	tanggalMasuk: z.string().min(1, "Tanggal masuk wajib diisi"),
	gajiPokok: z.union([z.number(), z.string()]).optional().default(0),
	status: z.enum(["Active", "Inactive"]).optional().default("Active"),
});

const updateEmployeeSchema = createEmployeeSchema.partial().extend({
	id: z.string().min(1),
});

const MONTH_NAMES = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export async function GET(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const page = searchParams.get("page") || "1";
			const limit = searchParams.get("limit") || "10";
			const search = searchParams.get("search");
			const status = searchParams.get("status");
			const jabatan = searchParams.get("jabatan");

			const skip = (parseInt(page) - 1) * parseInt(limit);
			const take = parseInt(limit);

			const where: Record<string, unknown> = {};
			if (search) {
				where.OR = [
					{ nama: { contains: search, mode: "insensitive" } },
					{ nip: { contains: search, mode: "insensitive" } },
					{ jabatan: { contains: search, mode: "insensitive" } },
				];
			}
			if (status) where.status = status;
			if (jabatan) where.jabatan = jabatan;

			const [employees, total, activeCount, inactiveCount] = await Promise.all([
				prisma.employee.findMany({
					where,
					orderBy: { nama: "asc" },
					skip,
					take,
					include: {
						_count: { select: { employeeBillings: true } },
					},
				}),
				prisma.employee.count({ where }),
				prisma.employee.count({ where: { status: "Active" } }),
				prisma.employee.count({ where: { status: "Inactive" } }),
			]);

			return success(employees, {
				message: "Employees retrieved successfully",
				meta: {
					pagination: {
						page: parseInt(page),
						limit: take,
						total,
						totalPages: Math.ceil(total / take),
					},
					summary: {
						total: activeCount + inactiveCount,
						active: activeCount,
						inactive: inactiveCount,
					},
				},
			});
		} catch (error) {
			console.error("Employee API error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function POST(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const ip = getClientIp(request);

			const rateLimitResult = rateLimit(
				`create-employee:${ip}`,
				RATE_LIMITS.create,
			);
			if (!rateLimitResult.success) {
				return errors.rateLimit(formatRateLimitError(rateLimitResult), {
					"Retry-After": Math.ceil(
						(rateLimitResult.reset - Date.now()) / 1000,
					).toString(),
				});
			}

			const body = await request.json();

			const validationErrors = validateBody(body, createEmployeeSchema);
			if (validationErrors) {
				return errors.validation(validationErrors);
			}

			const data = body as z.infer<typeof createEmployeeSchema>;
			const gajiPokok =
				typeof data.gajiPokok === "string"
					? parseFloat(data.gajiPokok)
					: Number(data.gajiPokok) || 0;

			// Check duplicate NIP
			const existing = await prisma.employee.findUnique({
				where: { nip: data.nip },
			});
			if (existing) {
				return errors.conflict(`NIP ${data.nip} sudah terdaftar`);
			}

			const employee = await prisma.employee.create({
				data: {
					nip: data.nip,
					nama: data.nama,
					jabatan: data.jabatan,
					jenisKelamin: data.jenisKelamin || null,
					noTelp: data.noTelp || null,
					alamat: data.alamat || null,
					tanggalMasuk: new Date(data.tanggalMasuk),
					gajiPokok,
					status: data.status || "Active",
				},
			});

			// Auto-generate 12 monthly Gaji billings if gajiPokok > 0
			if (gajiPokok > 0) {
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (activeYear) {
					const billings = [];
					const startYear = activeYear.tanggalMulai.getFullYear();
					const startMonth = activeYear.tanggalMulai.getMonth();
					for (let month = 1; month <= 12; month++) {
						const dueYear = month - 1 >= startMonth ? startYear : startYear + 1;
						const dueDate = new Date(dueYear, month - 1, 1);
						billings.push({
							employeeId: employee.id,
							academicYearId: activeYear.id,
							jenisBiaya: "Gaji",
							jumlah: gajiPokok,
							bulan: month,
							statusBayar: "Belum Lunas",
							tipe: "pembayaran",
							tanggalJatuhTempo: dueDate,
							keterangan: `Gaji Bulan ${MONTH_NAMES[month - 1]}`,
						});
					}
					await prisma.employeeBilling.createMany({
						data: billings,
						skipDuplicates: true,
					});
					await prisma.employee.update({
						where: { id: employee.id },
						data: {
							totalTagihan: gajiPokok * 12,
							statusBayar: "Belum Lunas",
						},
					});
				}
			}

			return success(employee, {
				message: "Karyawan berhasil ditambahkan",
				status: 201,
			});
		} catch (error) {
			console.error("Employee POST error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function PUT(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const body = await request.json();

			const validationErrors = validateBody(body, updateEmployeeSchema);
			if (validationErrors) {
				return errors.validation(validationErrors);
			}

			const data = body as z.infer<typeof updateEmployeeSchema>;

			const existing = await prisma.employee.findUnique({
				where: { id: data.id },
			});
			if (!existing) {
				return errors.notFound("Karyawan");
			}

			// Check NIP uniqueness if changing
			if (data.nip && data.nip !== existing.nip) {
				const nipConflict = await prisma.employee.findUnique({
					where: { nip: data.nip },
				});
				if (nipConflict) {
					return errors.conflict(`NIP ${data.nip} sudah terdaftar`);
				}
			}

			const gajiPokok =
				data.gajiPokok !== undefined
					? typeof data.gajiPokok === "string"
						? parseFloat(data.gajiPokok)
						: Number(data.gajiPokok) || 0
					: undefined;

			const employee = await prisma.employee.update({
				where: { id: data.id },
				data: {
					...(data.nip && { nip: data.nip }),
					...(data.nama && { nama: data.nama }),
					...(data.jabatan && { jabatan: data.jabatan }),
					...(data.jenisKelamin !== undefined && {
						jenisKelamin: data.jenisKelamin || null,
					}),
					...(data.noTelp !== undefined && { noTelp: data.noTelp || null }),
					...(data.alamat !== undefined && { alamat: data.alamat || null }),
					...(data.tanggalMasuk && {
						tanggalMasuk: new Date(data.tanggalMasuk),
					}),
					...(gajiPokok !== undefined && { gajiPokok }),
					...(data.status && { status: data.status }),
				},
			});

			// If gajiPokok changed and > 0, regenerate salary billings
			if (gajiPokok !== undefined && gajiPokok > 0 && gajiPokok !== existing.gajiPokok) {
				const activeYear = await prisma.academicYear.findFirst({
					where: { isActive: true },
				});
				if (activeYear) {
					await prisma.employeeBilling.deleteMany({
						where: {
							employeeId: employee.id,
							jenisBiaya: "Gaji",
							academicYearId: activeYear.id,
							statusBayar: "Belum Lunas",
						},
					});
					const billings = [];
					const startYear = activeYear.tanggalMulai.getFullYear();
					const startMonth = activeYear.tanggalMulai.getMonth();
					for (let month = 1; month <= 12; month++) {
						const dueYear = month - 1 >= startMonth ? startYear : startYear + 1;
						const dueDate = new Date(dueYear, month - 1, 1);
						billings.push({
							employeeId: employee.id,
							academicYearId: activeYear.id,
							jenisBiaya: "Gaji",
							jumlah: gajiPokok,
							bulan: month,
							statusBayar: "Belum Lunas",
							tipe: "pembayaran",
							tanggalJatuhTempo: dueDate,
							keterangan: `Gaji Bulan ${MONTH_NAMES[month - 1]}`,
						});
					}
					await prisma.employeeBilling.createMany({
						data: billings,
						skipDuplicates: true,
					});
					const total = await prisma.employeeBilling.aggregate({
						where: { employeeId: employee.id },
						_sum: { jumlah: true },
					});
					await prisma.employee.update({
						where: { id: employee.id },
						data: { totalTagihan: total._sum.jumlah || 0 },
					});
				}
			}

			return success(employee, { message: "Karyawan berhasil diperbarui" });
		} catch (error) {
			console.error("Employee PUT error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}

export async function DELETE(request: NextRequest) {
	return withAuthAppRouter(request, async () => {
		try {
			const { searchParams } = new URL(request.url);
			const id = searchParams.get("id");

			if (!id) {
				return errors.validation([
					{ field: "id", message: "ID karyawan wajib diisi" },
				]);
			}

			const existing = await prisma.employee.findUnique({ where: { id } });
			if (!existing) {
				return errors.notFound("Karyawan");
			}

			await prisma.employee.delete({ where: { id } });
			return noContent();
		} catch (error) {
			console.error("Employee DELETE error:", error);
			return handlePrismaErrorResponse(error);
		}
	});
}
