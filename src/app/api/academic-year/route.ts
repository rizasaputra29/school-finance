import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/withAuthAppRouter';

const createAcademicYearSchema = z.object({
  tahunAjaran: z.string().min(1, 'Tahun ajaran wajib diisi').max(20, 'Tahun ajaran maksimal 20 karakter'),
  tanggalMulai: z.string().or(z.date()).transform(val => new Date(val)),
  tanggalSelesai: z.string().or(z.date()).transform(val => new Date(val)),
});

const updateAcademicYearSchema = z.object({
  tahunAjaran: z.string().min(1).max(20).optional(),
  tanggalMulai: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  tanggalSelesai: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('includeArchived');
    
    const where = includeArchived === 'true' 
      ? {} 
      : { isArchived: false };

    const academicYears = await prisma.academicYear.findMany({
      where,
      orderBy: { tahunAjaran: 'desc' },
    });

    const activeYear = academicYears.find((ay) => ay.isActive);

    return NextResponse.json({
      data: academicYears,
      activeYear: activeYear || null,
    });
  });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const body = await request.json();
    
    // Handle action-based POST requests
    if (body.action === 'close') {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: 'ID tahun ajaran wajib diisi' }, { status: 400 });
      }

      const academicYear = await prisma.academicYear.findUnique({ where: { id } });

      if (!academicYear) {
        return NextResponse.json({ error: 'Tahun ajaran tidak ditemukan' }, { status: 404 });
      }

      if (academicYear.isArchived) {
        return NextResponse.json({ error: 'Tahun ajaran sudah diarsipkan' }, { status: 400 });
      }

      // Generate closing entries
      const revenueAccounts = await prisma.account.findMany({ where: { tipeAkun: 'Revenue' } });
      const expenseAccounts = await prisma.account.findMany({ where: { tipeAkun: 'Expense' } });
      
      let saldoBerjalanAccount = await prisma.account.findFirst({ where: { kodeAkun: '3-000' } });
      
      if (!saldoBerjalanAccount) {
        saldoBerjalanAccount = await prisma.account.create({
          data: {
            kodeAkun: '3-000',
            namaAkun: 'Saldo Berjalan',
            tipeAkun: 'Equity',
            saldo: 0,
          },
        });
      }

      const closingDate = academicYear.tanggalSelesai;

      // Close Revenue accounts
      for (const revenueAccount of revenueAccounts) {
        if (revenueAccount.saldo > 0) {
          const entry = await prisma.journalEntry.create({
            data: {
              tanggal: closingDate,
              keterangan: `Penutupan Pendapatan - ${revenueAccount.namaAkun}`,
              reference: `closing:${id}`,
            },
          });

          await prisma.journalEntryLine.createMany({
            data: [
              { journalEntryId: entry.id, kodeAkun: revenueAccount.kodeAkun, debit: revenueAccount.saldo, kredit: 0 },
              { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: 0, kredit: revenueAccount.saldo },
            ],
          });

          await prisma.account.update({ where: { id: revenueAccount.id }, data: { saldo: 0 } });
        }
      }

      // Close Expense accounts
      for (const expenseAccount of expenseAccounts) {
        if (expenseAccount.saldo > 0) {
          const entry = await prisma.journalEntry.create({
            data: {
              tanggal: closingDate,
              keterangan: `Penutupan Beban - ${expenseAccount.namaAkun}`,
              reference: `closing:${id}`,
            },
          });

          await prisma.journalEntryLine.createMany({
            data: [
              { journalEntryId: entry.id, kodeAkun: saldoBerjalanAccount.kodeAkun, debit: expenseAccount.saldo, kredit: 0 },
              { journalEntryId: entry.id, kodeAkun: expenseAccount.kodeAkun, debit: 0, kredit: expenseAccount.saldo },
            ],
          });

          await prisma.account.update({ where: { id: expenseAccount.id }, data: { saldo: 0 } });
        }
      }

      const closedYear = await prisma.academicYear.update({
        where: { id },
        data: { isActive: false, isArchived: true },
      });

      return NextResponse.json({
        message: 'Tahun ajaran berhasil ditutup dengan jurnal penutup',
        data: closedYear,
      });
    }

    // Regular POST - Create new academic year
    const validation = createAcademicYearSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const { tahunAjaran, tanggalMulai, tanggalSelesai } = validation.data;

    if (tanggalSelesai <= tanggalMulai) {
      return NextResponse.json({
        error: 'Tanggal selesai harus setelah tanggal mulai',
      }, { status: 400 });
    }

    const existingYear = await prisma.academicYear.findUnique({
      where: { tahunAjaran },
    });

    if (existingYear) {
      return NextResponse.json({
        error: 'Tahun ajaran sudah ada',
      }, { status: 400 });
    }

    const currentActiveYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      if (currentActiveYear) {
        await tx.student.updateMany({
          where: { status: 'Active' },
          data: { status: 'Archived' },
        });

        await tx.academicYear.update({
          where: { id: currentActiveYear.id },
          data: { isActive: false, isArchived: true },
        });
      }

      const newAcademicYear = await tx.academicYear.create({
        data: {
          tahunAjaran,
          tanggalMulai,
          tanggalSelesai,
          isActive: true,
          isArchived: false,
        },
      });

      return newAcademicYear;
    });

    return NextResponse.json({
      message: 'Tahun ajaran berhasil dibuat dan diaktifkan',
      data: result,
    }, { status: 201 });
  });
}

export async function PUT(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID tahun ajaran wajib diisi' }, { status: 400 });
    }

    const body = await request.json();
    
    const validation = updateAcademicYearSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const { isActive } = validation.data;

    if (isActive === true) {
      await prisma.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const updatedYear = await prisma.academicYear.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json(updatedYear);
  });
}

export async function DELETE(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID tahun ajaran wajib diisi' }, { status: 400 });
    }

    const archivedYear = await prisma.academicYear.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });

    return NextResponse.json({
      message: 'Tahun ajaran berhasil diarsipkan',
      data: archivedYear,
    });
  });
}
