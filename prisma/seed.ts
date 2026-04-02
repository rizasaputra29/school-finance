import 'dotenv/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================================
// CONFIGURATION
// ============================================================================

const BATCH_SIZE = 200;

const ACCOUNTS = [
  { kodeAkun: '101', namaAkun: 'Kas', tipeAkun: 'Asset', saldo: 50000000 },
  { kodeAkun: '102', namaAkun: 'Bank', tipeAkun: 'Asset', saldo: 100000000 },
  { kodeAkun: '103', namaAkun: 'Piutang Siswa', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '104', namaAkun: 'Piutang Lain-Lain', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '105', namaAkun: 'Piutang Periode Sebelumnya', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '106', namaAkun: 'Biaya Dibayar Dimuka', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '107', namaAkun: 'Tanah', tipeAkun: 'Asset', saldo: 500000000 },
  { kodeAkun: '108', namaAkun: 'Gedung', tipeAkun: 'Asset', saldo: 1000000000 },
  { kodeAkun: '109', namaAkun: 'Kendaraan', tipeAkun: 'Asset', saldo: 150000000 },
  { kodeAkun: '110', namaAkun: 'Peralatan Kantor', tipeAkun: 'Asset', saldo: 50000000 },
  { kodeAkun: '111', namaAkun: 'Akumulasi Penyusutan Aktiva Tetap', tipeAkun: 'Asset', saldo: -100000000, isContra: true },
  { kodeAkun: '200', namaAkun: 'Hutang Usaha', tipeAkun: 'Liability', saldo: 0 },
  { kodeAkun: '201', namaAkun: 'Hutang Bank (Lancar)', tipeAkun: 'Liability', saldo: 200000000 },
  { kodeAkun: '300', namaAkun: 'Setoran Modal Pemilik', tipeAkun: 'Equity', saldo: 1550000000 },
  { kodeAkun: '400', namaAkun: 'Penerimaan Dana Pendaftaran', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '401', namaAkun: 'Penerimaan Uang Gedung', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '402', namaAkun: 'Penerimaan Uang Kegiatan', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '403', namaAkun: 'Penerimaan Uang Seragam', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '404', namaAkun: 'Penerimaan Uang ATK', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '405', namaAkun: 'Penerimaan Uang SPP', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '406', namaAkun: 'Pendapatan Lain-Lain', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '500', namaAkun: 'Biaya Gaji', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '502', namaAkun: 'Biaya ATK Kantor', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '504', namaAkun: 'Biaya Listrik, Internet dan Telepon', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '510', namaAkun: 'Biaya Konsumsi', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '516', namaAkun: 'Biaya sarana dan prasana', tipeAkun: 'Expense', saldo: 0 },
];

const CLASS_FEE_MAP: Record<string, Record<string, number>> = {
  PLAYGROUP: { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 500000, SPP: 550000 },
  KINDERGARTEN: { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 550000 },
  '1': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 650000 },
  '2': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 650000 },
  '3': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 700000 },
  '4': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 700000 },
  '5': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 750000 },
};

const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  'Pendaftaran': '400',
  'Uang Gedung': '401',
  'Kegiatan': '402',
  'Seragam': '403',
  'ATK': '404',
  'SPP': '405',
  'Gaji': '500',
  'Listrik': '504',
  'Beban Umum': '502',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('🌱 Starting optimized seeding...\n');

  // 1. CLEAN ALL DATA
  console.log('1. Cleaning existing data...');
  await prisma.journalEntryLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.cashflow.deleteMany();
  await prisma.billing.deleteMany();
  await prisma.student.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.account.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.installment.deleteMany();
  console.log('   ✅ Data cleaned\n');

  // 2. CREATE ACCOUNTS
  console.log('2. Creating accounts...');
  await prisma.account.createMany({ data: ACCOUNTS });
  console.log(`   ✅ Created ${ACCOUNTS.length} accounts\n`);

  // 3. CREATE ACADEMIC YEAR
  console.log('3. Creating academic year...');
  const academicYear = await prisma.academicYear.create({
    data: {
      tahunAjaran: '2025/2026',
      tanggalMulai: new Date('2025-07-01'),
      tanggalSelesai: new Date('2026-06-30'),
      isActive: true,
    },
  });
  console.log('   ✅ Academic year created\n');

  // 4. CREATE STUDENTS
  console.log('4. Creating students...');
  const studentNames = [
    'Ahmad Fauzi', 'Siti Aminah', 'Muhammad Rizki', 'Abdul Hakim', 'Fatima Zahra',
    'Rendi Pangestu', 'Dewi Lestari', 'Budi Hartono', 'Anisa Fitri', 'Eko Saputra',
    'Lestari Putri', 'Aditya Pratama', 'Santi Kurnia', 'Hendra Wijaya', 'Maya Indah',
    'Robi Setiawan', 'Nina Marlina', 'Fajar Sidik', 'Rina Widya', 'Diki Wahyudi'
  ];
  const classes = ['PLAYGROUP', 'KINDERGARTEN', '1', '2', '3', '4', '5'];

  const studentData = studentNames.map((name, i) => ({
    nis: `2025${String(i + 1).padStart(3, '0')}`,
    nama: name,
    jenisKelamin: i % 2 === 0 ? 'L' : 'P',
    kelas: classes[i % classes.length],
    tahunMasuk: 2025,
    namaOrtu: `Orang Tua ${i + 1}`,
    noTelp: `0812${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    statusBayar: 'Belum Lunas',
  }));

  await prisma.student.createMany({ data: studentData });
  const students = await prisma.student.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${students.length} students\n`);

  // 5. CREATE EMPLOYEES
  console.log('5. Creating employees...');
  const employeeData = [
    { nip: 'E001', nama: 'Jane Doe, M.Ed', jabatan: 'Principal', gajiPokok: 12000000, tanggalMasuk: new Date('2022-01-01'), status: 'Active' },
    { nip: 'E002', nama: 'John Smith', jabatan: 'Teacher', gajiPokok: 7000000, tanggalMasuk: new Date('2022-01-01'), status: 'Active' },
    { nip: 'E003', nama: 'Siti Sarah', jabatan: 'Teacher', gajiPokok: 6500000, tanggalMasuk: new Date('2022-01-01'), status: 'Active' },
    { nip: 'E004', nama: 'Budi Wahyono', jabatan: 'Admin', gajiPokok: 5000000, tanggalMasuk: new Date('2022-01-01'), status: 'Active' },
  ];
  await prisma.employee.createMany({ data: employeeData });
  const employees = await prisma.employee.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${employees.length} employees\n`);

  // 6. PREPARE BILLINGS DATA
  console.log('6. Preparing billing data...');
  const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
  const billingData: Array<{
    studentId: string;
    academicYearId: string;
    jenisBiaya: string;
    periodeBulan: string;
    jumlah: number;
    statusBayar: string;
  }> = [];

  for (const student of students) {
    const fees = CLASS_FEE_MAP[student.kelas] || CLASS_FEE_MAP['1'];

    // Initial fees for July
    const initialFees = [
      { type: 'Pendaftaran', amount: fees.Pendaftaran },
      { type: 'Uang Gedung', amount: fees.Gedung },
      { type: 'Seragam', amount: fees.Seragam },
      { type: 'ATK', amount: fees.ATK },
    ];

    for (const fee of initialFees) {
      billingData.push({
        studentId: student.id,
        academicYearId: academicYear.id,
        jenisBiaya: fee.type,
        periodeBulan: '2025-07',
        jumlah: fee.amount,
        statusBayar: 'Belum Lunas',
      });
    }

    // Monthly SPP
    for (const m of months) {
      billingData.push({
        studentId: student.id,
        academicYearId: academicYear.id,
        jenisBiaya: 'SPP',
        periodeBulan: m,
        jumlah: fees.SPP,
        statusBayar: 'Belum Lunas',
      });
    }
  }

  // 7. BULK INSERT BILLINGS
  console.log(`   Inserting ${billingData.length} billings in batches...`);
  const billingChunks = chunkArray(billingData, BATCH_SIZE);
  for (const chunk of billingChunks) {
    await prisma.billing.createMany({ data: chunk });
  }
  const billings = await prisma.billing.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${billings.length} billings\n`);

  // 8. PREPARE CASHFLOW DATA
  console.log('8. Preparing cashflow data...');
  const cashflowData: Array<{
    id: string;
    tanggal: Date;
    keterangan: string;
    kodeAkun: string;
    kategori: string | null;
    debit: number;
    kredit: number;
    status: string;
  }> = [];

  // Track which billings are paid and their cashflow index
  const paidBillings: Array<{ billingId: string; payDate: Date; cashflowId: string }> = [];

  // Process initial fees (July)
  for (const student of students) {
    const fees = CLASS_FEE_MAP[student.kelas] || CLASS_FEE_MAP['1'];
    const initialFees = [
      { type: 'Pendaftaran', amount: fees.Pendaftaran },
      { type: 'Uang Gedung', amount: fees.Gedung },
      { type: 'Seragam', amount: fees.Seragam },
      { type: 'ATK', amount: fees.ATK },
    ];

    for (const fee of initialFees) {
      if (Math.random() < 0.8) {
        const payDate = new Date(`2025-07-${1 + Math.floor(Math.random() * 25)}`);
        const cfId = createId();
        cashflowData.push({
          id: cfId,
          tanggal: payDate,
          keterangan: `Bayar ${fee.type} - ${student.nama}`,
          kodeAkun: '101',
          kategori: fee.type,
          debit: fee.amount,
          kredit: 0,
          status: 'posted',
        });

        const billing = billings.find(b =>
          b.studentId === student.id &&
          b.jenisBiaya === fee.type &&
          b.periodeBulan === '2025-07'
        );
        if (billing) {
          paidBillings.push({ billingId: billing.id, payDate, cashflowId: cfId });
        }
      }
    }
  }

  // Process monthly SPP
  for (const student of students) {
    const fees = CLASS_FEE_MAP[student.kelas] || CLASS_FEE_MAP['1'];

    for (const m of months) {
      const prob = m.startsWith('2026') ? 0.4 : 0.7;
      if (Math.random() < prob) {
        const payDate = new Date(`${m}-${10 + Math.floor(Math.random() * 10)}`);
        const cfId = createId();
        cashflowData.push({
          id: cfId,
          tanggal: payDate,
          keterangan: `Bayar SPP ${student.nama} (${m})`,
          kodeAkun: '101',
          kategori: 'SPP',
          debit: fees.SPP,
          kredit: 0,
          status: 'posted',
        });

        const billing = billings.find(b =>
          b.studentId === student.id &&
          b.jenisBiaya === 'SPP' &&
          b.periodeBulan === m
        );
        if (billing) {
          paidBillings.push({ billingId: billing.id, payDate, cashflowId: cfId });
        }
      }
    }
  }

  // Process payroll expenses
  for (const m of months) {
    for (const emp of employees) {
      const total = emp.gajiPokok + 500000;
      const payDate = new Date(`${m}-25`);

      cashflowData.push({
        id: createId(),
        tanggal: payDate,
        keterangan: `Gaji ${emp.nama} (${m})`,
        kodeAkun: '101',
        kategori: 'Gaji',
        debit: 0,
        kredit: total,
        status: 'posted',
      });
    }

    // Monthly utilities
    const listDate = new Date(`${m}-05`);
    const listAmount = 1500000 + Math.random() * 500000;
    cashflowData.push({
      id: createId(),
      tanggal: listDate,
      keterangan: `Listrik & Internet ${m}`,
      kodeAkun: '101',
      kategori: 'Listrik',
      debit: 0,
      kredit: listAmount,
      status: 'posted',
    });
  }

  // 9. BULK INSERT CASHFLOWS
  console.log(`   Inserting ${cashflowData.length} cashflows...`);
  const cashflowChunks = chunkArray(cashflowData, BATCH_SIZE);
  for (const chunk of cashflowChunks) {
    await prisma.cashflow.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${cashflowData.length} cashflows\n`);

  // 10. UPDATE BILLINGS WITH CASHFLOW IDs
  console.log('10. Updating billings with cashflow references...');
  for (const paid of paidBillings) {
    await prisma.billing.update({
      where: { id: paid.billingId },
      data: {
        statusBayar: 'Lunas',
        tanggalBayar: paid.payDate,
        cashflowId: paid.cashflowId,
      },
    });
  }
  console.log(`   ✅ Updated ${paidBillings.length} paid billings\n`);

  // 11. CREATE PAYROLLS
  console.log('11. Creating payrolls...');
  const payrollData: Array<{
    employeeId: string;
    periode: string;
    jenisPembayaran: string;
    jumlah: number;
    status: string;
  }> = [];

  for (const m of months) {
    for (const emp of employees) {
      const total = emp.gajiPokok + 500000;
      payrollData.push({
        employeeId: emp.id,
        periode: m,
        jenisPembayaran: 'Gaji',
        jumlah: total,
        status: 'Lunas',
      });
    }
  }

  const payrollChunks = chunkArray(payrollData, BATCH_SIZE);
  for (const chunk of payrollChunks) {
    await prisma.payroll.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${payrollData.length} payrolls\n`);

  // 12. PREPARE JOURNAL ENTRIES (Two-phase: Entries first, then Lines)
  console.log('12. Preparing journal entries...');
  const journalEntries: Array<{
    id: string;
    tanggal: Date;
    keterangan: string;
    status: string;
    reference: string;
  }> = [];

  const journalLines: Array<{
    id: string;
    journalEntryId: string;
    kodeAkun: string;
    debit: number;
    kredit: number;
  }> = [];

  for (const cf of cashflowData) {
    const isIncoming = cf.debit > 0;
    let contraAccount = '101';

    if (isIncoming) {
      contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ''] || '406';
    } else {
      contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ''] || '502';
    }

    const entryId = createId();

    // Create journal entry
    journalEntries.push({
      id: entryId,
      tanggal: cf.tanggal,
      keterangan: cf.keterangan,
      status: 'posted',
      reference: cf.id,
    });

    // Create journal lines (2 per entry)
    journalLines.push(
      { id: createId(), journalEntryId: entryId, kodeAkun: cf.kodeAkun, debit: cf.debit, kredit: cf.kredit },
      { id: createId(), journalEntryId: entryId, kodeAkun: contraAccount, debit: cf.kredit, kredit: cf.debit }
    );
  }

  // 13. BULK INSERT JOURNAL ENTRIES
  console.log(`   Inserting ${journalEntries.length} journal entries...`);
  const entryChunks = chunkArray(journalEntries, BATCH_SIZE);
  for (const chunk of entryChunks) {
    await prisma.journalEntry.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${journalEntries.length} journal entries\n`);

  // 14. BULK INSERT JOURNAL ENTRY LINES
  console.log(`   Inserting ${journalLines.length} journal entry lines...`);
  const lineChunks = chunkArray(journalLines, BATCH_SIZE);
  for (const chunk of lineChunks) {
    await prisma.journalEntryLine.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${journalLines.length} journal entry lines\n`);

  // 15. CREATE ASSETS
  console.log('15. Creating assets...');
  const assetData = [
    { kodeAkun: '107', nama: 'Lahan Sekolah Utama', kategori: 'Tanah', tanggalPerolehan: new Date('2020-01-01'), hargaPerolehan: 500000000, status: 'Active', umurTeknis: 0 },
    { kodeAkun: '108', nama: 'Gedung Sayap Timur', kategori: 'Gedung', tanggalPerolehan: new Date('2021-05-10'), hargaPerolehan: 1000000000, status: 'Active', umurTeknis: 20 },
    { kodeAkun: '110', nama: 'MacBook Air M2 (Admin)', kategori: 'Peralatan', tanggalPerolehan: new Date('2024-11-20'), hargaPerolehan: 18000000, status: 'Active', umurTeknis: 5 },
  ];
  await prisma.asset.createMany({ data: assetData });
  console.log(`   ✅ Created ${assetData.length} assets\n`);

  // 16. CREATE DEBT
  console.log('16. Creating debts...');
  await prisma.debt.create({
    data: {
      kodeAkun: '201',
      nama: 'Pinjaman Modal Kerja Bank',
      kreditur: 'Bank Mandiri',
      jumlahAwal: 200000000,
      jumlahSisa: 180000000,
      tenor: 24,
      tanggalMulai: new Date('2025-01-01'),
      tanggalJatuhTempo: new Date('2027-01-01'),
      cicilanPerBulan: 10000000,
      status: 'Aktif',
    },
  });
  console.log('   ✅ Created 1 debt\n');

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('✅ Seeding complete!');
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('\n📊 Summary:');
  console.log(`   - Accounts: ${ACCOUNTS.length}`);
  console.log(`   - Students: ${students.length}`);
  console.log(`   - Employees: ${employees.length}`);
  console.log(`   - Billings: ${billings.length}`);
  console.log(`   - Cashflows: ${cashflowData.length}`);
  console.log(`   - Journal Entries: ${journalEntries.length}`);
  console.log(`   - Journal Entry Lines: ${journalLines.length}`);
  console.log(`   - Payrolls: ${payrollData.length}`);
  console.log(`   - Assets: ${assetData.length}`);
  console.log(`   - Debts: 1`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
