import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { auth } from "../lib/auth/auth-server";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL environment variable is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================================
// CHART OF ACCOUNTS
// ============================================================================

const ACCOUNTS = [
	// AKTIVA LANCAR (Current Assets) - 101-106
	{ kodeAkun: "101", namaAkun: "Kas", tipeAkun: "Asset", saldo: 0, kategori: "Kas" },
	{ kodeAkun: "102", namaAkun: "Bank", tipeAkun: "Asset", saldo: 0, kategori: "Bank" },
	{ kodeAkun: "103", namaAkun: "Piutang Siswa", tipeAkun: "Asset", saldo: 0, kategori: "Piutang" },
	{ kodeAkun: "104", namaAkun: "Piutang Lain-Lain", tipeAkun: "Asset", saldo: 0, kategori: "Piutang" },
	{ kodeAkun: "105", namaAkun: "Piutang Periode Sebelumnya", tipeAkun: "Asset", saldo: 0, kategori: "Piutang" },
	{ kodeAkun: "106", namaAkun: "Biaya Dibayar Dimuka", tipeAkun: "Asset", saldo: 0, kategori: "Lancar Lainnya" },

	// AKTIVA TETAP (Fixed Assets) - 107-111
	{ kodeAkun: "107", namaAkun: "Tanah", tipeAkun: "Asset", saldo: 0, kategori: "Aset Tetap" },
	{ kodeAkun: "108", namaAkun: "Gedung", tipeAkun: "Asset", saldo: 0, kategori: "Aset Tetap" },
	{ kodeAkun: "109", namaAkun: "Kendaraan", tipeAkun: "Asset", saldo: 0, kategori: "Aset Tetap" },
	{ kodeAkun: "110", namaAkun: "Peralatan Kantor", tipeAkun: "Asset", saldo: 0, kategori: "Aset Tetap" },
	{ kodeAkun: "111", namaAkun: "Akumulasi Penyusutan Aktiva Tetap", tipeAkun: "Asset", saldo: 0, kategori: "Akumulasi Penyusutan", isContra: true },

	// KEWAJIBAN (Liabilities) - 200-201
	{ kodeAkun: "200", namaAkun: "Hutang Usaha", tipeAkun: "Liability", saldo: 0, kategori: "Hutang Lancar" },
	{ kodeAkun: "201", namaAkun: "Hutang Lancar", tipeAkun: "Liability", saldo: 0, kategori: "Hutang Bank" },

	// MODAL (Equity) - 300-304, 3201
	{ kodeAkun: "300", namaAkun: "Setoran Modal Pemilik", tipeAkun: "Equity", saldo: 0, kategori: "Modal" },
	{ kodeAkun: "301", namaAkun: "Modal Awal", tipeAkun: "Equity", saldo: 0, kategori: "Modal" },
	{ kodeAkun: "302", namaAkun: "Laba (Rugi) Periode Sebelumnya", tipeAkun: "Equity", saldo: 0, kategori: "Laba" },
	{ kodeAkun: "303", namaAkun: "Laba (Rugi) Periode Berjalan", tipeAkun: "Equity", saldo: 0, kategori: "Laba" },
	{ kodeAkun: "304", namaAkun: "Prive", tipeAkun: "Equity", saldo: 0, kategori: "Prive" },
	{ kodeAkun: "3201", namaAkun: "Ekuitas Saldo Awal", tipeAkun: "Equity", saldo: 0, kategori: "Modal" },

	// PENDAPATAN (Revenue) - 400-408
	{ kodeAkun: "400", namaAkun: "Penerimaan Dana Pendaftaran", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "401", namaAkun: "Penerimaan Uang Gedung", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "402", namaAkun: "Penerimaan Uang Kegiatan", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "403", namaAkun: "Penerimaan Uang Seragam", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "404", namaAkun: "Penerimaan Uang ATK", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "405", namaAkun: "Penerimaan Uang SPP", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "406", namaAkun: "Pendapatan Lain-Lain", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "407", namaAkun: "Penerimaan piutang siswa", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },
	{ kodeAkun: "408", namaAkun: "Penerimaan Uang Hibah", tipeAkun: "Revenue", saldo: 0, kategori: "Pendapatan" },

	// BIAYA/BEBAN (Expenses) - 500-522, 600
	{ kodeAkun: "500", namaAkun: "Biaya Gaji", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "501", namaAkun: "Biaya Tunjangan", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "502", namaAkun: "Biaya ATK Kantor", tipeAkun: "Expense", saldo: 0, kategori: "Beban Administrasi" },
	{ kodeAkun: "503", namaAkun: "Biaya UKS", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "504", namaAkun: "Biaya Listrik, Internet dan Telepon", tipeAkun: "Expense", saldo: 0, kategori: "Beban Utilitas" },
	{ kodeAkun: "505", namaAkun: "Biaya iuran - iuran", tipeAkun: "Expense", saldo: 0, kategori: "Beban Lainnya" },
	{ kodeAkun: "506", namaAkun: "Biaya Kebersihan & Kemanan Kantor", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "507", namaAkun: "Biaya bahan bakar", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "508", namaAkun: "Biaya Admin bank", tipeAkun: "Expense", saldo: 0, kategori: "Beban Administrasi" },
	{ kodeAkun: "509", namaAkun: "Biaya PPDB", tipeAkun: "Expense", saldo: 0, kategori: "Beban Pemasaran" },
	{ kodeAkun: "510", namaAkun: "Biaya Konsumsi dan Rumah tangga", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "511", namaAkun: "Evaluasi Pembelajaran", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "512", namaAkun: "Biaya Kegiatan Kesiswaan", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "513", namaAkun: "Biaya Peningkatan SDM", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "514", namaAkun: "Biaya Parenting", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "515", namaAkun: "Biaya learning kit", tipeAkun: "Expense", saldo: 0, kategori: "Beban Pemasaran" },
	{ kodeAkun: "516", namaAkun: "Biaya sarana dan prasarana", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "517", namaAkun: "Biaya sewa", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "518", namaAkun: "Biaya Kunjungan Dinas", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "519", namaAkun: "Biaya owner", tipeAkun: "Expense", saldo: 0, kategori: "Beban Prive" },
	{ kodeAkun: "520", namaAkun: "Biaya Seragam Siswa", tipeAkun: "Expense", saldo: 0, kategori: "Beban Persediaan" },
	{ kodeAkun: "521", namaAkun: "Biaya ATK Siswa", tipeAkun: "Expense", saldo: 0, kategori: "Beban Persediaan" },
	{ kodeAkun: "522", namaAkun: "Biaya Gedung", tipeAkun: "Expense", saldo: 0, kategori: "Beban Operasional" },
	{ kodeAkun: "600", namaAkun: "Beban Penyusutan Aktiva Tetap", tipeAkun: "Expense", saldo: 0, kategori: "Beban Penyusutan" },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	const startTime = Date.now();
	console.log("🌱 Starting minimal seeding...\n");

	// 1. CLEAN ALL DATA
	console.log("1. Cleaning existing data...");
	await prisma.journalEntryLine.deleteMany();
	await prisma.journalEntry.deleteMany();
	await prisma.cashflow.deleteMany();
	await prisma.billing.deleteMany();
	await prisma.installment.deleteMany();
	await prisma.employeeBilling.deleteMany();
	await prisma.student.deleteMany();
	await prisma.employee.deleteMany();
	await prisma.academicYear.deleteMany();
	await prisma.inventory.deleteMany();
	await prisma.account.deleteMany();
	await prisma.asset.deleteMany();
	await prisma.debt.deleteMany();
	await prisma.notification.deleteMany();
	await prisma.auditTrail.deleteMany();
	await prisma.snapshot.deleteMany();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).authAccount.deleteMany();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).session.deleteMany();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).user.deleteMany();
	console.log("   ✅ Data cleaned\n");

	// 2. CREATE USERS
	console.log("2. Creating users...");
	const users = [
		{ email: "owner@school.finance", name: "School Owner", role: "owner", password: "ownerpass" },
		{ email: "admin@school.finance", name: "Admin User", role: "admin", password: "adminpass" },
		{ email: "user@school.finance", name: "Regular User", role: "user", password: "userpass" },
	];

	for (const userData of users) {
		try {
			await auth.api.signUpEmail({
				body: {
					email: userData.email,
					password: userData.password,
					name: userData.name,
				},
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (prisma as unknown as any).user.update({
				where: { email: userData.email },
				data: { role: userData.role },
			});
			console.log(`   ✅ ${userData.role}: ${userData.email} / ${userData.password}`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			if (error.message?.includes("already exists") || error.status === 422) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await (prisma as unknown as any).user.update({
					where: { email: userData.email },
					data: { role: userData.role },
				});
				console.log(`   ✅ ${userData.role}: ${userData.email} (role updated)`);
			} else {
				console.log(`   ⚠️  ${userData.email}: ${error.message}`);
			}
		}
	}
	console.log();

	// 3. CREATE ACCOUNTS
	console.log("3. Creating accounts...");
	await prisma.account.createMany({ data: ACCOUNTS });
	console.log(`   ✅ Created ${ACCOUNTS.length} accounts\n`);

	// 4. CREATE ACADEMIC YEAR (active only)
	console.log("4. Creating academic year...");
	const academicYear = await prisma.academicYear.create({
		data: {
			tahunAjaran: "2025/2026",
			tanggalMulai: new Date("2025-07-01"),
			tanggalSelesai: new Date("2026-06-30"),
			isActive: true,
		},
	});
	console.log(`   ✅ Created: ${academicYear.tahunAjaran} (active)\n`);

	const endTime = Date.now();
	const duration = ((endTime - startTime) / 1000).toFixed(2);

	console.log("✅ Minimal seeding complete!");
	console.log(`⏱️  Duration: ${duration}s`);
	console.log("\n📊 Summary:");
	console.log(`   - Users: ${users.length}`);
	console.log(`   - Accounts: ${ACCOUNTS.length}`);
	console.log(`   - Academic Years: 1 (2025/2026)`);
}

main()
	.catch((e) => {
		console.error("❌ Seeding failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		pool.end();
	});
