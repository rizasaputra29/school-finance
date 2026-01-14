import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create Prisma client with pg adapter (same as src/lib/prisma.ts)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Complete Chart of Accounts matching Excel "AL MADEENA MASTER" exactly
const accounts = [
  // AKTIVA LANCAR (Current Assets)
  { kodeAkun: '101', namaAkun: 'Kas', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '102', namaAkun: 'Bank', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '103', namaAkun: 'Piutang Siswa', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '104', namaAkun: 'Piutang Lain-Lain', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '105', namaAkun: 'Piutang Periode Sebelumnya', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '106', namaAkun: 'Biaya Dibayar Dimuka', tipeAkun: 'Asset', saldo: 0 },
  
  // AKTIVA TETAP (Fixed Assets)
  { kodeAkun: '107', namaAkun: 'Tanah', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '108', namaAkun: 'Gedung', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '109', namaAkun: 'Kendaraan', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '110', namaAkun: 'Peralatan Kantor', tipeAkun: 'Asset', saldo: 0 },
  { kodeAkun: '111', namaAkun: 'Akumulasi Penyusutan Aktiva Tetap', tipeAkun: 'Asset', saldo: 0 },
  
  // KEWAJIBAN (Liabilities)
  { kodeAkun: '200', namaAkun: 'Hutang Usaha', tipeAkun: 'Liability', saldo: 0 },
  { kodeAkun: '201', namaAkun: 'Hutang Lancar', tipeAkun: 'Liability', saldo: 0 },
  
  // MODAL (Equity)
  { kodeAkun: '300', namaAkun: 'Setoran Modal Pemilik', tipeAkun: 'Equity', saldo: 0 },
  { kodeAkun: '301', namaAkun: 'Modal Awal', tipeAkun: 'Equity', saldo: 0 },
  { kodeAkun: '302', namaAkun: 'Laba (Rugi) Periode Sebelumnya', tipeAkun: 'Equity', saldo: 0 },
  { kodeAkun: '303', namaAkun: 'Laba (Rugi) Periode Berjalan', tipeAkun: 'Equity', saldo: 0 },
  { kodeAkun: '304', namaAkun: 'Prive', tipeAkun: 'Equity', saldo: 0 },
  
  // PENDAPATAN (Revenue)
  { kodeAkun: '400', namaAkun: 'Penerimaan Dana Pendaftaran', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '401', namaAkun: 'Penerimaan Uang Gedung', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '402', namaAkun: 'Penerimaan Uang Kegiatan', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '403', namaAkun: 'Penerimaan Uang Seragam', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '404', namaAkun: 'Penerimaan Uang ATK', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '405', namaAkun: 'Penerimaan Uang SPP', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '406', namaAkun: 'Pendapatan Lain-Lain', tipeAkun: 'Revenue', saldo: 0 },
  { kodeAkun: '407', namaAkun: 'Penerimaan piutang siswa', tipeAkun: 'Revenue', saldo: 0 },
  
  // BIAYA SPP (Expenses)
  { kodeAkun: '500', namaAkun: 'Biaya Gaji', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '501', namaAkun: 'Biaya Tunjangan', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '502', namaAkun: 'Biaya ATK Kantor', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '503', namaAkun: 'Biaya UKS', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '504', namaAkun: 'Biaya Listrik, Internet dan Telepon', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '505', namaAkun: 'Biaya iuran - iuran', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '506', namaAkun: 'Biaya Kebersihan & Kemanan Kantor', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '507', namaAkun: 'Biaya bahan bakar', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '508', namaAkun: 'Biaya Admin bank', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '509', namaAkun: 'Biaya PPDB', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '510', namaAkun: 'Biaya Konsumsi', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '511', namaAkun: 'Biaya Jamuan dan Resepresntasi lainya', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '512', namaAkun: 'Biaya Kegiatan Kesiswaan', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '513', namaAkun: 'Biaya Peningkatan SDM', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '514', namaAkun: 'Biaya Parenting', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '515', namaAkun: 'Biaya Pemasaran', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '516', namaAkun: 'Biaya sarana dan prasarana', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '517', namaAkun: 'Biaya sewa', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '518', namaAkun: 'Biaya Perpustakaan', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '519', namaAkun: 'Biaya owner', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '520', namaAkun: 'Biaya Seragam Siswa', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '521', namaAkun: 'Biaya ATK Siswa', tipeAkun: 'Expense', saldo: 0 },
  { kodeAkun: '522', namaAkun: 'Biaya Gedung', tipeAkun: 'Expense', saldo: 0 },
];

export const classFees: Record<string, Record<string, number>> = {
  PLAYGROUP: {
    Pendaftaran: 350000,
    Gedung: 8000000,
    Kegiatan: 2000000,
    Seragam: 800000,
    ATK: 500000,
    SPP: 550000,
  },
  KINDERGARTEN: {
    Pendaftaran: 350000,
    Gedung: 8000000,
    Kegiatan: 2000000,
    Seragam: 800000,
    ATK: 1000000,
    SPP: 550000,
  },
};

export const feeTypeToAccountCode: Record<string, string> = {
  Pendaftaran: '400',
  Gedung: '401',
  Kegiatan: '402',
  Seragam: '403',
  ATK: '404',
  SPP: '405',
};

async function main() {
  console.log('🌱 Seeding database with complete Chart of Accounts and Transactions...');

  // CLEANUP: Clean existing data to avoid conflicts
  console.log('Cleaning existing data...');
  await prisma.cashflow.deleteMany({});
  await prisma.billing.deleteMany({});
  await prisma.student.deleteMany({});
  
  // Create accounts
  console.log('Creating accounts...');
  for (const account of accounts) {
    await prisma.account.upsert({
      where: { kodeAkun: account.kodeAkun },
      update: { namaAkun: account.namaAkun, tipeAkun: account.tipeAkun },
      create: account,
    });
  }

  console.log(`\n✅ Seeding completed! Created sample data for the website.`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
