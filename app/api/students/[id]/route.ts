import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { 
  getIdempotencyResult, 
  setIdempotencyResult,
  isValidIdempotencyKey 
} from '@/lib/idempotency';

function getIdempotencyKeyFromNextRequest(req: NextRequest): string | null {
  const header = req.headers.get('x-idempotency-key');
  if (!header) return null;
  return header;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id },
      include: { billings: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json(student);
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    // Check for idempotency key in headers
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);

    // Check for idempotency - return cached result if same request
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return NextResponse.json(cachedResult);
      }
    }

    const body = await request.json();
    const { nama, jenisKelamin, kelas, tahunMasuk, tahunAjaran, namaOrtu, noTelp, status, statusBayar } = body;

    const student = await prisma.student.update({
      where: { id },
      data: {
        ...(nama && { nama }),
        ...(jenisKelamin !== undefined && { jenisKelamin }),
        ...(kelas && { kelas }),
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

    return NextResponse.json(student);
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuthAppRouter(request, async () => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    // Check for idempotency
    const idempotencyKey = getIdempotencyKeyFromNextRequest(request);
    if (idempotencyKey && isValidIdempotencyKey(idempotencyKey)) {
      const cachedResult = getIdempotencyResult(idempotencyKey);
      if (cachedResult !== null) {
        return NextResponse.json(cachedResult);
      }
    }

    try {
      // Hard delete to trigger cascade delete for Billings
      const student = await prisma.student.delete({
        where: { id },
      });

      const result = { message: 'Siswa dan data terkait berhasil dihapus', student };

      // Cache result for idempotency
      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, result);
      }

      return NextResponse.json(result);
    } catch (error) {
      // Prisma error P2025: Record to update not found.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 });
      }
      throw error;
    }
  });
}
