-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "allowNegative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isContra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSystemProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kategori" TEXT,
ADD COLUMN     "normalBalance" TEXT NOT NULL DEFAULT 'debit';

-- AlterTable
ALTER TABLE "Cashflow" ADD COLUMN     "isReversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kategori" TEXT,
ADD COLUMN     "periode" TEXT,
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "jenisKelamin" TEXT,
ADD COLUMN     "namaOrtu" TEXT,
ADD COLUMN     "noTelp" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Active',
ADD COLUMN     "tahunAjaran" TEXT;

-- CreateTable
CREATE TABLE "Billing" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "jenisBiaya" TEXT NOT NULL,
    "periodeBulan" TEXT NOT NULL,
    "jumlah" DOUBLE PRECISION NOT NULL,
    "statusBayar" TEXT NOT NULL DEFAULT 'Belum Lunas',
    "tanggalBayar" TIMESTAMP(3),
    "catatan" TEXT,
    "cashflowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "kodeAkun" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "lokasi" TEXT,
    "tanggalPerolehan" TIMESTAMP(3) NOT NULL,
    "hargaPerolehan" DOUBLE PRECISION NOT NULL,
    "umurTeknis" INTEGER NOT NULL,
    "nilaiResidu" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isTanah" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "kodeAkun" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kreditur" TEXT,
    "jumlahAwal" DOUBLE PRECISION NOT NULL,
    "jumlahSisa" DOUBLE PRECISION NOT NULL,
    "tenor" INTEGER NOT NULL,
    "tanggalMulai" TIMESTAMP(3) NOT NULL,
    "tanggalJatuhTempo" TIMESTAMP(3) NOT NULL,
    "cicilanPerBulan" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aktif',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "billingId" TEXT,
    "cicilanKe" INTEGER NOT NULL,
    "jumlah" DOUBLE PRECISION NOT NULL,
    "tanggalJatuhTempo" TIMESTAMP(3) NOT NULL,
    "tanggalBayar" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Belum Bayar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "tahunAjaran" TEXT NOT NULL,
    "tanggalMulai" TIMESTAMP(3) NOT NULL,
    "tanggalSelesai" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "keterangan" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "isBackdated" BOOLEAN NOT NULL DEFAULT false,
    "originalPeriod" TEXT,
    "adjustmentType" TEXT NOT NULL DEFAULT 'regular',
    "backdatedBy" TEXT,
    "backdatedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "kodeAkun" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tahun" INTEGER NOT NULL,
    "bulan" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "tanggalMulai" TIMESTAMP(3) NOT NULL,
    "tanggalAkhir" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "totalDebit" DOUBLE PRECISION NOT NULL,
    "totalKredit" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "pesan" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jabatan" TEXT NOT NULL,
    "jenisKelamin" TEXT,
    "noTelp" TEXT,
    "alamat" TEXT,
    "tanggalMasuk" TIMESTAMP(3) NOT NULL,
    "gajiPokok" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "jenisPembayaran" TEXT NOT NULL,
    "jumlah" DOUBLE PRECISION NOT NULL,
    "keterangan" TEXT,
    "tanggalBayar" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Belum Bayar',
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "userId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Billing_cashflowId_key" ON "Billing"("cashflowId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_studentId_jenisBiaya_periodeBulan_key" ON "Billing"("studentId", "jenisBiaya", "periodeBulan");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_tahunAjaran_key" ON "AcademicYear"("tahunAjaran");

-- CreateIndex
CREATE INDEX "JournalEntry_tanggal_idx" ON "JournalEntry"("tanggal");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_isBackdated_idx" ON "JournalEntry"("isBackdated");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reference_key" ON "JournalEntry"("reference");

-- CreateIndex
CREATE INDEX "JournalEntryLine_kodeAkun_idx" ON "JournalEntryLine"("kodeAkun");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Period_kode_key" ON "Period"("kode");

-- CreateIndex
CREATE INDEX "Period_tahun_idx" ON "Period"("tahun");

-- CreateIndex
CREATE INDEX "Period_bulan_idx" ON "Period"("bulan");

-- CreateIndex
CREATE INDEX "Period_status_idx" ON "Period"("status");

-- CreateIndex
CREATE INDEX "Period_kode_idx" ON "Period"("kode");

-- CreateIndex
CREATE INDEX "Period_tanggalMulai_idx" ON "Period"("tanggalMulai");

-- CreateIndex
CREATE INDEX "Period_tanggalAkhir_idx" ON "Period"("tanggalAkhir");

-- CreateIndex
CREATE INDEX "Snapshot_periode_idx" ON "Snapshot"("periode");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_periode_tipe_key" ON "Snapshot"("periode", "tipe");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_tipe_idx" ON "Notification"("tipe");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nip_key" ON "Employee"("nip");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_jabatan_idx" ON "Employee"("jabatan");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_journalEntryId_key" ON "Payroll"("journalEntryId");

-- CreateIndex
CREATE INDEX "Payroll_periode_idx" ON "Payroll"("periode");

-- CreateIndex
CREATE INDEX "Payroll_status_idx" ON "Payroll"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_employeeId_periode_jenisPembayaran_key" ON "Payroll"("employeeId", "periode", "jenisPembayaran");

-- CreateIndex
CREATE INDEX "AuditTrail_entity_entityId_idx" ON "AuditTrail"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditTrail_createdAt_idx" ON "AuditTrail"("createdAt");

-- CreateIndex
CREATE INDEX "Account_tipeAkun_idx" ON "Account"("tipeAkun");

-- CreateIndex
CREATE INDEX "Account_kategori_idx" ON "Account"("kategori");

-- CreateIndex
CREATE INDEX "Account_isSystem_idx" ON "Account"("isSystem");

-- CreateIndex
CREATE INDEX "Account_normalBalance_idx" ON "Account"("normalBalance");

-- CreateIndex
CREATE INDEX "Account_createdAt_idx" ON "Account"("createdAt");

-- CreateIndex
CREATE INDEX "Account_updatedAt_idx" ON "Account"("updatedAt");

-- CreateIndex
CREATE INDEX "Cashflow_tanggal_idx" ON "Cashflow"("tanggal");

-- CreateIndex
CREATE INDEX "Cashflow_kodeAkun_idx" ON "Cashflow"("kodeAkun");

-- CreateIndex
CREATE INDEX "Cashflow_periode_idx" ON "Cashflow"("periode");

-- CreateIndex
CREATE INDEX "Cashflow_status_idx" ON "Cashflow"("status");

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_cashflowId_fkey" FOREIGN KEY ("cashflowId") REFERENCES "Cashflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashflow" ADD CONSTRAINT "Cashflow_kodeAkun_fkey" FOREIGN KEY ("kodeAkun") REFERENCES "Account"("kodeAkun") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_kodeAkun_fkey" FOREIGN KEY ("kodeAkun") REFERENCES "Account"("kodeAkun") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_kodeAkun_fkey" FOREIGN KEY ("kodeAkun") REFERENCES "Account"("kodeAkun") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_kodeAkun_fkey" FOREIGN KEY ("kodeAkun") REFERENCES "Account"("kodeAkun") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
