import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuthAppRouter } from "@/lib/auth/auth-middleware";
import {
	getIdempotencyResult,
	setIdempotencyResult,
	isValidIdempotencyKey,
} from "@/lib/utils/utils-idempotency";
import { success, errors, noContent } from "@/lib/api/api-response";
import { handlePrismaError } from "@/lib/utils/utils-prisma-errors";

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
	const header = req.headers.get("x-idempotency-key");
	if (!header) return null;
	return header;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid student ID",
				},
			]);
		}

		const student = await prisma.student.findUnique({
			where: { id },
			include: { billings: true },
		});

		if (!student) {
			return errors.notFound("Student");
		}

		return success(student, {
			message: "Student retrieved successfully",
		});
	});
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid student ID",
				},
			]);
		}

		// Check for idempotency key in headers
		const idempotencyKey = getIdempotencyKeyFromNextRequest(request);

		// Check for idempotency - return cached result if same request
		if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
			const cachedResult = getIdempotencyResult(idempotencyKey);
			if (cachedResult !== null) {
				return success(cachedResult, {
					message: "Student updated successfully (cached)",
				});
			}
		}

		const body = await request.json();
		const {
			nama,
			jenisKelamin,
			kelas,
			tahunMasuk,
			tahunAjaran,
			namaOrtu,
			noTelp,
			status,
			statusBayar,
		} = body;

		const student = await prisma.student.update({
			where: { id },
			data: {
				...(nama && { nama }),
				...(jenisKelamin !== undefined && { jenisKelamin }),
				...(kelas && ["1", "2", "3", "4", "5", "6"].includes(String(kelas)) && { kelas }),
				...(tahunMasuk && { tahunMasuk: parseInt(tahunMasuk) }),
				...(tahunAjaran !== undefined && { tahunAjaran }),
				...(namaOrtu !== undefined && { namaOrtu }),
				...(noTelp !== undefined && { noTelp }),
				...(status && { status }),
				...(statusBayar && { statusBayar }),
			},
		});

		// Cache result for idempotency
		if (idempotencyKey) {
			setIdempotencyResult(idempotencyKey, student);
		}

		return success(student, {
			message: "Student updated successfully",
		});
	});
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	return withAuthAppRouter(request, async () => {
		const { id } = await params;

		if (!id) {
			return errors.validation([
				{
					field: "id",
					message: "Invalid student ID",
				},
			]);
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
			// Hard delete to trigger cascade delete for Billings
			await prisma.student.delete({
				where: { id },
			});

			// Cache result for idempotency
			if (idempotencyKey) {
				setIdempotencyResult(idempotencyKey, { deleted: true });
			}

			// Return 204 No Content for DELETE
			return noContent();
		} catch (error) {
			// Prisma error P2025: Record to update not found.
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				return errors.notFound("Student");
			}
			const { message } = handlePrismaError(error);
			return errors.internal(message);
		}
	});
}
