import 'dotenv/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaClient, Prisma } from '@prisma/client';
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

// Chart of Accounts (COA) - Indonesian School Finance Structure
const ACCOUNTS = [
  // AKTIVA LANCAR (Current Assets) - 101-106
  { kodeAkun: '101', namaAkun: 'Kas', tipeAkun: 'Asset', saldo: 50000000, kategori: 'Kas' },
  { kodeAkun: '102', namaAkun: 'Bank', tipeAkun: 'Asset', saldo: 100000000, kategori: 'Bank' },
  { kodeAkun: '103', namaAkun: 'Piutang Siswa', tipeAkun: 'Asset', saldo: 25000000, kategori: 'Piutang' },
  { kodeAkun: '104', namaAkun: 'Piutang Lain-Lain', tipeAkun: 'Asset', saldo: 5000000, kategori: 'Piutang' },
  { kodeAkun: '105', namaAkun: 'Piutang Periode Sebelumnya', tipeAkun: 'Asset', saldo: 10000000, kategori: 'Piutang' },
  { kodeAkun: '106', namaAkun: 'Biaya Dibayar Dimuka', tipeAkun: 'Asset', saldo: 2000000, kategori: 'Lancar Lainnya' },
  
  // AKTIVA TETAP (Fixed Assets) - 107-111
  { kodeAkun: '107', namaAkun: 'Tanah', tipeAkun: 'Asset', saldo: 500000000, kategori: 'Aset Tetap' },
  { kodeAkun: '108', namaAkun: 'Gedung', tipeAkun: 'Asset', saldo: 1000000000, kategori: 'Aset Tetap' },
  { kodeAkun: '109', namaAkun: 'Kendaraan', tipeAkun: 'Asset', saldo: 150000000, kategori: 'Aset Tetap' },
  { kodeAkun: '110', namaAkun: 'Peralatan Kantor', tipeAkun: 'Asset', saldo: 50000000, kategori: 'Aset Tetap' },
  { kodeAkun: '111', namaAkun: 'Akumulasi Penyusutan Aktiva Tetap', tipeAkun: 'Asset', saldo: -100000000, kategori: 'Akumulasi Penyusutan', isContra: true },
  
  // KEWAJIBAN (Liabilities) - 200-201
  { kodeAkun: '200', namaAkun: 'Hutang Usaha', tipeAkun: 'Liability', saldo: 5000000, kategori: 'Hutang Lancar' },
  { kodeAkun: '201', namaAkun: 'Hutang Lancar', tipeAkun: 'Liability', saldo: 200000000, kategori: 'Hutang Bank' },
  
  // MODAL (Equity) - 300-304
  { kodeAkun: '300', namaAkun: 'Setoran Modal Pemilik', tipeAkun: 'Equity', saldo: 1500000000, kategori: 'Modal' },
  { kodeAkun: '301', namaAkun: 'Modal Awal', tipeAkun: 'Equity', saldo: 500000000, kategori: 'Modal' },
  { kodeAkun: '302', namaAkun: 'Laba (Rugi) Periode Sebelumnya', tipeAkun: 'Equity', saldo: 200000000, kategori: 'Laba' },
  { kodeAkun: '303', namaAkun: 'Laba (Rugi) Periode Berjalan', tipeAkun: 'Equity', saldo: 100000000, kategori: 'Laba' },
  { kodeAkun: '304', namaAkun: 'Prive', tipeAkun: 'Equity', saldo: 0, kategori: 'Prive' },
  
  // PENDAPATAN (Revenue) - 400-407
  { kodeAkun: '400', namaAkun: 'Penerimaan Dana Pendaftaran', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '401', namaAkun: 'Penerimaan Uang Gedung', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '402', namaAkun: 'Penerimaan Uang Kegiatan', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '403', namaAkun: 'Penerimaan Uang Seragam', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '404', namaAkun: 'Penerimaan Uang ATK', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '405', namaAkun: 'Penerimaan Uang SPP', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '406', namaAkun: 'Pendapatan Lain-Lain', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  { kodeAkun: '407', namaAkun: 'Penerimaan piutang siswa', tipeAkun: 'Revenue', saldo: 0, kategori: 'Pendapatan' },
  
  // BIAYA/BEBAN (Expenses) - 500-522
  { kodeAkun: '500', namaAkun: 'Biaya Gaji', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '501', namaAkun: 'Biaya Tunjangan', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '502', namaAkun: 'Biaya ATK Kantor', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Administrasi' },
  { kodeAkun: '503', namaAkun: 'Biaya UKS', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '504', namaAkun: 'Biaya Listrik, Internet dan Telepon', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Utilitas' },
  { kodeAkun: '505', namaAkun: 'Biaya iuran - iuran', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Lainnya' },
  { kodeAkun: '506', namaAkun: 'Biaya Kebersihan & Kemanan Kantor', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '507', namaAkun: 'Biaya bahan bakar', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '508', namaAkun: 'Biaya Admin bank', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Administrasi' },
  { kodeAkun: '509', namaAkun: 'Biaya PPDB', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Pemasaran' },
  { kodeAkun: '510', namaAkun: 'Biaya Konsumsi', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '511', namaAkun: 'Biaya Jamuan dan Resepresntasi lainya', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '512', namaAkun: 'Biaya Kegiatan Kesiswaan', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '513', namaAkun: 'Biaya Peningkatan SDM', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '514', namaAkun: 'Biaya Parenting', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '515', namaAkun: 'Biaya Pemasaran', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Pemasaran' },
  { kodeAkun: '516', namaAkun: 'Biaya sarana dan prasarana', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '517', namaAkun: 'Biaya sewa', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '518', namaAkun: 'Biaya Perpustakaan', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
  { kodeAkun: '519', namaAkun: 'Biaya owner', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Prive' },
  { kodeAkun: '520', namaAkun: 'Biaya Seragam Siswa', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Persediaan' },
  { kodeAkun: '521', namaAkun: 'Biaya ATK Siswa', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Persediaan' },
  { kodeAkun: '522', namaAkun: 'Biaya Gedung', tipeAkun: 'Expense', saldo: 0, kategori: 'Beban Operasional' },
];

// Fee structure per class
const CLASS_FEE_MAP: Record<string, Record<string, number>> = {
  PLAYGROUP: { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 500000, SPP: 550000, Konsumsi: 300000 },
  KINDERGARTEN: { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 550000, Konsumsi: 300000 },
  '1': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 650000, Konsumsi: 350000 },
  '2': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 650000, Konsumsi: 350000 },
  '3': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 700000, Konsumsi: 400000 },
  '4': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 700000, Konsumsi: 400000 },
  '5': { Pendaftaran: 350000, Gedung: 8000000, Kegiatan: 2000000, Seragam: 800000, ATK: 1000000, SPP: 750000, Konsumsi: 450000 },
};

// Map categories to account codes - Complete mapping for all COA accounts
const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  // PENDAPATAN (Revenue) - 400-407
  'Pendaftaran': '400',
  'Penerimaan Dana Pendaftaran': '400',
  'Uang Gedung': '401',
  'Penerimaan Uang Gedung': '401',
  'Gedung': '401',
  'Kegiatan': '402',
  'Penerimaan Uang Kegiatan': '402',
  'Seragam': '403',
  'Penerimaan Uang Seragam': '403',
  'ATK': '404',
  'Penerimaan Uang ATK': '404',
  'SPP': '405',
  'Penerimaan Uang SPP': '405',
  'Pendapatan Lain-Lain': '406',
  'Konsumsi': '406', // Student billing for konsumsi goes to revenue
  'Uang Konsumsi': '406',
  'Penerimaan Konsumsi': '406',
  'Piutang': '407',
  'Penerimaan piutang siswa': '407',
  
  // BIAYA/BEBAN (Expenses) - 500-522
  'Gaji': '500',
  'Biaya Gaji': '500',
  'Tunjangan': '501',
  'Biaya Tunjangan': '501',
  'Biaya ATK Kantor': '502',
  'ATK Kantor': '502',
  'Biaya UKS': '503',
  'UKS': '503',
  'Listrik': '504',
  'Biaya Listrik, Internet dan Telepon': '504',
  'Biaya iuran - iuran': '505',
  'Biaya Kebersihan & Kemanan Kantor': '506',
  'Biaya bahan bakar': '507',
  'Bahan bakar': '507',
  'Biaya Admin bank': '508',
  'Admin bank': '508',
  'Biaya PPDB': '509',
  'PPDB': '509',
  'Biaya Konsumsi': '510', // School expense for food/catering
  'Biaya Jamuan dan Resepresntasi lainya': '511',
  'Biaya Kegiatan Kesiswaan': '512',
  'Biaya Peningkatan SDM': '513',
  'Biaya Parenting': '514',
  'Biaya Pemasaran': '515',
  'Biaya sarana dan prasarana': '516',
  'Sarpras': '516',
  'Biaya sewa': '517',
  'Biaya Perpustakaan': '518',
  'Biaya owner': '519',
  'Biaya Seragam Siswa': '520',
  'Biaya ATK Siswa': '521',
  'Biaya Gedung': '522',
};

const MONTHS_2025 = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];
const MONTHS_2026 = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const ALL_MONTHS = [...MONTHS_2025, ...MONTHS_2026];

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

function generateNIS(year: number, index: number): string {
  return `${year}${String(index + 1).padStart(4, '0')}`;
}

function generatePhone(): string {
  return `08${Math.floor(Math.random() * 10000000000).toString().padStart(10, '0').slice(0, 10)}`;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('🌱 Starting comprehensive seeding...\n');

  // 1. CLEAN ALL DATA
  console.log('1. Cleaning existing data...');
  await prisma.journalEntryLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.cashflow.deleteMany();
  await prisma.billing.deleteMany();
  await prisma.installment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.account.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.period.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditTrail.deleteMany();
  await prisma.snapshot.deleteMany();
  console.log('   ✅ Data cleaned\n');

  // 2. CREATE ACCOUNTS
  console.log('2. Creating accounts...');
  await prisma.account.createMany({ data: ACCOUNTS });
  console.log(`   ✅ Created ${ACCOUNTS.length} accounts\n`);

  // 3. CREATE ACADEMIC YEARS
  console.log('3. Creating academic years...');
  const academicYears = await prisma.$transaction([
    prisma.academicYear.create({
      data: {
        tahunAjaran: '2024/2025',
        tanggalMulai: new Date('2024-07-01'),
        tanggalSelesai: new Date('2025-06-30'),
        isActive: false,
        isArchived: true,
      },
    }),
    prisma.academicYear.create({
      data: {
        tahunAjaran: '2025/2026',
        tanggalMulai: new Date('2025-07-01'),
        tanggalSelesai: new Date('2026-06-30'),
        isActive: true,
      },
    }),
    prisma.academicYear.create({
      data: {
        tahunAjaran: '2026/2027',
        tanggalMulai: new Date('2026-07-01'),
        tanggalSelesai: new Date('2027-06-30'),
        isActive: false,
      },
    }),
  ]);
  const activeAcademicYear = academicYears[1];
  console.log(`   ✅ Created ${academicYears.length} academic years\n`);

  // 4. CREATE PERIODS (for all months)
  console.log('4. Creating periods...');
  const periodData = [];
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  for (const year of [2024, 2025, 2026]) {
    for (let month = 0; month < 12; month++) {
      const kode = `${year}-${String(month + 1).padStart(2, '0')}`;
      const tanggalMulai = new Date(year, month, 1);
      const tanggalAkhir = new Date(year, month + 1, 0, 23, 59, 59);
      
      periodData.push({
        kode,
        nama: `${monthNames[month]} ${year}`,
        tahun: year,
        bulan: month + 1,
        status: year === 2025 ? 'open' : 'archived',
        tanggalMulai,
        tanggalAkhir,
      });
    }
  }
  
  const periodChunks = chunkArray(periodData, BATCH_SIZE);
  for (const chunk of periodChunks) {
    await prisma.period.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${periodData.length} periods\n`);

  // 5. CREATE STUDENTS (40 students with varied statuses)
  console.log('5. Creating students...');
  const studentNames = [
    'Ahmad Fauzi', 'Siti Aminah', 'Muhammad Rizki', 'Abdul Hakim', 'Fatima Zahra',
    'Rendi Pangestu', 'Dewi Lestari', 'Budi Hartono', 'Anisa Fitri', 'Eko Saputra',
    'Lestari Putri', 'Aditya Pratama', 'Santi Kurnia', 'Hendra Wijaya', 'Maya Indah',
    'Robi Setiawan', 'Nina Marlina', 'Fajar Sidik', 'Rina Widya', 'Diki Wahyudi',
    'Putri Amanda', 'Rafael Sitompul', 'Citra Kirana', 'Bagas Pratama', 'Dina Amelia',
    'Yusuf Mansur', 'Aisyah Humairah', 'Zaki Mubarak', 'Luna Safitri', 'Reza Pahlevi',
    'Nadia Salsabila', 'Fahri Hamzah', 'Intan Permata', 'Gilang Ramadhan', 'Rani Puspitasari',
    'Bayu Aji', 'Salsabila Anwar', 'Daffa Kurniawan', 'Marsha Andriani', 'Bima Sakti'
  ];
  
  const classes = ['PLAYGROUP', 'KINDERGARTEN', '1', '2', '3', '4', '5'];
  
  const studentData = studentNames.map((name, i) => ({
    nis: generateNIS(2025, i),
    nama: name,
    jenisKelamin: i % 2 === 0 ? 'L' : 'P',
    kelas: classes[i % classes.length],
    tahunMasuk: i < 20 ? 2025 : 2024,
    tahunAjaran: i < 20 ? '2025/2026' : '2024/2025',
    namaOrtu: `Orang Tua ${name.split(' ')[0]}`,
    noTelp: generatePhone(),
    statusBayar: i % 3 === 0 ? 'Lunas' : 'Belum Lunas',
    status: i < 35 ? 'Active' : 'Inactive',
    totalTagihan: 0,
    totalBayar: 0,
  }));

  await prisma.student.createMany({ data: studentData });
  const students = await prisma.student.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${students.length} students\n`);

  // 6. CREATE EMPLOYEES (10 employees with varied positions)
  console.log('6. Creating employees...');
  const employeeData = [
    { nip: 'E001', nama: 'Dr. Sarah Amalia, M.Pd', jabatan: 'Kepala Sekolah', jenisKelamin: 'P', gajiPokok: 15000000, tanggalMasuk: new Date('2020-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Merdeka No. 1, Jakarta' },
    { nip: 'E002', nama: 'Ahmad Sudirman, S.Pd', jabatan: 'Wakil Kepala Sekolah', jenisKelamin: 'L', gajiPokok: 12000000, tanggalMasuk: new Date('2020-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Sudirman No. 23, Jakarta' },
    { nip: 'E003', nama: 'Siti Rahayu, S.Pd', jabatan: 'Guru', jenisKelamin: 'P', gajiPokok: 8000000, tanggalMasuk: new Date('2021-07-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Gatot Subroto No. 45, Jakarta' },
    { nip: 'E004', nama: 'Budi Santoso, S.Pd', jabatan: 'Guru', jenisKelamin: 'L', gajiPokok: 8000000, tanggalMasuk: new Date('2021-07-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Thamrin No. 67, Jakarta' },
    { nip: 'E005', nama: 'Dewi Kusuma, S.Pd', jabatan: 'Guru', jenisKelamin: 'P', gajiPokok: 7500000, tanggalMasuk: new Date('2022-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Rasuna Said No. 89, Jakarta' },
    { nip: 'E006', nama: 'Rini Agustina', jabatan: 'Admin', jenisKelamin: 'P', gajiPokok: 6000000, tanggalMasuk: new Date('2020-03-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Senayan No. 12, Jakarta' },
    { nip: 'E007', nama: 'Agus Wijaya', jabatan: 'Staff', jenisKelamin: 'L', gajiPokok: 5500000, tanggalMasuk: new Date('2021-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Blok M No. 34, Jakarta' },
    { nip: 'E008', nama: 'Sukiman', jabatan: 'Kebersihan', jenisKelamin: 'L', gajiPokok: 3500000, tanggalMasuk: new Date('2020-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Cilandak No. 56, Jakarta' },
    { nip: 'E009', nama: 'Rohaya', jabatan: 'Kebersihan', jenisKelamin: 'P', gajiPokok: 3500000, tanggalMasuk: new Date('2021-06-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Fatmawati No. 78, Jakarta' },
    { nip: 'E010', nama: 'Joko Santoso', jabatan: 'Satpam', jenisKelamin: 'L', gajiPokok: 4000000, tanggalMasuk: new Date('2020-01-01'), status: 'Active', noTelp: generatePhone(), alamat: 'Jl. Radio Dalam No. 90, Jakarta' },
  ];
  await prisma.employee.createMany({ data: employeeData });
  const employees = await prisma.employee.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${employees.length} employees\n`);

  // 7. PREPARE BILLINGS DATA
  console.log('7. Preparing billing data...');
  const billingData: Array<{
    id?: string;
    studentId: string;
    academicYearId: string;
    jenisBiaya: string;
    periodeBulan: string;
    jumlah: number;
    statusBayar: string;
    tanggalBayar?: Date;
  }> = [];

  for (const student of students) {
    if (student.status === 'Inactive') continue;
    
    const fees = CLASS_FEE_MAP[student.kelas] || CLASS_FEE_MAP['1'];
    const academicYearId = student.tahunAjaran === '2025/2026' ? activeAcademicYear.id : academicYears[0].id;

    // Initial fees for July (only for new students 2025)
    if (student.tahunMasuk === 2025) {
      const initialFees = [
        { type: 'Pendaftaran', amount: fees.Pendaftaran },
        { type: 'Uang Gedung', amount: fees.Gedung },
        { type: 'Seragam', amount: fees.Seragam },
        { type: 'ATK', amount: fees.ATK },
      ];

      for (const fee of initialFees) {
        const isPaid = Math.random() < 0.8;
        billingData.push({
          studentId: student.id,
          academicYearId,
          jenisBiaya: fee.type,
          periodeBulan: '2025-07',
          jumlah: fee.amount,
          statusBayar: isPaid ? 'Lunas' : 'Belum Lunas',
          tanggalBayar: isPaid ? new Date(`2025-07-${1 + Math.floor(Math.random() * 20)}`) : undefined,
        });
      }
    }

    // Monthly SPP and Konsumsi
    for (const m of ALL_MONTHS) {
      const prob = m.startsWith('2026') ? 0.3 : 0.7;
      const isPaid = Math.random() < prob;
      
      // SPP
      billingData.push({
        studentId: student.id,
        academicYearId,
        jenisBiaya: 'SPP',
        periodeBulan: m,
        jumlah: fees.SPP,
        statusBayar: isPaid ? 'Lunas' : 'Belum Lunas',
        tanggalBayar: isPaid ? new Date(`${m}-${10 + Math.floor(Math.random() * 15)}`) : undefined,
      });

      // Konsumsi
      const konsumsiPaid = Math.random() < prob;
      billingData.push({
        studentId: student.id,
        academicYearId,
        jenisBiaya: 'Konsumsi',
        periodeBulan: m,
        jumlah: fees.Konsumsi,
        statusBayar: konsumsiPaid ? 'Lunas' : 'Belum Lunas',
        tanggalBayar: konsumsiPaid ? new Date(`${m}-${10 + Math.floor(Math.random() * 15)}`) : undefined,
      });
    }
  }

  // Insert billings in batches
  console.log(`   Inserting ${billingData.length} billings in batches...`);
  const billingChunks = chunkArray(billingData, BATCH_SIZE);
  for (const chunk of billingChunks) {
    await prisma.billing.createMany({ data: chunk });
  }
  const billings = await prisma.billing.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${billings.length} billings\n`);

  // 8. CREATE INSTALLMENTS for some unpaid billings
  console.log('8. Creating installments...');
  const unpaidBillings = billings.filter(b => b.statusBayar === 'Belum Lunas' && b.jenisBiaya === 'Uang Gedung');
  const installmentData = [];
  
  for (const billing of unpaidBillings.slice(0, 10)) {
    const jumlahCicilan = Math.ceil(billing.jumlah / 3);
    for (let i = 1; i <= 3; i++) {
      const dueDate = new Date(billing.periodeBulan + '-28');
      dueDate.setMonth(dueDate.getMonth() + i - 1);
      
      installmentData.push({
        studentId: billing.studentId,
        billingId: billing.id,
        cicilanKe: i,
        jumlah: jumlahCicilan,
        tanggalJatuhTempo: dueDate,
        status: i === 1 ? 'Belum Bayar' : 'Belum Bayar',
      });
    }
  }
  
  if (installmentData.length > 0) {
    const installmentChunks = chunkArray(installmentData, BATCH_SIZE);
    for (const chunk of installmentChunks) {
      await prisma.installment.createMany({ data: chunk });
    }
  }
  console.log(`   ✅ Created ${installmentData.length} installments\n`);

  // 9. PREPARE CASHFLOW DATA
  console.log('9. Preparing cashflow data...');
  const cashflowData: Array<{
    id: string;
    tanggal: Date;
    keterangan: string;
    kodeAkun: string;
    kategori: string | null;
    debit: number;
    kredit: number;
    status: string;
    periode: string;
    source: string;
  }> = [];

  // Process billings into cashflows
  for (const billing of billings.filter(b => b.statusBayar === 'Lunas' && b.tanggalBayar)) {
    cashflowData.push({
      id: createId(),
      tanggal: billing.tanggalBayar!,
      keterangan: `Pembayaran ${billing.jenisBiaya}`,
      kodeAkun: '101', // Kas
      kategori: billing.jenisBiaya,
      debit: billing.jumlah,
      kredit: 0,
      status: 'posted',
      periode: billing.periodeBulan,
      source: 'kas',
    });
  }

  // Add payroll expenses
  for (const m of MONTHS_2025) {
    for (const emp of employees) {
      const totalGaji = emp.gajiPokok + 500000 + (emp.jabatan === 'Guru' ? 500000 : 0);
      const payDate = new Date(`${m}-25`);

      cashflowData.push({
        id: createId(),
        tanggal: payDate,
        keterangan: `Gaji ${emp.jabatan} - ${emp.nama}`,
        kodeAkun: '101',
        kategori: 'Gaji',
        debit: 0,
        kredit: totalGaji,
        status: 'posted',
        periode: m,
        source: 'kas',
      });

      // Tunjangan for some employees
      if (emp.jabatan === 'Kepala Sekolah' || emp.jabatan === 'Wakil Kepala Sekolah') {
        cashflowData.push({
          id: createId(),
          tanggal: payDate,
          keterangan: `Tunjangan Jabatan - ${emp.nama}`,
          kodeAkun: '101',
          kategori: 'Tunjangan',
          debit: 0,
          kredit: 2000000,
          status: 'posted',
          periode: m,
          source: 'kas',
        });
      }
    }

    // Monthly utilities and expenses
    cashflowData.push({
      id: createId(),
      tanggal: new Date(`${m}-05`),
      keterangan: `Pembayaran Listrik & Internet`,
      kodeAkun: '101',
      kategori: 'Listrik',
      debit: 0,
      kredit: 1500000 + Math.random() * 500000,
      status: 'posted',
      periode: m,
      source: 'kas',
    });

    cashflowData.push({
      id: createId(),
      tanggal: new Date(`${m}-10`),
      keterangan: `Pembayaran ATK Kantor`,
      kodeAkun: '101',
      kategori: 'ATK',
      debit: 0,
      kredit: 800000 + Math.random() * 400000,
      status: 'posted',
      periode: m,
      source: 'kas',
    });

    cashflowData.push({
      id: createId(),
      tanggal: new Date(`${m}-15`),
      keterangan: `Biaya Konsumsi Rapat`,
      kodeAkun: '101',
      kategori: 'Konsumsi',
      debit: 0,
      kredit: 600000 + Math.random() * 300000,
      status: 'posted',
      periode: m,
      source: 'kas',
    });

    cashflowData.push({
      id: createId(),
      tanggal: new Date(`${m}-18`),
      keterangan: `Biaya Transportasi`,
      kodeAkun: '101',
      kategori: 'Biaya bahan bakar',
      debit: 0,
      kredit: 1000000 + Math.random() * 500000,
      status: 'posted',
      periode: m,
      source: 'kas',
    });

    // Pemeliharaan (occasional)
    if (Math.random() < 0.3) {
      cashflowData.push({
        id: createId(),
        tanggal: new Date(`${m}-22`),
        keterangan: `Biaya Pemeliharaan Gedung`,
        kodeAkun: '101',
        kategori: 'Biaya sarana dan prasarana',
        debit: 0,
        kredit: 2000000 + Math.random() * 3000000,
        status: 'posted',
        periode: m,
        source: 'kas',
      });
    }
  }

  // Insert cashflows
  console.log(`   Inserting ${cashflowData.length} cashflows...`);
  const cashflowChunks = chunkArray(cashflowData, BATCH_SIZE);
  for (const chunk of cashflowChunks) {
    await prisma.cashflow.createMany({ data: chunk });
  }
  const createdCashflows = await prisma.cashflow.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Created ${createdCashflows.length} cashflows\n`);

  // 10. CREATE TRANSFERS (Mutasi Kas-Bank) - Journal Entries
  console.log('10. Creating transfer records...');
  const transferData = [];
  for (let i = 0; i < 10; i++) {
    const m = MONTHS_2025[i % MONTHS_2025.length];
    const isBankToKas = i % 2 === 0;
    
    transferData.push({
      tanggal: new Date(`${m}-${5 + i * 2}`),
      keterangan: `Transfer ${isBankToKas ? 'Bank ke Kas' : 'Kas ke Bank'} #${i + 1}`,
      status: 'posted',
      reference: `TRF-${2025}${String(i + 1).padStart(3, '0')}`,
    });
  }
  
  // Create journal entries for transfers
  const transferJournals = [];
  for (const transfer of transferData) {
    const entryId = createId();
    transferJournals.push({
      id: entryId,
      tanggal: transfer.tanggal,
      keterangan: transfer.keterangan,
      status: 'posted',
      reference: transfer.reference,
    });
  }
  
  if (transferJournals.length > 0) {
    await prisma.journalEntry.createMany({ data: transferJournals });
  }
  console.log(`   ✅ Created ${transferData.length} transfer records\n`);

  // 11. CREATE PAYROLLS
  console.log('11. Creating payrolls...');
  const payrollData: Array<{
    employeeId: string;
    periode: string;
    jenisPembayaran: string;
    jumlah: number;
    status: string;
    tanggalBayar?: Date;
    keterangan?: string;
  }> = [];

  for (const m of ALL_MONTHS) {
    for (const emp of employees) {
      // Gaji Pokok
      const totalGaji = emp.gajiPokok + 500000;
      const isPaid = m.startsWith('2025-07') || m.startsWith('2025-08') || m.startsWith('2025-09') || m.startsWith('2025-10');
      
      payrollData.push({
        employeeId: emp.id,
        periode: m,
        jenisPembayaran: 'Gaji',
        jumlah: totalGaji,
        status: isPaid ? 'Lunas' : 'Belum Bayar',
        tanggalBayar: isPaid ? new Date(`${m}-25`) : undefined,
        keterangan: 'Gaji pokok + tunjangan transport',
      });

      // Bonus THR for June
      if (m === '2025-06' || m === '2026-06') {
        payrollData.push({
          employeeId: emp.id,
          periode: m,
          jenisPembayaran: 'Bonus',
          jumlah: emp.gajiPokok,
          status: 'Lunas',
          tanggalBayar: new Date(`${m}-20`),
          keterangan: 'THR',
        });
      }
    }
  }

  const payrollChunks = chunkArray(payrollData, BATCH_SIZE);
  for (const chunk of payrollChunks) {
    await prisma.payroll.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${payrollData.length} payrolls\n`);

  // 12. PREPARE JOURNAL ENTRIES
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

  // Create journal entries for cashflows
  for (const cf of createdCashflows) {
    const isIncoming = cf.debit > 0;
    let contraAccount = '101';

    if (isIncoming) {
      contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ''] || '406';
    } else {
      contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ''] || '520';
    }

    const entryId = createId();

    journalEntries.push({
      id: entryId,
      tanggal: cf.tanggal,
      keterangan: cf.keterangan,
      status: 'posted',
      reference: cf.id,
    });

    journalLines.push(
      { id: createId(), journalEntryId: entryId, kodeAkun: cf.kodeAkun, debit: cf.debit, kredit: cf.kredit },
      { id: createId(), journalEntryId: entryId, kodeAkun: contraAccount, debit: cf.kredit, kredit: cf.debit }
    );
  }

  // Create journal entries for transfers
  for (let i = 0; i < transferData.length; i++) {
    const transfer = transferData[i];
    const entryId = transferJournals[i]?.id || createId();
    const isBankToKas = transfer.keterangan.includes('Bank ke Kas');
    
    journalLines.push(
      { 
        id: createId(), 
        journalEntryId: entryId, 
        kodeAkun: isBankToKas ? '101' : '102', 
        debit: 7500000,
        kredit: 0 
      },
      { 
        id: createId(), 
        journalEntryId: entryId, 
        kodeAkun: isBankToKas ? '102' : '101', 
        debit: 0, 
        kredit: 7500000 
      }
    );
  }

  // Insert journal entries
  console.log(`   Inserting ${journalEntries.length} journal entries...`);
  const entryChunks = chunkArray(journalEntries, BATCH_SIZE);
  for (const chunk of entryChunks) {
    await prisma.journalEntry.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${journalEntries.length} journal entries\n`);

  // Insert journal lines
  console.log(`   Inserting ${journalLines.length} journal entry lines...`);
  const lineChunks = chunkArray(journalLines, BATCH_SIZE);
  for (const chunk of lineChunks) {
    await prisma.journalEntryLine.createMany({ data: chunk });
  }
  console.log(`   ✅ Created ${journalLines.length} journal entry lines\n`);

  // 13. CREATE ASSETS
  console.log('13. Creating assets...');
  const assetData = [
    { kodeAkun: '107', nama: 'Lahan Sekolah Utama', kategori: 'Tanah', lokasi: 'Jakarta Selatan', tanggalPerolehan: new Date('2018-01-15'), hargaPerolehan: 500000000, nilaiResidu: 0, isTanah: true, umurTeknis: 0, status: 'Active' },
    { kodeAkun: '108', nama: 'Gedung Sayap Timur', kategori: 'Bangunan', lokasi: 'Jakarta Selatan', tanggalPerolehan: new Date('2019-05-10'), hargaPerolehan: 1000000000, nilaiResidu: 100000000, isTanah: false, umurTeknis: 20, status: 'Active' },
    { kodeAkun: '108', nama: 'Gedung Sayap Barat', kategori: 'Bangunan', lokasi: 'Jakarta Selatan', tanggalPerolehan: new Date('2020-03-20'), hargaPerolehan: 800000000, nilaiResidu: 80000000, isTanah: false, umurTeknis: 20, status: 'Active' },
    { kodeAkun: '109', nama: 'Toyota Hiace', kategori: 'Kendaraan', lokasi: 'Parkiran', tanggalPerolehan: new Date('2022-01-10'), hargaPerolehan: 450000000, nilaiResidu: 50000000, isTanah: false, umurTeknis: 8, status: 'Active' },
    { kodeAkun: '109', nama: 'Honda Brio', kategori: 'Kendaraan', lokasi: 'Parkiran', tanggalPerolehan: new Date('2023-06-15'), hargaPerolehan: 250000000, nilaiResidu: 25000000, isTanah: false, umurTeknis: 8, status: 'Active' },
    { kodeAkun: '110', nama: 'MacBook Air M2 (Admin)', kategori: 'Peralatan', lokasi: 'Ruang Admin', tanggalPerolehan: new Date('2024-11-20'), hargaPerolehan: 18000000, nilaiResidu: 2000000, isTanah: false, umurTeknis: 5, status: 'Active' },
    { kodeAkun: '110', nama: 'Printer Canon MF264dw', kategori: 'Peralatan', lokasi: 'Ruang Admin', tanggalPerolehan: new Date('2023-04-10'), hargaPerolehan: 5000000, nilaiResidu: 500000, isTanah: false, umurTeknis: 5, status: 'Active' },
    { kodeAkun: '110', nama: 'Proyektor Epson EB-X41', kategori: 'Peralatan', lokasi: 'Ruang Kelas A', tanggalPerolehan: new Date('2023-07-05'), hargaPerolehan: 7500000, nilaiResidu: 750000, isTanah: false, umurTeknis: 5, status: 'Active' },
  ];
  await prisma.asset.createMany({ data: assetData });
  console.log(`   ✅ Created ${assetData.length} assets\n`);

  // 14. CREATE DEBTS
  console.log('14. Creating debts...');
  const debtData = [
    {
      kodeAkun: '201',
      nama: 'Pinjaman Modal Kerja Bank Mandiri',
      kreditur: 'Bank Mandiri',
      jumlahAwal: 200000000,
      jumlahSisa: 150000000,
      tenor: 24,
      tanggalMulai: new Date('2025-01-01'),
      tanggalJatuhTempo: new Date('2027-01-01'),
      cicilanPerBulan: 8333333,
      status: 'Aktif',
    },
    {
      kodeAkun: '200',
      nama: 'Hutang Pembelian ATK',
      kreditur: 'PT Office Supplies',
      jumlahAwal: 5000000,
      jumlahSisa: 2500000,
      tenor: 2,
      tanggalMulai: new Date('2025-10-01'),
      tanggalJatuhTempo: new Date('2025-11-30'),
      cicilanPerBulan: 2500000,
      status: 'Aktif',
    },
  ];
  await prisma.debt.createMany({ data: debtData });
  console.log(`   ✅ Created ${debtData.length} debts\n`);

  // 15. CREATE NOTIFICATIONS
  console.log('15. Creating notifications...');
  const notificationData = [
    { tipe: 'approval_request', judul: 'Persetujuan Jurnal Entry', pesan: 'Terdapat 3 jurnal entry menunggu persetujuan', isRead: false, referenceId: 'journal-batch-1' },
    { tipe: 'piutang_jatuh_tempo', judul: 'Piutang Jatuh Tempo', pesan: '5 siswa memiliki tagihan yang akan jatuh tempo dalam 7 hari', isRead: false, referenceId: 'billing-due' },
    { tipe: 'hutang_jatuh_tempo', judul: 'Hutang Jatuh Tempo', pesan: 'Hutang bank mandiri akan jatuh tempo dalam 30 hari', isRead: false, referenceId: 'debt-1' },
    { tipe: 'payroll_reminder', judul: 'Pengingat Gaji', pesan: 'Gaji karyawan periode November 2025 belum diproses', isRead: true, referenceId: 'payroll-nov' },
    { tipe: 'penyusutan_reminder', judul: 'Penyusutan Bulanan', pesan: 'Jurnal penyusutan aset tetap perlu dicatat', isRead: false, referenceId: 'depreciation-nov' },
    { tipe: 'approval_request', judul: 'Persetujuan Transfer Kas', pesan: 'Transfer Kas ke Bank sebesar Rp 10.000.000 menunggu persetujuan', isRead: false, referenceId: 'transfer-1' },
    { tipe: 'piutang_jatuh_tempo', judul: 'Tagihan Overdue', pesan: '3 siswa memiliki tagihan overdue lebih dari 30 hari', isRead: false, referenceId: 'billing-overdue' },
    { tipe: 'system', judul: 'Backup Berhasil', pesan: 'Backup database otomatis berhasil dilakukan', isRead: true, referenceId: 'backup-daily' },
  ];
  await prisma.notification.createMany({ data: notificationData });
  console.log(`   ✅ Created ${notificationData.length} notifications\n`);

  // 16. CREATE AUDIT TRAIL ENTRIES
  console.log('16. Creating audit trail entries...');
  
  type AuditData = Record<string, string | number | boolean>;
  
  const auditTrailData: Array<{
    action: string;
    entity: string;
    entityId: string;
    oldData: AuditData | null;
    newData: AuditData | null;
    userId: string;
    ipAddress: string;
  }> = [
    { action: 'create', entity: 'cashflow', entityId: createdCashflows[0]?.id ?? 'cf-1', oldData: null, newData: { keterangan: 'Pembayaran SPP', jumlah: 650000 }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'update', entity: 'student', entityId: students[0]?.id ?? 'std-1', oldData: { nama: 'Ahmad' }, newData: { nama: 'Ahmad Fauzi' }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'delete', entity: 'billing', entityId: 'billing-old', oldData: { jumlah: 500000 }, newData: null, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'approve', entity: 'journal', entityId: journalEntries[0]?.id ?? 'je-1', oldData: { status: 'draft' }, newData: { status: 'approved' }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'post', entity: 'journal', entityId: journalEntries[0]?.id ?? 'je-1', oldData: { status: 'approved' }, newData: { status: 'posted' }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'create', entity: 'payroll', entityId: 'payroll-1', oldData: null, newData: { periode: '2025-10', jumlah: 8500000 }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'create', entity: 'asset', entityId: 'asset-1', oldData: null, newData: { nama: 'Lahan Sekolah', harga: 500000000 }, userId: 'admin-1', ipAddress: '192.168.1.1' },
    { action: 'create', entity: 'debt', entityId: 'debt-1', oldData: null, newData: { nama: 'Pinjaman Bank', jumlah: 200000000 }, userId: 'admin-1', ipAddress: '192.168.1.1' },
  ];
  
  await prisma.auditTrail.createMany({ 
    data: auditTrailData.map(d => ({
      ...d,
      oldData: d.oldData === null ? Prisma.JsonNull : d.oldData,
      newData: d.newData === null ? Prisma.JsonNull : d.newData,
    })) 
  });
  console.log(`   ✅ Created ${auditTrailData.length} audit trail entries\n`);

  // 17. CREATE SNAPSHOTS
  console.log('17. Creating snapshots...');
  const snapshotData = [
    { periode: '2025-07', tipe: 'neraca', data: { aset: 2500000000, kewajiban: 205000000, ekuitas: 2295000000 }, totalDebit: 2500000000, totalKredit: 2500000000, createdBy: 'admin-1' },
    { periode: '2025-07', tipe: 'labarugi', data: { pendapatan: 45000000, beban: 32000000, laba: 13000000 }, totalDebit: 45000000, totalKredit: 45000000, createdBy: 'admin-1' },
    { periode: '2025-08', tipe: 'neraca', data: { aset: 2520000000, kewajiban: 200000000, ekuitas: 2320000000 }, totalDebit: 2520000000, totalKredit: 2520000000, createdBy: 'admin-1' },
    { periode: '2025-08', tipe: 'labarugi', data: { pendapatan: 48000000, beban: 35000000, laba: 13000000 }, totalDebit: 48000000, totalKredit: 48000000, createdBy: 'admin-1' },
    { periode: '2025-09', tipe: 'neraca', data: { aset: 2540000000, kewajiban: 195000000, ekuitas: 2345000000 }, totalDebit: 2540000000, totalKredit: 2540000000, createdBy: 'admin-1' },
    { periode: '2025-09', tipe: 'labarugi', data: { pendapatan: 52000000, beban: 38000000, laba: 14000000 }, totalDebit: 52000000, totalKredit: 52000000, createdBy: 'admin-1' },
    { periode: '2025-10', tipe: 'neraca', data: { aset: 2560000000, kewajiban: 190000000, ekuitas: 2370000000 }, totalDebit: 2560000000, totalKredit: 2560000000, createdBy: 'admin-1' },
    { periode: '2025-10', tipe: 'labarugi', data: { pendapatan: 55000000, beban: 40000000, laba: 15000000 }, totalDebit: 55000000, totalKredit: 55000000, createdBy: 'admin-1' },
  ];
  await prisma.snapshot.createMany({ data: snapshotData });
  console.log(`   ✅ Created ${snapshotData.length} snapshots\n`);

  // 18. UPDATE STUDENT TOTALS
  console.log('18. Updating student totals...');
  for (const student of students) {
    const studentBillings = billings.filter(b => b.studentId === student.id);
    const totalTagihan = studentBillings.reduce((sum, b) => sum + b.jumlah, 0);
    const totalBayar = studentBillings.filter(b => b.statusBayar === 'Lunas').reduce((sum, b) => sum + b.jumlah, 0);
    
    await prisma.student.update({
      where: { id: student.id },
      data: { totalTagihan, totalBayar },
    });
  }
  console.log('   ✅ Updated student totals\n');

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('✅ Seeding complete!');
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('\n📊 Summary:');
  console.log(`   - Accounts: ${ACCOUNTS.length}`);
  console.log(`   - Academic Years: ${academicYears.length}`);
  console.log(`   - Periods: ${periodData.length}`);
  console.log(`   - Students: ${students.length}`);
  console.log(`   - Employees: ${employees.length}`);
  console.log(`   - Billings: ${billings.length}`);
  console.log(`   - Installments: ${installmentData.length}`);
  console.log(`   - Cashflows: ${createdCashflows.length}`);
  console.log(`   - Transfers: ${transferData.length}`);
  console.log(`   - Journal Entries: ${journalEntries.length}`);
  console.log(`   - Journal Entry Lines: ${journalLines.length}`);
  console.log(`   - Payrolls: ${payrollData.length}`);
  console.log(`   - Assets: ${assetData.length}`);
  console.log(`   - Debts: ${debtData.length}`);
  console.log(`   - Notifications: ${notificationData.length}`);
  console.log(`   - Audit Trails: ${auditTrailData.length}`);
  console.log(`   - Snapshots: ${snapshotData.length}`);
  console.log('\n🎯 All pages should now have sufficient test data!');
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

