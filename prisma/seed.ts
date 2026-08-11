import "dotenv/config";
import { createId } from "@paralleldrive/cuid2";
import { PrismaClient, Prisma } from "@prisma/client";
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
// CONFIGURATION
// ============================================================================

const BATCH_SIZE = 200;

// Chart of Accounts (COA) - Indonesian School Finance Structure
const ACCOUNTS = [
	// AKTIVA LANCAR (Current Assets) - 101-106
	{
		kodeAkun: "101",
		namaAkun: "Kas",
		tipeAkun: "Asset",
		saldo: 50000000,
		kategori: "Kas",
	},
	{
		kodeAkun: "102",
		namaAkun: "Bank",
		tipeAkun: "Asset",
		saldo: 100000000,
		kategori: "Bank",
	},
	{
		kodeAkun: "103",
		namaAkun: "Piutang Siswa",
		tipeAkun: "Asset",
		saldo: 25000000,
		kategori: "Piutang",
	},
	{
		kodeAkun: "104",
		namaAkun: "Piutang Lain-Lain",
		tipeAkun: "Asset",
		saldo: 5000000,
		kategori: "Piutang",
	},
	{
		kodeAkun: "105",
		namaAkun: "Piutang Periode Sebelumnya",
		tipeAkun: "Asset",
		saldo: 10000000,
		kategori: "Piutang",
	},
	{
		kodeAkun: "106",
		namaAkun: "Biaya Dibayar Dimuka",
		tipeAkun: "Asset",
		saldo: 2000000,
		kategori: "Lancar Lainnya",
	},

	// AKTIVA TETAP (Fixed Assets) - 107-111
	{
		kodeAkun: "107",
		namaAkun: "Tanah",
		tipeAkun: "Asset",
		saldo: 500000000,
		kategori: "Aset Tetap",
	},
	{
		kodeAkun: "108",
		namaAkun: "Gedung",
		tipeAkun: "Asset",
		saldo: 1000000000,
		kategori: "Aset Tetap",
	},
	{
		kodeAkun: "109",
		namaAkun: "Kendaraan",
		tipeAkun: "Asset",
		saldo: 150000000,
		kategori: "Aset Tetap",
	},
	{
		kodeAkun: "110",
		namaAkun: "Peralatan Kantor",
		tipeAkun: "Asset",
		saldo: 50000000,
		kategori: "Aset Tetap",
	},
	{
		kodeAkun: "111",
		namaAkun: "Akumulasi Penyusutan Aktiva Tetap",
		tipeAkun: "Asset",
		saldo: -100000000,
		kategori: "Akumulasi Penyusutan",
		isContra: true,
	},

	// KEWAJIBAN (Liabilities) - 200-201
	{
		kodeAkun: "200",
		namaAkun: "Hutang Usaha",
		tipeAkun: "Liability",
		saldo: 5000000,
		kategori: "Hutang Lancar",
	},
	{
		kodeAkun: "201",
		namaAkun: "Hutang Lancar",
		tipeAkun: "Liability",
		saldo: 200000000,
		kategori: "Hutang Bank",
	},

	// MODAL (Equity) - 300-304
	{
		kodeAkun: "300",
		namaAkun: "Setoran Modal Pemilik",
		tipeAkun: "Equity",
		saldo: 1500000000,
		kategori: "Modal",
	},
	{
		kodeAkun: "301",
		namaAkun: "Modal Awal",
		tipeAkun: "Equity",
		saldo: 0,
		kategori: "Modal",
	},
	{
		kodeAkun: "302",
		namaAkun: "Laba (Rugi) Periode Sebelumnya",
		tipeAkun: "Equity",
		saldo: 87000000,
		kategori: "Laba",
	},
	{
		kodeAkun: "303",
		namaAkun: "Laba (Rugi) Periode Berjalan",
		tipeAkun: "Equity",
		saldo: 0,
		kategori: "Laba",
	},
	{
		kodeAkun: "304",
		namaAkun: "Prive",
		tipeAkun: "Equity",
		saldo: 0,
		kategori: "Prive",
	},
	{
		kodeAkun: "3201",
		namaAkun: "Ekuitas Saldo Awal",
		tipeAkun: "Equity",
		saldo: 0,
		kategori: "Modal",
	},

	// PENDAPATAN (Revenue) - 400-407
	{
		kodeAkun: "400",
		namaAkun: "Penerimaan Dana Pendaftaran",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "401",
		namaAkun: "Penerimaan Uang Gedung",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "402",
		namaAkun: "Penerimaan Uang Kegiatan",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "403",
		namaAkun: "Penerimaan Uang Seragam",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "404",
		namaAkun: "Penerimaan Uang ATK",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "405",
		namaAkun: "Penerimaan Uang SPP",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "406",
		namaAkun: "Pendapatan Lain-Lain",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "407",
		namaAkun: "Penerimaan piutang siswa",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},
	{
		kodeAkun: "408",
		namaAkun: "Penerimaan Uang Hibah",
		tipeAkun: "Revenue",
		saldo: 0,
		kategori: "Pendapatan",
	},

	// BIAYA/BEBAN (Expenses) - 500-522
	{
		kodeAkun: "500",
		namaAkun: "Biaya Gaji",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "501",
		namaAkun: "Biaya Tunjangan",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "502",
		namaAkun: "Biaya ATK Kantor",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Administrasi",
	},
	{
		kodeAkun: "503",
		namaAkun: "Biaya UKS",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "504",
		namaAkun: "Biaya Listrik, Internet dan Telepon",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Utilitas",
	},
	{
		kodeAkun: "505",
		namaAkun: "Biaya iuran - iuran",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Lainnya",
	},
	{
		kodeAkun: "506",
		namaAkun: "Biaya Kebersihan & Kemanan Kantor",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "507",
		namaAkun: "Biaya bahan bakar",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "508",
		namaAkun: "Biaya Admin bank",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Administrasi",
	},
	{
		kodeAkun: "509",
		namaAkun: "Biaya PPDB",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Pemasaran",
	},
	{
		kodeAkun: "510",
		namaAkun: "Biaya Konsumsi dan Rumah tangga",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "511",
		namaAkun: "Evaluasi Pembelajaran",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "512",
		namaAkun: "Biaya Kegiatan Kesiswaan",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "513",
		namaAkun: "Biaya Peningkatan SDM",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "514",
		namaAkun: "Biaya Parenting",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "515",
		namaAkun: "Biaya learning kit",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Pemasaran",
	},
	{
		kodeAkun: "516",
		namaAkun: "Biaya sarana dan prasarana",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "517",
		namaAkun: "Biaya sewa",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "518",
		namaAkun: "Biaya Kunjungan Dinas",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "519",
		namaAkun: "Biaya owner",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Prive",
	},
	{
		kodeAkun: "520",
		namaAkun: "Biaya Seragam Siswa",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Persediaan",
	},
	{
		kodeAkun: "521",
		namaAkun: "Biaya ATK Siswa",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Persediaan",
	},
	{
		kodeAkun: "522",
		namaAkun: "Biaya Gedung",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Operasional",
	},
	{
		kodeAkun: "600",
		namaAkun: "Beban Penyusutan Aktiva Tetap",
		tipeAkun: "Expense",
		saldo: 0,
		kategori: "Beban Penyusutan",
	},
];

// Fee structure per class
const CLASS_FEE_MAP: Record<string, Record<string, number>> = {
	PLAYGROUP: {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 500000,
		SPP: 550000,
		Konsumsi: 300000,
	},
	KINDERGARTEN: {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 550000,
		Konsumsi: 300000,
	},
	"1": {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 650000,
		Konsumsi: 350000,
	},
	"2": {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 650000,
		Konsumsi: 350000,
	},
	"3": {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 700000,
		Konsumsi: 400000,
	},
	"4": {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 700000,
		Konsumsi: 400000,
	},
	"5": {
		Pendaftaran: 350000,
		Gedung: 8000000,
		Kegiatan: 2000000,
		Seragam: 800000,
		ATK: 1000000,
		SPP: 750000,
		Konsumsi: 450000,
	},
};

// Map categories to account codes - Complete mapping for all COA accounts
const CATEGORY_TO_ACCOUNT: Record<string, string> = {
	// PENDAPATAN (Revenue) - 400-407
	Pendaftaran: "400",
	"Penerimaan Dana Pendaftaran": "400",
	"Uang Gedung": "401",
	"Penerimaan Uang Gedung": "401",
	Gedung: "401",
	Kegiatan: "402",
	"Penerimaan Uang Kegiatan": "402",
	Seragam: "403",
	"Penerimaan Uang Seragam": "403",
	ATK: "404",
	"Penerimaan Uang ATK": "404",
	SPP: "405",
	"Penerimaan Uang SPP": "405",
	"Pendapatan Lain-Lain": "406",
	Konsumsi: "406", // Student billing for konsumsi goes to revenue
	"Uang Konsumsi": "406",
	"Penerimaan Konsumsi": "406",
	Piutang: "407",
	"Penerimaan piutang siswa": "407",
	Hibah: "408",
	"Penerimaan Uang Hibah": "408",

	// BIAYA/BEBAN (Expenses) - 500-522
	Gaji: "500",
	"Biaya Gaji": "500",
	Tunjangan: "501",
	"Biaya Tunjangan": "501",
	"Biaya ATK Kantor": "502",
	"ATK Kantor": "502",
	"Biaya UKS": "503",
	UKS: "503",
	Listrik: "504",
	"Biaya Listrik, Internet dan Telepon": "504",
	"Biaya iuran - iuran": "505",
	"Biaya Kebersihan & Kemanan Kantor": "506",
	"Biaya bahan bakar": "507",
	"Bahan bakar": "507",
	"Biaya Admin bank": "508",
	"Admin bank": "508",
	"Biaya PPDB": "509",
	PPDB: "509",
	"Biaya Konsumsi dan Rumah tangga": "510",
	"Evaluasi Pembelajaran": "511",
	"Biaya Kegiatan Kesiswaan": "512",
	"Biaya Peningkatan SDM": "513",
	"Biaya Parenting": "514",
	"Biaya learning kit": "515",
	"Biaya sarana dan prasarana": "516",
	Sarpras: "516",
	"Biaya sewa": "517",
	"Biaya Kunjungan Dinas": "518",
	"Biaya owner": "519",
	"Biaya Seragam Siswa": "520",
	"Biaya ATK Siswa": "521",
	"Biaya Gedung": "522",
};

const MONTHS_2025 = [
	"2025-07",
	"2025-08",
	"2025-09",
	"2025-10",
	"2025-11",
	"2025-12",
];
const MONTHS_2026 = [
	"2026-01",
	"2026-02",
	"2026-03",
	"2026-04",
	"2026-05",
	"2026-06",
];
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
	return `${year}${String(index + 1).padStart(4, "0")}`;
}

function generatePhone(): string {
	return `08${Math.floor(Math.random() * 10000000000)
		.toString()
		.padStart(10, "0")
		.slice(0, 10)}`;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
	const startTime = Date.now();
	console.log("🌱 Starting comprehensive seeding...\n");

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
	// Delete users and auth accounts last (due to foreign key constraints)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).authAccount.deleteMany();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).session.deleteMany();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (prisma as unknown as any).user.deleteMany();
	console.log("   ✅ Data cleaned\n");

	// 2. CREATE USERS (for Better Auth) - All roles with passwords
	console.log("2. Creating users with passwords...");

	const users = [
		{
			email: "owner@school.finance",
			name: "School Owner",
			role: "owner",
			password: "ownerpass",
		},
		{
			email: "admin@school.finance",
			name: "Admin User",
			role: "admin",
			password: "adminpass",
		},
		{
			email: "user@school.finance",
			name: "Regular User",
			role: "user",
			password: "userpass",
		},
	];

	for (const userData of users) {
		try {
			// Create user via Better Auth API (handles password hashing correctly)
			await auth.api.signUpEmail({
				body: {
					email: userData.email,
					password: userData.password,
					name: userData.name,
				},
			});

			// Update role (Better Auth creates user with default role, we update it)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (prisma as unknown as any).user.update({
				where: { email: userData.email },
				data: { role: userData.role },
			});

			console.log(
				`   ✅ ${userData.role}: ${userData.email} / ${userData.password}`,
			);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			// If user already exists, just update the role
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
	console.log("2. Creating accounts...");
	await prisma.account.createMany({ data: ACCOUNTS });
	console.log(`   ✅ Created ${ACCOUNTS.length} accounts\n`);

	// 3. CREATE ACADEMIC YEARS
	console.log("3. Creating academic years...");
	const academicYears = await prisma.$transaction([
		prisma.academicYear.create({
			data: {
				tahunAjaran: "2024/2025",
				tanggalMulai: new Date("2024-07-01"),
				tanggalSelesai: new Date("2025-06-30"),
				isActive: false,
				isArchived: true,
			},
		}),
		prisma.academicYear.create({
			data: {
				tahunAjaran: "2025/2026",
				tanggalMulai: new Date("2025-07-01"),
				tanggalSelesai: new Date("2026-06-30"),
				isActive: true,
			},
		}),
		prisma.academicYear.create({
			data: {
				tahunAjaran: "2026/2027",
				tanggalMulai: new Date("2026-07-01"),
				tanggalSelesai: new Date("2027-06-30"),
				isActive: false,
			},
		}),
	]);
	const activeAcademicYear = academicYears[1];
	console.log(`   ✅ Created ${academicYears.length} academic years\n`);

	// 5. CREATE STUDENTS (40 students with varied statuses)
	console.log("5. Creating students...");
	const studentNames = [
		"Ahmad Fauzi",
		"Siti Aminah",
		"Muhammad Rizki",
		"Abdul Hakim",
		"Fatima Zahra",
		"Rendi Pangestu",
		"Dewi Lestari",
		"Budi Hartono",
		"Anisa Fitri",
		"Eko Saputra",
		"Lestari Putri",
		"Aditya Pratama",
		"Santi Kurnia",
		"Hendra Wijaya",
		"Maya Indah",
		"Robi Setiawan",
		"Nina Marlina",
		"Fajar Sidik",
		"Rina Widya",
		"Diki Wahyudi",
		"Putri Amanda",
		"Rafael Sitompul",
		"Citra Kirana",
		"Bagas Pratama",
		"Dina Amelia",
		"Yusuf Mansur",
		"Aisyah Humairah",
		"Zaki Mubarak",
		"Luna Safitri",
		"Reza Pahlevi",
		"Nadia Salsabila",
		"Fahri Hamzah",
		"Intan Permata",
		"Gilang Ramadhan",
		"Rani Puspitasari",
		"Bayu Aji",
		"Salsabila Anwar",
		"Daffa Kurniawan",
		"Marsha Andriani",
		"Bima Sakti",
	];

	const classes = ["PLAYGROUP", "KINDERGARTEN", "1", "2", "3", "4", "5"];

	const studentData = studentNames.map((name, i) => ({
		nis: generateNIS(2025, i),
		nama: name,
		jenisKelamin: i % 2 === 0 ? "L" : "P",
		kelas: classes[i % classes.length],
		tahunMasuk: i < 20 ? 2025 : 2024,
		tahunAjaran: i < 20 ? "2025/2026" : "2024/2025",
		namaOrtu: `Orang Tua ${name.split(" ")[0]}`,
		noTelp: generatePhone(),
		statusBayar: i % 3 === 0 ? "Lunas" : "Belum Lunas",
		status: i < 35 ? "Active" : "Inactive",
		totalTagihan: 0,
		totalBayar: 0,
	}));

	await prisma.student.createMany({ data: studentData });
	const students = await prisma.student.findMany({ orderBy: { id: "asc" } });
	console.log(`   ✅ Created ${students.length} students\n`);

	// 6. CREATE EMPLOYEES (10 employees with varied positions)
	console.log("6. Creating employees...");
	const employeeData = [
		{
			nip: "E001",
			nama: "Dr. Sarah Amalia, M.Pd",
			jabatan: "Kepala Sekolah",
			jenisKelamin: "P",
			gajiPokok: 15000000,
			tanggalMasuk: new Date("2020-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Merdeka No. 1, Jakarta",
		},
		{
			nip: "E002",
			nama: "Ahmad Sudirman, S.Pd",
			jabatan: "Wakil Kepala Sekolah",
			jenisKelamin: "L",
			gajiPokok: 12000000,
			tanggalMasuk: new Date("2020-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Sudirman No. 23, Jakarta",
		},
		{
			nip: "E003",
			nama: "Siti Rahayu, S.Pd",
			jabatan: "Guru",
			jenisKelamin: "P",
			gajiPokok: 8000000,
			tanggalMasuk: new Date("2021-07-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Gatot Subroto No. 45, Jakarta",
		},
		{
			nip: "E004",
			nama: "Budi Santoso, S.Pd",
			jabatan: "Guru",
			jenisKelamin: "L",
			gajiPokok: 8000000,
			tanggalMasuk: new Date("2021-07-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Thamrin No. 67, Jakarta",
		},
		{
			nip: "E005",
			nama: "Dewi Kusuma, S.Pd",
			jabatan: "Guru",
			jenisKelamin: "P",
			gajiPokok: 7500000,
			tanggalMasuk: new Date("2022-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Rasuna Said No. 89, Jakarta",
		},
		{
			nip: "E006",
			nama: "Rini Agustina",
			jabatan: "Admin",
			jenisKelamin: "P",
			gajiPokok: 6000000,
			tanggalMasuk: new Date("2020-03-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Senayan No. 12, Jakarta",
		},
		{
			nip: "E007",
			nama: "Agus Wijaya",
			jabatan: "Staff",
			jenisKelamin: "L",
			gajiPokok: 5500000,
			tanggalMasuk: new Date("2021-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Blok M No. 34, Jakarta",
		},
		{
			nip: "E008",
			nama: "Sukiman",
			jabatan: "Kebersihan",
			jenisKelamin: "L",
			gajiPokok: 3500000,
			tanggalMasuk: new Date("2020-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Cilandak No. 56, Jakarta",
		},
		{
			nip: "E009",
			nama: "Rohaya",
			jabatan: "Kebersihan",
			jenisKelamin: "P",
			gajiPokok: 3500000,
			tanggalMasuk: new Date("2021-06-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Fatmawati No. 78, Jakarta",
		},
		{
			nip: "E010",
			nama: "Joko Santoso",
			jabatan: "Satpam",
			jenisKelamin: "L",
			gajiPokok: 4000000,
			tanggalMasuk: new Date("2020-01-01"),
			status: "Active",
			noTelp: generatePhone(),
			alamat: "Jl. Radio Dalam No. 90, Jakarta",
		},
	];
	await prisma.employee.createMany({ data: employeeData });
	const employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
	console.log(`   ✅ Created ${employees.length} employees\n`);

	// 7. PREPARE BILLINGS DATA
	console.log("7. Preparing billing data...");
	const billingData: Array<{
		id?: string;
		studentId: string;
		academicYearId: string;
		jenisBiaya: string;
		jumlah: number;
		statusBayar: string;
		tanggalBayar?: Date;
		isCicilan?: boolean;
		tenor?: number;
		tanggalMulaiCicilan?: Date;
	}> = [];

	for (const student of students) {
		if (student.status === "Inactive") continue;

		const fees = CLASS_FEE_MAP[student.kelas] || CLASS_FEE_MAP["1"];
		const academicYearId =
			student.tahunAjaran === "2025/2026"
				? activeAcademicYear.id
				: academicYears[0].id;

		// Initial fees for July (only for new students 2025)
		if (student.tahunMasuk === 2025) {
			const initialFees = [
				{ type: "Pendaftaran", amount: fees.Pendaftaran },
				{ type: "Uang Gedung", amount: fees.Gedung },
				{ type: "Seragam", amount: fees.Seragam },
				{ type: "ATK", amount: fees.ATK },
			];

			for (const fee of initialFees) {
				const isPaid = Math.random() < 0.8;
				billingData.push({
					studentId: student.id,
					academicYearId,
					jenisBiaya: fee.type,
					jumlah: fee.amount,
					statusBayar: isPaid ? "Lunas" : "Belum Lunas",
					tanggalBayar: isPaid
						? new Date(`2025-07-${1 + Math.floor(Math.random() * 20)}`)
						: undefined,
				});
			}
		}

		// Annual SPP (12 months total, cicilan)
		const sppPaid = Math.random() < 0.5;
		billingData.push({
			studentId: student.id,
			academicYearId,
			jenisBiaya: "SPP",
			jumlah: fees.SPP * 12,
			statusBayar: sppPaid ? "Lunas" : "Belum Lunas",
			tanggalBayar: sppPaid
				? new Date(`2025-07-${1 + Math.floor(Math.random() * 20)}`)
				: undefined,
			isCicilan: !sppPaid,
			tenor: sppPaid ? undefined : 12,
			tanggalMulaiCicilan: sppPaid ? undefined : new Date("2025-07-01"),
		});

		// Annual Konsumsi (12 months total, cicilan)
		const konsumsiPaid = Math.random() < 0.5;
		billingData.push({
			studentId: student.id,
			academicYearId,
			jenisBiaya: "Konsumsi",
			jumlah: fees.Konsumsi * 12,
			statusBayar: konsumsiPaid ? "Lunas" : "Belum Lunas",
			tanggalBayar: konsumsiPaid
				? new Date(`2025-07-${1 + Math.floor(Math.random() * 20)}`)
				: undefined,
			isCicilan: !konsumsiPaid,
			tenor: konsumsiPaid ? undefined : 12,
			tanggalMulaiCicilan: konsumsiPaid ? undefined : new Date("2025-07-01"),
		});
	}

	// Insert billings in batches
	console.log(`   Inserting ${billingData.length} billings in batches...`);
	const billingChunks = chunkArray(billingData, BATCH_SIZE);
	for (const chunk of billingChunks) {
		await prisma.billing.createMany({ data: chunk });
	}
	const billings = await prisma.billing.findMany({
		orderBy: { id: "asc" },
		select: {
			id: true,
			studentId: true,
			jenisBiaya: true,
			jumlah: true,
			statusBayar: true,
			tanggalBayar: true,
			isCicilan: true,
			tenor: true,
			student: true,
		},
	});
	console.log(`   ✅ Created ${billings.length} billings\n`);

	// 8. CREATE INSTALLMENTS for unpaid cicilan billings
	console.log("8. Creating installments...");
	const unpaidCicilanBillings = billings.filter(
		(b) => b.statusBayar === "Belum Lunas" && b.isCicilan && b.tenor,
	);
	const installmentData = [];

	for (const billing of unpaidCicilanBillings) {
		const tenor = billing.tenor || 3;
		const jumlahCicilan = Math.ceil(billing.jumlah / tenor);
		const startDate = new Date();
		for (let i = 1; i <= tenor; i++) {
			const dueDate = new Date(startDate);
			dueDate.setMonth(dueDate.getMonth() + i - 1);

			installmentData.push({
				studentId: billing.studentId,
				billingId: billing.id,
				cicilanKe: i,
				jumlah: jumlahCicilan,
				tanggalJatuhTempo: dueDate,
				status: "Belum Bayar",
			});
		}
	}

	if (installmentData.length > 0) {
		const installmentChunks = chunkArray(installmentData, BATCH_SIZE);
		for (const chunk of installmentChunks) {
			await prisma.installment.createMany({ data: chunk });
		}
	}

	// Force lifecycle coverage for installment/piutang flows:
	// - Belum Bayar (default)
	// - Jatuh Tempo (overdue)
	// - Bayar (paid)
	const createdInstallments = await prisma.installment.findMany({
		orderBy: [{ studentId: "asc" }, { cicilanKe: "asc" }],
	});

	if (createdInstallments.length > 0) {
		const now = new Date();
		const daysAgo = (days: number) =>
			new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

		// Mark some installments as explicitly overdue / jatuh tempo
		const overdueInstallments = createdInstallments.slice(0, 6);
		for (let index = 0; index < overdueInstallments.length; index++) {
			const inst = overdueInstallments[index];
			const overdueDaysPattern = [14, 45, 75, 120, 10, 33];
			const overdueDate = daysAgo(overdueDaysPattern[index] || 30);
			await prisma.installment.update({
				where: { id: inst.id },
				data: {
					status: "Jatuh Tempo",
					tanggalJatuhTempo: overdueDate,
				},
			});
		}

		// Mark some installments as already paid
		for (const inst of createdInstallments.slice(6, 10)) {
			await prisma.installment.update({
				where: { id: inst.id },
				data: {
					status: "Bayar",
					tanggalBayar: daysAgo(5),
				},
			});
		}
	}
	console.log(`   ✅ Created ${installmentData.length} installments\n`);

	// 9. PREPARE CASHFLOW DATA
	console.log("9. Preparing cashflow data...");
	const cashflowData: Array<{
		id: string;
		tanggal: Date;
		keterangan: string;
		kodeAkun: string;
		kategori: string | null;
		debit: number;
		kredit: number;
		status: string;
		source: string;
	}> = [];

	// Process billings into cashflows
	for (const billing of billings.filter(
		(b) => b.statusBayar === "Lunas" && b.tanggalBayar,
	)) {
		cashflowData.push({
			id: createId(),
			tanggal: billing.tanggalBayar!,
			keterangan: `Pembayaran ${billing.jenisBiaya}`,
			kodeAkun: "101", // Kas
			kategori: billing.jenisBiaya,
			debit: billing.jumlah,
			kredit: 0,
			status: "posted",
			source: "kas",
		});
	}

	// Add payroll expenses for 2025
	for (const m of MONTHS_2025) {
		for (const emp of employees) {
			const totalGaji =
				emp.gajiPokok + 500000 + (emp.jabatan === "Guru" ? 500000 : 0);
			const payDate = new Date(`${m}-25`);

			cashflowData.push({
				id: createId(),
				tanggal: payDate,
				keterangan: `Gaji ${emp.jabatan} - ${emp.nama}`,
				kodeAkun: "101",
				kategori: "Gaji",
				debit: 0,
				kredit: totalGaji,
				status: "posted",
				source: "kas",
			});

			// Tunjangan for some employees
			if (
				emp.jabatan === "Kepala Sekolah" ||
				emp.jabatan === "Wakil Kepala Sekolah"
			) {
				cashflowData.push({
					id: createId(),
					tanggal: payDate,
					keterangan: `Tunjangan Jabatan - ${emp.nama}`,
					kodeAkun: "101",
					kategori: "Tunjangan",
					debit: 0,
					kredit: 2000000,
					status: "posted",
					source: "kas",
				});
			}
		}

		// Monthly utilities and expenses
		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-05`),
			keterangan: `Pembayaran Listrik & Internet`,
			kodeAkun: "101",
			kategori: "Listrik",
			debit: 0,
			kredit: 1500000 + Math.random() * 500000,
			status: "posted",
			source: "kas",
		});

		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-10`),
			keterangan: `Pembayaran ATK Kantor`,
			kodeAkun: "101",
			kategori: "ATK",
			debit: 0,
			kredit: 800000 + Math.random() * 400000,
			status: "posted",
			source: "kas",
		});

		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-15`),
			keterangan: `Biaya Konsumsi Rapat`,
			kodeAkun: "101",
			kategori: "Konsumsi",
			debit: 0,
			kredit: 600000 + Math.random() * 300000,
			status: "posted",
			source: "kas",
		});

		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-18`),
			keterangan: `Biaya Transportasi`,
			kodeAkun: "101",
			kategori: "Biaya bahan bakar",
			debit: 0,
			kredit: 1000000 + Math.random() * 500000,
			status: "posted",
			source: "kas",
		});

		// Pemeliharaan (occasional)
		if (Math.random() < 0.3) {
			cashflowData.push({
				id: createId(),
				tanggal: new Date(`${m}-22`),
				keterangan: `Biaya Pemeliharaan Gedung`,
				kodeAkun: "101",
				kategori: "Biaya sarana dan prasarana",
				debit: 0,
				kredit: 2000000 + Math.random() * 3000000,
				status: "posted",
				source: "kas",
			});
		}
	}

	// 9b. ADD HISTORICAL 2024 CASHFLOW DATA (for year-over-year comparison)
	console.log("9b. Adding historical 2024 cashflow data...");
	const MONTHS_2024 = [
		"2024-07",
		"2024-08",
		"2024-09",
		"2024-10",
		"2024-11",
		"2024-12",
	];

	for (const m of MONTHS_2024) {
		// Historical payroll (slightly lower salaries)
		for (const emp of employees) {
			const totalGaji = emp.gajiPokok * 0.95 + 500000; // 5% lower in 2024
			const payDate = new Date(`${m}-25`);

			cashflowData.push({
				id: createId(),
				tanggal: payDate,
				keterangan: `Gaji ${emp.jabatan} - ${emp.nama} (2024)`,
				kodeAkun: "101",
				kategori: "Gaji",
				debit: 0,
				kredit: totalGaji,
				status: "posted",
				source: "kas",
			});
		}

		// Historical student payments (mixed)
		for (let i = 0; i < 15; i++) {
			const isPaid = Math.random() < 0.85; // Higher payment rate in past
			const sppAmount = 600000 + Math.floor(Math.random() * 100000);

			if (isPaid) {
				cashflowData.push({
					id: createId(),
					tanggal: new Date(`${m}-${10 + Math.floor(Math.random() * 15)}`),
					keterangan: `Pembayaran SPP 2024 - Siswa ${i + 1}`,
					kodeAkun: "101",
					kategori: "SPP",
					debit: sppAmount,
					kredit: 0,
					status: "posted",
					source: "kas",
				});
			}
		}

		// Historical expenses
		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-05`),
			keterangan: `Pembayaran Listrik & Internet 2024`,
			kodeAkun: "101",
			kategori: "Listrik",
			debit: 0,
			kredit: 1400000 + Math.random() * 400000,
			status: "posted",
			source: "kas",
		});

		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-10`),
			keterangan: `Pembayaran ATK Kantor 2024`,
			kodeAkun: "101",
			kategori: "ATK",
			debit: 0,
			kredit: 700000 + Math.random() * 350000,
			status: "posted",
			source: "kas",
		});

		// Bank transactions for reconciliation
		cashflowData.push({
			id: createId(),
			tanggal: new Date(`${m}-20`),
			keterangan: `Setor Tunai ke Bank 2024`,
			kodeAkun: "102",
			kategori: "Setor",
			debit: 20000000 + Math.random() * 10000000,
			kredit: 0,
			status: "posted",
			source: "bank",
		});
	}
	console.log(`   ✅ Added historical 2024 cashflow data\n`);

	// Insert cashflows
	console.log(`   Inserting ${cashflowData.length} cashflows...`);
	const cashflowChunks = chunkArray(cashflowData, BATCH_SIZE);
	for (const chunk of cashflowChunks) {
		await prisma.cashflow.createMany({ data: chunk });
	}
	const createdCashflows = await prisma.cashflow.findMany({
		orderBy: { id: "asc" },
	});
	console.log(`   ✅ Created ${createdCashflows.length} cashflows\n`);

	// 10. CREATE TRANSFERS (Mutasi Kas-Bank) - Journal Entries
	console.log("10. Creating transfer records...");
	const transferData = [];
	for (let i = 0; i < 10; i++) {
		const m = MONTHS_2025[i % MONTHS_2025.length];
		const isBankToKas = i % 2 === 0;
		const dari = isBankToKas ? "102" : "101";
		const ke = isBankToKas ? "101" : "102";
		const timestamp = Date.now() + i * 1000;

		transferData.push({
			tanggal: new Date(`${m}-${5 + i * 2}`),
			keterangan: `Transfer ${isBankToKas ? "Bank ke Kas" : "Kas ke Bank"} #${i + 1}`,
			status: "posted",
			reference: `mutasi-${dari}-${ke}-${timestamp}`,
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
			status: "posted",
			reference: transfer.reference,
		});
	}

	if (transferJournals.length > 0) {
		await prisma.journalEntry.createMany({ data: transferJournals });
	}
	console.log(`   ✅ Created ${transferData.length} transfer records\n`);

	// 11. CREATE EMPLOYEE BILLINGS
	console.log("11. Creating employee billings...");
	const employeeBillingData: Array<{
		employeeId: string;
		academicYearId: string;
		jenisBiaya: string;
		jumlah: number;
		statusBayar: string;
		tanggalBayar?: Date;
		tipe: string;
	}> = [];

	for (const emp of employees) {
		const academicYearId = activeAcademicYear.id;

		// Gaji (annual)
		const gajiPaid = Math.random() < 0.6;
		employeeBillingData.push({
			employeeId: emp.id,
			academicYearId,
			jenisBiaya: "Gaji",
			jumlah: (emp.gajiPokok + 500000) * 12,
			statusBayar: gajiPaid ? "Lunas" : "Belum Lunas",
			tanggalBayar: gajiPaid
				? new Date("2025-07-25")
				: undefined,
			tipe: "tagihan",
		});

		// Tunjangan (annual)
		const tunjanganPaid = Math.random() < 0.5;
		employeeBillingData.push({
			employeeId: emp.id,
			academicYearId,
			jenisBiaya: "Tunjangan",
			jumlah: 500000 * 12,
			statusBayar: tunjanganPaid ? "Lunas" : "Belum Lunas",
			tanggalBayar: tunjanganPaid
				? new Date("2025-07-20")
				: undefined,
			tipe: "tagihan",
		});

		// Bonus THR (one-time, lunas)
		employeeBillingData.push({
			employeeId: emp.id,
			academicYearId,
			jenisBiaya: "Bonus",
			jumlah: emp.gajiPokok,
			statusBayar: "Lunas",
			tanggalBayar: new Date("2025-06-20"),
			tipe: "tagihan",
		});
	}

	const employeeBillingChunks = chunkArray(employeeBillingData, BATCH_SIZE);
	for (const chunk of employeeBillingChunks) {
		await prisma.employeeBilling.createMany({ data: chunk });
	}
	const employeeBillings = await prisma.employeeBilling.findMany({
		orderBy: { id: "asc" },
		select: {
			id: true,
			employeeId: true,
			jenisBiaya: true,
			jumlah: true,
			statusBayar: true,
		},
	});
	console.log(`   ✅ Created ${employeeBillingData.length} employee billings\n`);

	// 12. PREPARE JOURNAL ENTRIES
	console.log("12. Preparing journal entries...");
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
		let contraAccount = "101";

		if (isIncoming) {
			contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ""] || "406";
		} else {
			contraAccount = CATEGORY_TO_ACCOUNT[cf.kategori || ""] || "520";
		}

		const entryId = createId();

		journalEntries.push({
			id: entryId,
			tanggal: cf.tanggal,
			keterangan: cf.keterangan,
			status: "posted",
			reference: cf.id,
		});

		journalLines.push(
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: cf.kodeAkun,
				debit: cf.debit,
				kredit: cf.kredit,
			},
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: contraAccount,
				debit: cf.kredit,
				kredit: cf.debit,
			},
		);
	}

	// Create journal entries for transfers
	for (let i = 0; i < transferData.length; i++) {
		const transfer = transferData[i];
		const entryId = transferJournals[i]?.id || createId();
		const isBankToKas = transfer.keterangan.includes("Bank ke Kas");

		journalLines.push(
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: isBankToKas ? "101" : "102",
				debit: 7500000,
				kredit: 0,
			},
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: isBankToKas ? "102" : "101",
				debit: 0,
				kredit: 7500000,
			},
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

	// 12b. CREATE DRAFT JOURNAL ENTRIES (for approval workflow testing)
	console.log("12b. Creating draft journal entries for approval workflow...");
	const draftJournalEntries = [];
	const draftJournalLines = [];

	const draftDescriptions = [
		"Koreksi Jurnal Pembayaran SPP",
		"Jurnal Penyesuaian Piutang Siswa",
		"Koreksi Biaya Listrik Bulan Juli",
		"Jurnal Pembelian ATK Kantor",
		"Koreksi Gaji Karyawan Bagian Admin",
		"Jurnal Penyusutan Aset Tetap",
		"Koreksi Pendapatan Konsumsi",
		"Jurnal Pembelian Perlengkapan Sekolah",
		"Koreksi Biaya Transportasi",
		"Jurnal Pembayaran Hutang Supplier",
		"Koreksi Biaya Pemasaran PPDB",
		"Jurnal Penerimaan Pinjaman Bank",
		"Koreksi Biaya Kegiatan Kesiswaan",
		"Jurnal Pembelian Seragam Siswa",
		"Koreksi Biaya Perbaikan Gedung",
	];

	for (let i = 0; i < 15; i++) {
		const entryId = createId();
		const m = MONTHS_2025[i % MONTHS_2025.length];
		const amount = 1000000 + Math.floor(Math.random() * 5000000);

		draftJournalEntries.push({
			id: entryId,
			tanggal: new Date(`${m}-${5 + i}`),
			keterangan: draftDescriptions[i],
			status: "draft",
			reference: `DRAFT-${2025}${String(i + 1).padStart(3, "0")}`,
		});

		// Create double-entry lines (various account combinations)
		const accountCombos = [
			{ debit: "502", kredit: "101" }, // ATK Kantor vs Kas
			{ debit: "504", kredit: "102" }, // Listrik vs Bank
			{ debit: "500", kredit: "101" }, // Gaji vs Kas
			{ debit: "103", kredit: "405" }, // Piutang vs SPP Revenue
			{ debit: "101", kredit: "407" }, // Kas vs Piutang Revenue
		];

		const combo = accountCombos[i % accountCombos.length];

		draftJournalLines.push(
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: combo.debit,
				debit: amount,
				kredit: 0,
			},
			{
				id: createId(),
				journalEntryId: entryId,
				kodeAkun: combo.kredit,
				debit: 0,
				kredit: amount,
			},
		);
	}

	if (draftJournalEntries.length > 0) {
		await prisma.journalEntry.createMany({ data: draftJournalEntries });
		await prisma.journalEntryLine.createMany({ data: draftJournalLines });
	}

	// Add explicit non-draft/backdated journal workflow scenarios
	const specialJournalEntries = [
		{
			id: createId(),
			tanggal: new Date("2025-10-27"),
			keterangan: "Jurnal Telah Disetujui - Menunggu Posting",
			status: "approved",
			reference: "APPROVED-2025-001",
			version: 2,
		},
		{
			id: createId(),
			tanggal: new Date("2025-10-28"),
			keterangan: "Jurnal Ditolak - Koreksi Diperlukan",
			status: "rejected",
			reference: "REJECTED-2025-001",
			version: 2,
		},
		{
			id: createId(),
			tanggal: new Date("2024-11-15"),
			keterangan: "Jurnal Koreksi Backdated Tahun Ajaran Ditutup",
			status: "draft",
			reference: "BACKDATED-2024-001",
			version: 1,
			isBackdated: true,
			adjustmentType: "adjusting",
			backdatedBy: "owner-1",
			backdatedAt: new Date("2025-01-16"),
			reason: "Koreksi jurnal tahun ajaran ditutup",
		},
	];
	await prisma.journalEntry.createMany({ data: specialJournalEntries });

	const specialJournalLines = [
		{
			id: createId(),
			journalEntryId: specialJournalEntries[0].id,
			kodeAkun: "502",
			debit: 1750000,
			kredit: 0,
		},
		{
			id: createId(),
			journalEntryId: specialJournalEntries[0].id,
			kodeAkun: "101",
			debit: 0,
			kredit: 1750000,
		},
		{
			id: createId(),
			journalEntryId: specialJournalEntries[1].id,
			kodeAkun: "504",
			debit: 2100000,
			kredit: 0,
		},
		{
			id: createId(),
			journalEntryId: specialJournalEntries[1].id,
			kodeAkun: "102",
			debit: 0,
			kredit: 2100000,
		},
		{
			id: createId(),
			journalEntryId: specialJournalEntries[2].id,
			kodeAkun: "103",
			debit: 1200000,
			kredit: 0,
		},
		{
			id: createId(),
			journalEntryId: specialJournalEntries[2].id,
			kodeAkun: "405",
			debit: 0,
			kredit: 1200000,
		},
	];
	await prisma.journalEntryLine.createMany({ data: specialJournalLines });
	console.log(
		`   ✅ Created ${draftJournalEntries.length} draft journal entries with ${draftJournalLines.length} lines (+${specialJournalEntries.length} workflow journals)\n`,
	);

	// 12c. CREATE CASH WITHDRAWAL RECORDS
	console.log("12c. Creating cash withdrawal records...");
	const withdrawalData = [];

	for (let i = 0; i < 8; i++) {
		const m = MONTHS_2025[i % MONTHS_2025.length];
		const amount = 5000000 + Math.floor(Math.random() * 15000000);

		withdrawalData.push({
			tanggal: new Date(`${m}-${10 + i * 3}`),
			keterangan: `Penarikan Kas dari Bank #${i + 1}`,
			kodeAkun: "102", // Bank
			kategori: "penarikan",
			debit: 0,
			kredit: amount,
			status: "posted",
			source: "bank",
		});

		// Corresponding cash receipt
		withdrawalData.push({
			tanggal: new Date(`${m}-${10 + i * 3}`),
			keterangan: `Penerimaan Kas dari Penarikan Bank #${i + 1}`,
			kodeAkun: "101", // Kas
			kategori: "penarikan",
			debit: amount,
			kredit: 0,
			status: "posted",
			source: "kas",
		});
	}

	if (withdrawalData.length > 0) {
		const withdrawalChunks = chunkArray(withdrawalData, BATCH_SIZE);
		for (const chunk of withdrawalChunks) {
			await prisma.cashflow.createMany({ data: chunk });
		}
	}

	// Add explicit approval-workflow cashflow states for /admin/approve and status APIs
	const approvalScenarioCashflows = [
		{
			tanggal: new Date("2025-11-12"),
			keterangan: "Draft Pengeluaran ATK - Menunggu Persetujuan",
			kodeAkun: "502",
			kategori: "pengeluaran",
			debit: 0,
			kredit: 1250000,
			status: "draft",
			source: "kas",
		},
		{
			tanggal: new Date("2025-11-13"),
			keterangan: "Draft Pemasukan SPP - Menunggu Persetujuan",
			kodeAkun: "405",
			kategori: "pemasukan",
			debit: 1800000,
			kredit: 0,
			status: "draft",
			source: "bank",
		},
		{
			tanggal: new Date("2025-10-20"),
			keterangan: "Approved Transfer Operasional",
			kodeAkun: "102",
			kategori: "mutasi",
			debit: 3000000,
			kredit: 0,
			status: "approved",
			source: "bank",
		},
		{
			tanggal: new Date("2025-10-22"),
			keterangan: "Rejected Pengeluaran Tidak Valid",
			kodeAkun: "510",
			kategori: "pengeluaran",
			debit: 0,
			kredit: 950000,
			status: "rejected",
			source: "kas",
		},
	];
	await prisma.cashflow.createMany({ data: approvalScenarioCashflows });
	console.log(
		`   ✅ Created ${withdrawalData.length} cash withdrawal records (+${approvalScenarioCashflows.length} workflow cashflows)\n`,
	);

	// 13. CREATE ASSETS
	console.log("13. Creating assets...");
	// Calculate date for asset that will show depreciation reminder in current month
	const assetToday = new Date();
	const lastMonth = new Date(
		assetToday.getFullYear(),
		assetToday.getMonth() - 1,
		15,
	);

	// Helper to calculate sisaUmurTeknis
	const calcSisaUmur = (umurTeknis: number, alreadyDepreciatedYears: number) =>
		umurTeknis > 0 ? Math.max(0, umurTeknis - alreadyDepreciatedYears) : 0;

	const assetData = [
		// Tanah - no depreciation
		{
			kodeAkun: "107",
			nama: "Lahan Sekolah Utama",
			kategori: "Tanah",
			lokasi: "Jakarta Selatan",
			tanggalPerolehan: new Date("2018-01-15"),
			hargaPerolehan: 500000000,
			nilaiResidu: 0,
			isTanah: true,
			umurTeknis: 0,
			status: "Active",
			alreadyDepreciatedAmount: 0,
			alreadyDepreciatedYears: 0,
			sisaUmurTeknis: calcSisaUmur(0, 0),
		},
		// Gedung - with depreciation (6 years)
		{
			kodeAkun: "108",
			nama: "Gedung Sayap Timur",
			kategori: "Bangunan",
			lokasi: "Jakarta Selatan",
			tanggalPerolehan: new Date("2019-05-10"),
			hargaPerolehan: 1000000000,
			nilaiResidu: 100000000,
			isTanah: false,
			umurTeknis: 20,
			status: "Active",
			alreadyDepreciatedAmount: 270000000,
			alreadyDepreciatedYears: 6,
			sisaUmurTeknis: calcSisaUmur(20, 6),
		},
		{
			kodeAkun: "108",
			nama: "Gedung Sayap Barat",
			kategori: "Bangunan",
			lokasi: "Jakarta Selatan",
			tanggalPerolehan: new Date("2020-03-20"),
			hargaPerolehan: 800000000,
			nilaiResidu: 80000000,
			isTanah: false,
			umurTeknis: 20,
			status: "Active",
			alreadyDepreciatedAmount: 216000000,
			alreadyDepreciatedYears: 5,
			sisaUmurTeknis: calcSisaUmur(20, 5),
		},
		// Kendaraan - with depreciation
		{
			kodeAkun: "109",
			nama: "Toyota Hiace",
			kategori: "Kendaraan",
			lokasi: "Parkiran",
			tanggalPerolehan: new Date("2022-01-10"),
			hargaPerolehan: 450000000,
			nilaiResidu: 50000000,
			isTanah: false,
			umurTeknis: 8,
			status: "Active",
			alreadyDepreciatedAmount: 100000000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(8, 3),
		},
		{
			kodeAkun: "109",
			nama: "Honda Brio",
			kategori: "Kendaraan",
			lokasi: "Parkiran",
			tanggalPerolehan: new Date("2023-06-15"),
			hargaPerolehan: 250000000,
			nilaiResidu: 25000000,
			isTanah: false,
			umurTeknis: 8,
			status: "Active",
			alreadyDepreciatedAmount: 28125000,
			alreadyDepreciatedYears: 1,
			sisaUmurTeknis: calcSisaUmur(8, 1),
		},
		// Peralatan - newer with minimal depreciation
		{
			kodeAkun: "110",
			nama: "MacBook Air M2 (Admin)",
			kategori: "Peralatan",
			lokasi: "Ruang Admin",
			tanggalPerolehan: new Date("2024-11-20"),
			hargaPerolehan: 18000000,
			nilaiResidu: 2000000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 320000,
			alreadyDepreciatedYears: 0,
			sisaUmurTeknis: calcSisaUmur(5, 0),
		},
		{
			kodeAkun: "110",
			nama: "Printer Canon MF264dw",
			kategori: "Peralatan",
			lokasi: "Ruang Admin",
			tanggalPerolehan: new Date("2023-04-10"),
			hargaPerolehan: 5000000,
			nilaiResidu: 500000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 1800000,
			alreadyDepreciatedYears: 2,
			sisaUmurTeknis: calcSisaUmur(5, 2),
		},
		{
			kodeAkun: "110",
			nama: "Proyektor Epson EB-X41",
			kategori: "Peralatan",
			lokasi: "Ruang Kelas A",
			tanggalPerolehan: new Date("2023-07-05"),
			hargaPerolehan: 7500000,
			nilaiResidu: 750000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 2025000,
			alreadyDepreciatedYears: 1,
			sisaUmurTeknis: calcSisaUmur(5, 1),
		},
		// Asset for current month depreciation reminder - new assets (0 depreciation)
		{
			kodeAkun: "110",
			nama: "Laptop Dell Latitude (New)",
			kategori: "Peralatan",
			lokasi: "Ruang Guru",
			tanggalPerolehan: lastMonth,
			hargaPerolehan: 12000000,
			nilaiResidu: 1200000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 0,
			alreadyDepreciatedYears: 0,
			sisaUmurTeknis: calcSisaUmur(5, 0),
		},
		{
			kodeAkun: "110",
			nama: "Monitor LG 24 Inch",
			kategori: "Peralatan",
			lokasi: "Ruang Admin",
			tanggalPerolehan: lastMonth,
			hargaPerolehan: 3500000,
			nilaiResidu: 350000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 0,
			alreadyDepreciatedYears: 0,
			sisaUmurTeknis: calcSisaUmur(5, 0),
		},
		// Additional diverse assets for depreciation variety
		{
			kodeAkun: "109",
			nama: "Mitsubishi L300",
			kategori: "Kendaraan",
			lokasi: "Parkiran",
			tanggalPerolehan: new Date("2020-08-15"),
			hargaPerolehan: 320000000,
			nilaiResidu: 40000000,
			isTanah: false,
			umurTeknis: 8,
			status: "Active",
			alreadyDepreciatedAmount: 157500000,
			alreadyDepreciatedYears: 4,
			sisaUmurTeknis: calcSisaUmur(8, 4),
		},
		{
			kodeAkun: "110",
			nama: "Server Dell PowerEdge",
			kategori: "Peralatan",
			lokasi: "Server Room",
			tanggalPerolehan: new Date("2021-03-10"),
			hargaPerolehan: 45000000,
			nilaiResidu: 5000000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 24000000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(5, 3),
		},
		{
			kodeAkun: "110",
			nama: "AC Split 2PK (Ruang Guru)",
			kategori: "Peralatan",
			lokasi: "Ruang Guru",
			tanggalPerolehan: new Date("2021-06-20"),
			hargaPerolehan: 8500000,
			nilaiResidu: 850000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 4590000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(5, 3),
		},
		{
			kodeAkun: "110",
			nama: "AC Split 2PK (Ruang Kelas B)",
			kategori: "Peralatan",
			lokasi: "Ruang Kelas B",
			tanggalPerolehan: new Date("2022-02-14"),
			hargaPerolehan: 8500000,
			nilaiResidu: 850000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 3060000,
			alreadyDepreciatedYears: 2,
			sisaUmurTeknis: calcSisaUmur(5, 2),
		},
		{
			kodeAkun: "110",
			nama: "Fotocopy Canon IR 2520",
			kategori: "Peralatan",
			lokasi: "Ruang Admin",
			tanggalPerolehan: new Date("2019-11-05"),
			hargaPerolehan: 25000000,
			nilaiResidu: 2500000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 13500000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(5, 3),
		},
		{
			kodeAkun: "110",
			nama: "Interactive Whiteboard",
			kategori: "Peralatan",
			lokasi: "Ruang Kelas C",
			tanggalPerolehan: new Date("2022-09-01"),
			hargaPerolehan: 15000000,
			nilaiResidu: 1500000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 4050000,
			alreadyDepreciatedYears: 1,
			sisaUmurTeknis: calcSisaUmur(5, 1),
		},
		{
			kodeAkun: "110",
			nama: "CCTV System (8 Channel)",
			kategori: "Peralatan",
			lokasi: "Sekolah",
			tanggalPerolehan: new Date("2021-12-10"),
			hargaPerolehan: 12000000,
			nilaiResidu: 1200000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 6480000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(5, 3),
		},
		{
			kodeAkun: "110",
			nama: "Generator Set 10KVA",
			kategori: "Peralatan",
			lokasi: "Gudang",
			tanggalPerolehan: new Date("2020-04-15"),
			hargaPerolehan: 28000000,
			nilaiResidu: 2800000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 15120000,
			alreadyDepreciatedYears: 3,
			sisaUmurTeknis: calcSisaUmur(5, 3),
		},
		{
			kodeAkun: "110",
			nama: "Sound System Portable",
			kategori: "Peralatan",
			lokasi: "Ruang OSIS",
			tanggalPerolehan: new Date("2023-01-20"),
			hargaPerolehan: 6500000,
			nilaiResidu: 650000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 2340000,
			alreadyDepreciatedYears: 2,
			sisaUmurTeknis: calcSisaUmur(5, 2),
		},
		{
			kodeAkun: "110",
			nama: "Router Mikrotik RB3011",
			kategori: "Peralatan",
			lokasi: "Server Room",
			tanggalPerolehan: new Date("2022-07-08"),
			hargaPerolehan: 3200000,
			nilaiResidu: 320000,
			isTanah: false,
			umurTeknis: 5,
			status: "Active",
			alreadyDepreciatedAmount: 864000,
			alreadyDepreciatedYears: 1,
			sisaUmurTeknis: calcSisaUmur(5, 1),
		},
	];
	await prisma.asset.createMany({ data: assetData });
	console.log(`   ✅ Created ${assetData.length} assets\n`);

	// 14. CREATE INVENTORY
	console.log("14. Creating inventory...");
	const inventoryData = [
		// ATK (Office Supplies) - Linked to Biaya ATK Kantor account (502)
		{
			kodeAkun: "502",
			nama: "Kertas A4 80gsm (Rim)",
			kategori: "ATK",
			jumlahAwal: 50,
			jumlahSisa: 35,
			hargaSatuan: 45000,
			tanggalBeli: new Date("2025-01-15"),
			status: "Aktif",
		},
		{
			kodeAkun: "502",
			nama: "Tinta Printer Canon Black",
			kategori: "ATK",
			jumlahAwal: 20,
			jumlahSisa: 12,
			hargaSatuan: 180000,
			tanggalBeli: new Date("2025-02-10"),
			status: "Aktif",
		},
		{
			kodeAkun: "502",
			nama: "Tinta Printer Canon Color",
			kategori: "ATK",
			jumlahAwal: 15,
			jumlahSisa: 8,
			hargaSatuan: 220000,
			tanggalBeli: new Date("2025-02-10"),
			status: "Aktif",
		},
		{
			kodeAkun: "502",
			nama: "Ballpoint Standard AE7 (Box)",
			kategori: "ATK",
			jumlahAwal: 30,
			jumlahSisa: 22,
			hargaSatuan: 35000,
			tanggalBeli: new Date("2025-01-20"),
			status: "Aktif",
		},
		{
			kodeAkun: "502",
			nama: "Pensil 2B Faber Castell (Box)",
			kategori: "ATK",
			jumlahAwal: 25,
			jumlahSisa: 18,
			hargaSatuan: 28000,
			tanggalBeli: new Date("2025-01-20"),
			status: "Aktif",
		},
		// School Supplies - Linked to Biaya ATK Siswa account (521)
		{
			kodeAkun: "521",
			nama: "Buku Tulis Big Boss (Pack)",
			kategori: "Buku",
			jumlahAwal: 100,
			jumlahSisa: 65,
			hargaSatuan: 15000,
			tanggalBeli: new Date("2025-06-01"),
			status: "Aktif",
		},
		{
			kodeAkun: "521",
			nama: "Pensil Warna 24 Set",
			kategori: "ATK Siswa",
			jumlahAwal: 40,
			jumlahSisa: 28,
			hargaSatuan: 45000,
			tanggalBeli: new Date("2025-06-10"),
			status: "Aktif",
		},
		// Uniform - Linked to Biaya Seragam Siswa account (520)
		{
			kodeAkun: "520",
			nama: "Seragam Putih Abu (Set)",
			kategori: "Seragam",
			jumlahAwal: 60,
			jumlahSisa: 25,
			hargaSatuan: 125000,
			tanggalBeli: new Date("2025-05-15"),
			status: "Aktif",
		},
		{
			kodeAkun: "520",
			nama: "Seragam Olahraga (Set)",
			kategori: "Seragam",
			jumlahAwal: 50,
			jumlahSisa: 20,
			hargaSatuan: 95000,
			tanggalBeli: new Date("2025-05-15"),
			status: "Aktif",
		},
	];
	await prisma.inventory.createMany({ data: inventoryData });
	console.log(`   ✅ Created ${inventoryData.length} inventory items\n`);

	// 15. CREATE DEBTS
	console.log("14. Creating debts...");
	const today = new Date();
	const in10Days = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);

	const debtData = [
		{
			kodeAkun: "201",
			nama: "Pinjaman Modal Kerja Bank Mandiri",
			kreditur: "Bank Mandiri",
			jumlahAwal: 200000000,
			jumlahSisa: 150000000,
			tenor: 24,
			tanggalMulai: new Date("2025-01-01"),
			tanggalJatuhTempo: new Date("2027-01-01"),
			cicilanPerBulan: 8333333,
			status: "Aktif",
		},
		{
			kodeAkun: "200",
			nama: "Hutang Pembelian ATK",
			kreditur: "PT Office Supplies",
			jumlahAwal: 5000000,
			jumlahSisa: 2500000,
			tenor: 2,
			tanggalMulai: new Date("2025-10-01"),
			tanggalJatuhTempo: new Date("2025-11-30"),
			cicilanPerBulan: 2500000,
			status: "Aktif",
		},
		// Debts due within 30 days for reminders
		{
			kodeAkun: "200",
			nama: "Hutang Jatuh Tempo 10 Hari",
			kreditur: "PT Supplier A",
			jumlahAwal: 15000000,
			jumlahSisa: 15000000,
			tenor: 1,
			tanggalMulai: today,
			tanggalJatuhTempo: in10Days,
			cicilanPerBulan: 15000000,
			status: "Aktif",
		},
		{
			kodeAkun: "200",
			nama: "Hutang Jatuh Tempo 25 Hari",
			kreditur: "PT Supplier B",
			jumlahAwal: 8000000,
			jumlahSisa: 8000000,
			tenor: 1,
			tanggalMulai: today,
			tanggalJatuhTempo: new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000),
			cicilanPerBulan: 8000000,
			status: "Aktif",
		},
		// Overdue debt for debt table and edge-case views
		{
			kodeAkun: "200",
			nama: "Hutang Overdue Supplier Lama",
			kreditur: "PT Supplier Overdue",
			jumlahAwal: 6000000,
			jumlahSisa: 2750000,
			tenor: 3,
			tanggalMulai: new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000),
			tanggalJatuhTempo: new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000),
			cicilanPerBulan: 2000000,
			status: "Aktif",
		},
		// Settled debt for status filter coverage
		{
			kodeAkun: "201",
			nama: "Hutang Lunas Renovasi Ringan",
			kreditur: "CV Renovasi Cepat",
			jumlahAwal: 12000000,
			jumlahSisa: 0,
			tenor: 6,
			tanggalMulai: new Date("2024-01-01"),
			tanggalJatuhTempo: new Date("2024-07-01"),
			cicilanPerBulan: 2000000,
			status: "Lunas",
		},
	];
	await prisma.debt.createMany({ data: debtData });
	console.log(`   ✅ Created ${debtData.length} debts\n`);

	// 16. CREATE NOTIFICATIONS
	console.log("16. Creating notifications...");
	const notificationData = [
		{
			tipe: "approval_request",
			judul: "Persetujuan Jurnal Entry",
			pesan: "Terdapat 3 jurnal entry menunggu persetujuan",
			isRead: false,
			referenceId: "journal-batch-1",
		},
		{
			tipe: "piutang_jatuh_tempo",
			judul: "Piutang Jatuh Tempo",
			pesan: "5 siswa memiliki tagihan yang akan jatuh tempo dalam 7 hari",
			isRead: false,
			referenceId: "billing-due",
		},
		{
			tipe: "hutang_jatuh_tempo",
			judul: "Hutang Jatuh Tempo",
			pesan: "Hutang bank mandiri akan jatuh tempo dalam 30 hari",
			isRead: false,
			referenceId: "debt-1",
		},
		{
			tipe: "payroll_reminder",
			judul: "Pengingat Gaji",
			pesan: "Gaji karyawan periode November 2025 belum diproses",
			isRead: true,
			referenceId: "payroll-nov",
		},
		{
			tipe: "penyusutan_reminder",
			judul: "Penyusutan Bulanan",
			pesan: "Jurnal penyusutan aset tetap perlu dicatat",
			isRead: false,
			referenceId: "depreciation-nov",
		},
		{
			tipe: "approval_request",
			judul: "Persetujuan Transfer Kas",
			pesan: "Transfer Kas ke Bank sebesar Rp 10.000.000 menunggu persetujuan",
			isRead: false,
			referenceId: "transfer-1",
		},
		{
			tipe: "piutang_jatuh_tempo",
			judul: "Tagihan Overdue",
			pesan: "3 siswa memiliki tagihan overdue lebih dari 30 hari",
			isRead: false,
			referenceId: "billing-overdue",
		},
		{
			tipe: "system",
			judul: "Backup Berhasil",
			pesan: "Backup database otomatis berhasil dilakukan",
			isRead: true,
			referenceId: "backup-daily",
		},
	];
	await prisma.notification.createMany({ data: notificationData });
	console.log(`   ✅ Created ${notificationData.length} notifications\n`);

	// 17. CREATE AUDIT TRAIL ENTRIES
	console.log("17. Creating audit trail entries...");

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
		{
			action: "create",
			entity: "cashflow",
			entityId: createdCashflows[0]?.id ?? "cf-1",
			oldData: null,
			newData: { keterangan: "Pembayaran SPP", jumlah: 650000 },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "update",
			entity: "student",
			entityId: students[0]?.id ?? "std-1",
			oldData: { nama: "Ahmad" },
			newData: { nama: "Ahmad Fauzi" },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "delete",
			entity: "billing",
			entityId: "billing-old",
			oldData: { jumlah: 500000 },
			newData: null,
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "approve",
			entity: "journal",
			entityId: journalEntries[0]?.id ?? "je-1",
			oldData: { status: "draft" },
			newData: { status: "approved" },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "post",
			entity: "journal",
			entityId: journalEntries[0]?.id ?? "je-1",
			oldData: { status: "approved" },
			newData: { status: "posted" },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "create",
			entity: "payroll",
			entityId: "payroll-1",
			oldData: null,
			newData: { periode: "2025-10", jumlah: 8500000 },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "create",
			entity: "asset",
			entityId: "asset-1",
			oldData: null,
			newData: { nama: "Lahan Sekolah", harga: 500000000 },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
		{
			action: "create",
			entity: "debt",
			entityId: "debt-1",
			oldData: null,
			newData: { nama: "Pinjaman Bank", jumlah: 200000000 },
			userId: "admin-1",
			ipAddress: "192.168.1.1",
		},
	];

	await prisma.auditTrail.createMany({
		data: auditTrailData.map((d) => ({
			...d,
			oldData: d.oldData === null ? Prisma.JsonNull : d.oldData,
			newData: d.newData === null ? Prisma.JsonNull : d.newData,
		})),
	});
	console.log(`   ✅ Created ${auditTrailData.length} audit trail entries\n`);

	// 17. CREATE SNAPSHOTS
	console.log("17. Creating snapshots...");
	const snapshotData = [
		{
			academicYearId: activeAcademicYear.id,
			tipe: "neraca",
			data: { aset: 2500000000, kewajiban: 205000000, ekuitas: 2295000000 },
			totalDebit: 2500000000,
			totalKredit: 2500000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "labarugi",
			data: { pendapatan: 45000000, beban: 32000000, laba: 13000000 },
			totalDebit: 45000000,
			totalKredit: 45000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "neraca",
			data: { aset: 2520000000, kewajiban: 200000000, ekuitas: 2320000000 },
			totalDebit: 2520000000,
			totalKredit: 2520000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "labarugi",
			data: { pendapatan: 48000000, beban: 35000000, laba: 13000000 },
			totalDebit: 48000000,
			totalKredit: 48000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "neraca",
			data: { aset: 2540000000, kewajiban: 195000000, ekuitas: 2345000000 },
			totalDebit: 2540000000,
			totalKredit: 2540000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "labarugi",
			data: { pendapatan: 52000000, beban: 38000000, laba: 14000000 },
			totalDebit: 52000000,
			totalKredit: 52000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "neraca",
			data: { aset: 2560000000, kewajiban: 190000000, ekuitas: 2370000000 },
			totalDebit: 2560000000,
			totalKredit: 2560000000,
			createdBy: "admin-1",
		},
		{
			academicYearId: activeAcademicYear.id,
			tipe: "labarugi",
			data: { pendapatan: 55000000, beban: 40000000, laba: 15000000 },
			totalDebit: 55000000,
			totalKredit: 55000000,
			createdBy: "admin-1",
		},
	];
	await prisma.snapshot.createMany({ data: snapshotData, skipDuplicates: true });
	console.log(`   ✅ Created ${snapshotData.length} snapshots\n`);

	// 18. UPDATE STUDENT TOTALS
	console.log("18. Updating student totals...");
	for (const student of students) {
		const studentBillings = billings.filter((b) => b.studentId === student.id);
		const totalTagihan = studentBillings.reduce((sum, b) => sum + b.jumlah, 0);
		const totalBayar = studentBillings
			.filter((b) => b.statusBayar === "Lunas")
			.reduce((sum, b) => sum + b.jumlah, 0);
		const unpaidInstallments = await prisma.installment.count({
			where: {
				studentId: student.id,
				status: { not: "Bayar" },
			},
		});
		const statusBayar =
			totalTagihan > 0 && totalBayar >= totalTagihan && unpaidInstallments === 0
				? "Lunas"
				: "Belum Lunas";

		await prisma.student.update({
			where: { id: student.id },
			data: { totalTagihan, totalBayar, statusBayar },
		});
	}
	console.log("   ✅ Updated student totals\n");

	// 19. ALIGN BILLING INSTALLMENT STATUS FOR PIUTANG/PAYMENT USE CASES
	console.log("19. Aligning billing installment statuses...");
	const billingIdsWithInstallments = await prisma.installment.findMany({
		where: { billingId: { not: null } },
		select: { billingId: true },
		distinct: ["billingId"],
	});

	for (const item of billingIdsWithInstallments) {
		if (!item.billingId) continue;
		const remaining = await prisma.installment.count({
			where: {
				billingId: item.billingId,
				status: { not: "Bayar" },
			},
		});
		if (remaining === 0) {
			await prisma.billing.update({
				where: { id: item.billingId },
				data: { statusBayar: "Lunas", tanggalBayar: new Date() },
			});
		} else {
			await prisma.billing.update({
				where: { id: item.billingId },
				data: { statusBayar: "Belum Lunas", tanggalBayar: null },
			});
		}
	}
	console.log("   ✅ Billing/installment statuses aligned\n");

	// 20. CREATE OPENING BALANCE SCENARIO (uses account 3201)
	console.log("20. Creating opening balance scenario...");
	const openingJournalId = createId();
	await prisma.journalEntry.create({
		data: {
			id: openingJournalId,
			tanggal: new Date("2025-07-01"),
			keterangan: "Saldo Awal Periode 2025-07",
			reference: "OB-2025-0001",
			status: "approved",
			version: 1,
		},
	});

	await prisma.journalEntryLine.createMany({
		data: [
			{
				id: createId(),
				journalEntryId: openingJournalId,
				kodeAkun: "101",
				debit: 15000000,
				kredit: 0,
			},
			{
				id: createId(),
				journalEntryId: openingJournalId,
				kodeAkun: "102",
				debit: 10000000,
				kredit: 0,
			},
			{
				id: createId(),
				journalEntryId: openingJournalId,
				kodeAkun: "3201",
				debit: 0,
				kredit: 25000000,
			},
		],
	});
	console.log("   ✅ Opening balance scenario created\n");

	// 21. FIX CASHFLOW REFERENCE LINKS FOR JOURNAL WORKFLOWS
	console.log("21. Linking journal cashflow references...");
	const draftJournals = await prisma.journalEntry.findMany({
		where: { status: "draft", reference: { startsWith: "DRAFT-" } },
		select: { id: true, reference: true },
		take: 5,
	});
	for (const journal of draftJournals) {
		await prisma.cashflow.create({
			data: {
				tanggal: new Date("2025-11-14"),
				keterangan: `Cashflow draft untuk ${journal.reference}`,
				kodeAkun: "101",
				kategori: "journal",
				debit: 250000,
				kredit: 0,
				status: "draft",
				referenceId: journal.reference,
				source: "kas",
			},
		});
	}
	console.log("   ✅ Journal cashflow references linked\n");

	const endTime = Date.now();
	const duration = ((endTime - startTime) / 1000).toFixed(2);

	console.log("✅ Seeding complete!");
	console.log(`⏱️  Duration: ${duration}s`);
	console.log("\n📊 Summary:");
	console.log(`   - Accounts: ${ACCOUNTS.length}`);
	console.log(`   - Academic Years: ${academicYears.length}`);
	console.log(`   - Students: ${students.length}`);
	console.log(`   - Employees: ${employees.length}`);
	console.log(`   - Billings: ${billings.length}`);
	console.log(`   - Installments: ${installmentData.length}`);
	console.log(`   - Cashflows: ${createdCashflows.length}`);
	console.log(`   - Transfers: ${transferData.length}`);
	console.log(`   - Journal Entries: ${journalEntries.length}`);
	console.log(`   - Journal Entry Lines: ${journalLines.length}`);
	console.log(`   - Employee Billings: ${employeeBillingData.length}`);
	console.log(`   - Assets: ${assetData.length}`);
	console.log(`   - Debts: ${debtData.length}`);
	console.log(`   - Notifications: ${notificationData.length}`);
	console.log(`   - Audit Trails: ${auditTrailData.length}`);
	console.log(`   - Snapshots: ${snapshotData.length}`);
	console.log("\n🎯 All pages should now have sufficient test data!");
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
