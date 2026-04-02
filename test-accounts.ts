import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const accounts = await prisma.account.findMany({ orderBy: { kodeAkun: 'asc' } });
  console.log("Found " + accounts.length + " accounts");
  for (const a of accounts) {
    console.log(a.kodeAkun + ' - ' + a.namaAkun);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
