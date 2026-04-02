import 'dotenv/config';
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

async function verifyAccounts() {
  console.log('🔍 Verifying Journal Entry Distribution\n');
  
  // Get all journal lines grouped by account
  const linesByAccount = await prisma.journalEntryLine.groupBy({
    by: ['kodeAkun'],
    _sum: { debit: true, kredit: true },
  });
  
  // Get account details
  const accounts = await prisma.account.findMany({
    where: { tipeAkun: { in: ['Revenue', 'Expense'] } },
    orderBy: [{ tipeAkun: 'asc' }, { kodeAkun: 'asc' }],
  });
  
  const accountMap = new Map(accounts.map(a => [a.kodeAkun, a]));
  
  console.log('📈 REVENUE ACCOUNTS (400-407):');
  const revenueAccounts = accounts.filter(a => a.tipeAkun === 'Revenue');
  revenueAccounts.forEach(acc => {
    const line = linesByAccount.find(l => l.kodeAkun === acc.kodeAkun);
    const debit = line?._sum.debit || 0;
    const kredit = line?._sum.kredit || 0;
    const net = kredit - debit;
    if (net > 0) {
      console.log(`  ✅ ${acc.kodeAkun} - ${acc.namaAkun}: Rp ${net.toLocaleString('id-ID')}`);
    } else {
      console.log(`  ⚪ ${acc.kodeAkun} - ${acc.namaAkun}: Rp 0`);
    }
  });
  
  console.log('\n💸 EXPENSE ACCOUNTS (500-522):');
  const expenseAccounts = accounts.filter(a => a.tipeAkun === 'Expense');
  expenseAccounts.forEach(acc => {
    const line = linesByAccount.find(l => l.kodeAkun === acc.kodeAkun);
    const debit = line?._sum.debit || 0;
    const kredit = line?._sum.kredit || 0;
    const net = debit - kredit;
    if (net > 0) {
      console.log(`  ✅ ${acc.kodeAkun} - ${acc.namaAkun}: Rp ${net.toLocaleString('id-ID')}`);
    } else {
      console.log(`  ⚪ ${acc.kodeAkun} - ${acc.namaAkun}: Rp 0`);
    }
  });
  
  // Calculate totals
  let totalRevenue = 0;
  let totalExpense = 0;
  
  linesByAccount.forEach(line => {
    const acc = accountMap.get(line.kodeAkun);
    if (acc) {
      const debit = line._sum.debit || 0;
      const kredit = line._sum.kredit || 0;
      if (acc.tipeAkun === 'Revenue') {
        totalRevenue += (kredit - debit);
      } else if (acc.tipeAkun === 'Expense') {
        totalExpense += (debit - kredit);
      }
    }
  });
  
  console.log('\n📊 TOTALS:');
  console.log(`  💰 Total Pendapatan: Rp ${totalRevenue.toLocaleString('id-ID')}`);
  console.log(`  💸 Total Beban: Rp ${totalExpense.toLocaleString('id-ID')}`);
  console.log(`  📈 Laba/Rugi: Rp ${(totalRevenue - totalExpense).toLocaleString('id-ID')}`);
  
  // Show which accounts have activity
  const activeAccounts = linesByAccount.filter(l => {
    const acc = accountMap.get(l.kodeAkun);
    return acc && ((l._sum.debit || 0) + (l._sum.kredit || 0) > 0);
  });
  
  console.log(`\n✅ ${activeAccounts.length} Revenue/Expense accounts have journal activity`);
  
  await prisma.$disconnect();
}

verifyAccounts();
