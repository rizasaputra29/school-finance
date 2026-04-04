import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuthAppRouter } from '@/lib/with-auth';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';

// Account codes for double-entry
const BANK_ACCOUNT_CODE = '102'; // Bank
const PIUTANG_ACCOUNT_CODE = '103'; // Piutang Siswa

// Map billing type to revenue account code
function getRevenueAccountCode(jenisBiaya: string): string {
  const mapping: Record<string, string> = {
    'SPP': '405', // Penerimaan Uang SPP
    'Uang Pangkal': '401', // Penerimaan Uang Gedung
    'Uang Gedung': '401', // Penerimaan Uang Gedung
    'Uang Kegiatan': '402', // Penerimaan Uang Kegiatan
    'Uang Seragam': '403', // Penerimaan Uang Seragam
    'Uang ATK': '404', // Penerimaan Uang ATK
    'Pendaftaran': '400', // Penerimaan Dana Pendaftaran
  };
  return mapping[jenisBiaya] || '406';
}

// Calculate days overdue
function calculateDaysOverdue(tanggalJatuhTempo: Date): number {
  const now = new Date();
  const dueDate = new Date(tanggalJatuhTempo);
  const diffTime = now.getTime() - dueDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Determine aging category
function getAgingCategory(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Belum Jatuh Tempo';
  if (daysOverdue <= 30) return '1-30 hari';
  if (daysOverdue <= 60) return '31-60 hari';
  if (daysOverdue <= 90) return '61-90 hari';
  return '90+ hari';
}

// Type for piutang item
interface PiutangItem {
  id: string;
  studentId: string;
  student: {
    id: string;
    nis: string;
    nama: string;
    kelas: string;
  };
  billingId: string | null;
  billing?: {
    id: string;
    jenisBiaya: string;
    periodeBulan: string;
    jumlah: number;
  } | null;
  cicilanKe: number | null;
  jumlah: number;
  tanggalJatuhTempo: Date;
  status: string;
  hariTerlambat: number;
  aging: string;
}

// Validation schema for paying piutang
const payPiutangSchema = z.object({
  installmentId: z.string().min(1, 'Cicilan wajib dipilih'),
  jumlahBayar: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).refine(val => val > 0, 'Jumlah pembayaran harus lebih dari 0'),
  tanggalBayar: z.string().optional(),
  catatan: z.string().optional(),
});


// Get all overdue installments as piutang
async function getPiutangFromInstallments(): Promise<PiutangItem[]> {
  const installments = await prisma.installment.findMany({
    where: {
      status: { in: ['Belum Bayar', 'Jatuh Tempo'] },
      tanggalJatuhTempo: { lt: new Date() },
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
      billing: {
        select: {
          id: true,
          jenisBiaya: true,
          periodeBulan: true,
          jumlah: true,
        },
      },
    },
    orderBy: [
      { student: { nama: 'asc' } },
      { tanggalJatuhTempo: 'asc' },
    ],
  });

  return installments.map((inst) => {
    const hariTerlambat = calculateDaysOverdue(inst.tanggalJatuhTempo);
    return {
      id: inst.id,
      studentId: inst.studentId,
      student: inst.student,
      billingId: inst.billingId,
      billing: inst.billing || undefined,
      cicilanKe: inst.cicilanKe,
      jumlah: inst.jumlah,
      tanggalJatuhTempo: inst.tanggalJatuhTempo,
      status: inst.status,
      hariTerlambat: Math.max(0, hariTerlambat),
      aging: getAgingCategory(hariTerlambat),
    };
  });
}

// Process payment for piutang (overdue installment)
async function processPiutangPayment(
  installmentId: string,
  amount: number,
  paymentDate: Date
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Get installment with student and billing details
    const installment = await tx.installment.findUnique({
      where: { id: installmentId },
      include: {
        student: true,
        billing: true,
      },
    });

    if (!installment) {
      throw new Error('Piutang tidak ditemukan');
    }

    if (installment.status === 'Bayar') {
      throw new Error('Piutang sudah lunas');
    }

    // 2. Determine revenue account based on billing type
    const revenueCode = installment.billing
      ? getRevenueAccountCode(installment.billing.jenisBiaya)
      : '406';

    // 3. Create cashflow entries for piutang payment
    // Always reduce piutang since we're paying overdue installment
    const cashflowEntries = [
      {
        kodeAkun: PIUTANG_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran Piutang Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Lunasi Piutang`,
      },
      {
        kodeAkun: BANK_ACCOUNT_CODE,
        debit: amount,
        kredit: 0,
        keterangan: `Pembayaran Piutang Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Masuk Bank`,
      },
      {
        kodeAkun: revenueCode,
        debit: 0,
        kredit: amount,
        keterangan: `Pembayaran Piutang Cicilan ${installment.cicilanKe} - ${installment.student.nama} - Pendapatan`,
      },
    ];

    // 4. Create cashflow records and update account balances
    const createdCashflows = [];

    for (const entry of cashflowEntries) {
      const account = await tx.account.findUnique({
        where: { kodeAkun: entry.kodeAkun },
      });

      if (!account) {
        throw new Error(`Akun dengan kode ${entry.kodeAkun} tidak ditemukan`);
      }

      // Calculate balance adjustment based on account type
      const isDebitNormal = ['Asset', 'Expense'].includes(account.tipeAkun);
      let saldoChange = 0;

      if (isDebitNormal) {
        saldoChange = entry.debit - entry.kredit;
      } else {
        saldoChange = entry.kredit - entry.debit;
      }

      // Update account balance
      await tx.account.update({
        where: { kodeAkun: entry.kodeAkun },
        data: {
          saldo: { increment: saldoChange },
        },
      });

      // Create cashflow record
      const cashflow = await tx.cashflow.create({
        data: {
          tanggal: paymentDate,
          keterangan: entry.keterangan,
          kodeAkun: entry.kodeAkun,
          kategori: 'pemasukan',
          debit: entry.debit,
          kredit: entry.kredit,
          referenceId: installmentId,
        },
      });

      createdCashflows.push(cashflow);
    }

    // 5. Update installment status to Bayar
    const updatedInstallment = await tx.installment.update({
      where: { id: installmentId },
      data: {
        status: 'Bayar',
        tanggalBayar: paymentDate,
      },
    });

    // 6. Update student payment totals
    const studentUpdate = await tx.student.update({
      where: { id: installment.studentId },
      data: {
        totalBayar: { increment: amount },
      },
    });

    // 7. Check and update student overall payment status
    const remainingInstallments = await tx.installment.count({
      where: {
        studentId: installment.studentId,
        status: { not: 'Bayar' },
      },
    });

    const newStatusBayar = remainingInstallments === 0 ? 'Lunas' : 'Belum Lunas';

    await tx.student.update({
      where: { id: installment.studentId },
      data: {
        statusBayar: newStatusBayar,
      },
    });

    // 8. If there's a linked billing, check if all installments are paid
    if (installment.billingId) {
      const paidInstallments = await tx.installment.count({
        where: {
          billingId: installment.billingId,
          status: 'Bayar',
        },
      });

      const totalInstallments = await tx.installment.count({
        where: {
          billingId: installment.billingId,
        },
      });

      if (paidInstallments === totalInstallments) {
        await tx.billing.update({
          where: { id: installment.billingId },
          data: {
            statusBayar: 'Lunas',
            tanggalBayar: paymentDate,
          },
        });
      }
    }

    return {
      installment: updatedInstallment,
      cashflows: createdCashflows,
      studentUpdated: studentUpdate,
    };
  });
}

// Auto-create piutang from overdue installments (mark as Jatuh Tempo)
async function autoCreatePiutangFromOverdueInstallments() {
  const result = await prisma.installment.updateMany({
    where: {
      status: 'Belum Bayar',
      tanggalJatuhTempo: { lt: new Date() },
    },
    data: {
      status: 'Jatuh Tempo',
    },
  });

  return result.count;
}

// Calculate piutang summary
function calculatePiutangSummary(piutangItems: PiutangItem[]) {
  const totalPiutang = piutangItems.reduce((sum, item) => sum + item.jumlah, 0);
  
  const current = piutangItems
    .filter(item => item.hariTerlambat <= 0)
    .reduce((sum, item) => sum + item.jumlah, 0);
  
  const aging30 = piutangItems
    .filter(item => item.hariTerlambat > 0 && item.hariTerlambat <= 30)
    .reduce((sum, item) => sum + item.jumlah, 0);
  
  const aging60 = piutangItems
    .filter(item => item.hariTerlambat > 30 && item.hariTerlambat <= 60)
    .reduce((sum, item) => sum + item.jumlah, 0);
  
  const aging90plus = piutangItems
    .filter(item => item.hariTerlambat > 60)
    .reduce((sum, item) => sum + item.jumlah, 0);

  return {
    totalPiutang,
    current,
    aging30,
    aging60,
    aging90plus,
    jumlahCurrent: piutangItems.filter(item => item.hariTerlambat <= 0).length,
    jumlahAging30: piutangItems.filter(item => item.hariTerlambat > 0 && item.hariTerlambat <= 30).length,
    jumlahAging60: piutangItems.filter(item => item.hariTerlambat > 30 && item.hariTerlambat <= 60).length,
    jumlahAging90plus: piutangItems.filter(item => item.hariTerlambat > 60).length,
  };
}

export async function GET(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const studentId = searchParams.get('studentId');
      const aging = searchParams.get('aging');
      const minimalHari = searchParams.get('minimalHari');

      let piutangItems = await getPiutangFromInstallments();

      // Filter by student
      if (studentId) {
        piutangItems = piutangItems.filter(item => item.studentId === studentId);
      }

      // Filter by aging category
      if (aging) {
        piutangItems = piutangItems.filter(item => item.aging === aging);
      }

      // Filter by minimum days overdue
      if (minimalHari) {
        const minDays = parseInt(minimalHari, 10);
        piutangItems = piutangItems.filter(item => item.hariTerlambat >= minDays);
      }

      const summary = calculatePiutangSummary(piutangItems);

      return NextResponse.json({
        data: piutangItems,
        summary,
      });
    } catch (error) {
      console.error('Piutang API error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, { requireAdmin: true });
}

export async function POST(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    const ip = getClientIp(request);
    
    try {
      const body = await request.json();

      // Auto-create piutang from overdue installments
      const rateLimitResult = rateLimit(`piutang-auto:${ip}`, RATE_LIMITS.create);
      if (!rateLimitResult.success) {
        return NextResponse.json({ 
          error: formatRateLimitError(rateLimitResult),
          code: 'RATE_LIMIT_EXCEEDED'
        }, { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
          }
        });
      }

      // Check action type
      const { action } = body;

      if (action === 'auto-create') {
        // Auto-create piutang: mark overdue installments as Jatuh Tempo
        const count = await autoCreatePiutangFromOverdueInstallments();
        
        return NextResponse.json({
          success: true,
          message: `${count} piutang berhasil dibuat dari installment overdue`,
          count,
        });
      }

      // Otherwise, validate as payment
      const validationErrors = payPiutangSchema.safeParse(body);
      if (!validationErrors.success) {
        return NextResponse.json({
          error: 'Validation failed',
          details: validationErrors.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        }, { status: 400 });
      }

      const { installmentId, jumlahBayar, tanggalBayar } = validationErrors.data;
      
      const amount = Number(jumlahBayar);
      const paymentDate = tanggalBayar ? new Date(tanggalBayar) : new Date();

      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Jumlah pembayaran harus lebih dari 0' }, { status: 400 });
      }

      try {
        const result = await processPiutangPayment(
          installmentId,
          amount,
          paymentDate
        );

        return NextResponse.json({
          success: true,
          message: 'Pembayaran piutang berhasil!',
          data: {
            installment: result.installment,
            cashflows: result.cashflows,
            student: result.studentUpdated,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    } catch (error) {
      console.error('Piutang API error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, { requireAdmin: true });
}

export async function PUT(request: NextRequest) {
  return withAuthAppRouter(request, async () => {
    try {
      const body = await request.json();

      // Manual payment: pay partial or full amount to piutang
      const validationErrors = payPiutangSchema.safeParse(body);
      if (!validationErrors.success) {
        return NextResponse.json({
          error: 'Validation failed',
          details: validationErrors.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        }, { status: 400 });
      }

      const { installmentId, jumlahBayar, tanggalBayar } = validationErrors.data;
      
      const amount = Number(jumlahBayar);
      const paymentDate = tanggalBayar ? new Date(tanggalBayar) : new Date();

      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Jumlah pembayaran harus lebih dari 0' }, { status: 400 });
      }

      try {
        const result = await processPiutangPayment(
          installmentId,
          amount,
          paymentDate
        );

        return NextResponse.json({
          success: true,
          message: 'Pembayaran piutang berhasil!',
          data: {
            installment: result.installment,
            cashflows: result.cashflows,
            student: result.studentUpdated,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    } catch (error) {
      console.error('Piutang API error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, { requireAdmin: true });
}
