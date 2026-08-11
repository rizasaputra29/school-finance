# School Finance Accounting System Rules (transaction.md)

This document contains absolute rules for the development and maintenance of the school finance application. Every feature addition, API endpoint, or database schema must comply with the Double-Entry System logic to ensure that the General Ledger, Balance Sheet, Income Statement, and Cash Flow remain **BALANCED** and completely integrated without data mismatches.

**Reference:** This COA is aligned with AL MADEENA ISLAMIC SCHOOL CIREBON accounting system and **ISAK 35** (Indonesian Accounting Standard for Non-Profit Entities).

---

## 1. Chart of Accounts (COA) Structure

All account codes use **3-digit format** matching the `prisma/seed.ts` implementation.

### 1.1 ASSETS (1xx) — Normal Balance: Debit

| Kode | Nama Akun | Kategori | Normal Balance |
|------|-----------|----------|----------------|
| **101** | **Kas** | Kas | Debit |
| **102** | **Bank** | Bank | Debit |
| **103** | **Piutang Siswa** | Piutang | Debit |
| **104** | **Piutang Lain-Lain** | Piutang | Debit |
| **105** | **Piutang Periode Sebelumnya** | Piutang | Debit |
| **106** | **Biaya Dibayar Dimuka** | Lancar Lainnya | Debit |
| **107** | **Tanah** | Aset Tetap | Debit |
| **108** | **Gedung** | Aset Tetap | Debit |
| **109** | **Kendaraan** | Aset Tetap | Debit |
| **110** | **Peralatan Kantor** | Aset Tetap | Debit |
| **111** | **Akumulasi Penyusutan Aktiva Tetap** | Akumulasi Penyusutan | **Credit** (Contra) |

> **Exception:** Akumulasi Penyusutan (111) is a *Contra-Asset* — Increases on Credit, Decreases on Debit.

### 1.2 LIABILITIES (2xx) — Normal Balance: Credit

| Kode | Nama Akun | Kategori | Normal Balance |
|------|-----------|----------|----------------|
| **200** | **Hutang Usaha** | Hutang Lancar | Credit |
| **201** | **Hutang Lancar** | Hutang Bank | Credit |

### 1.3 NET ASSETS / EKUITAS (3xx) — Normal Balance: Credit

**ISAK 35 Requirement:** Aset Neto MUST be classified into three categories:

| Kode | Nama Akun | Kategori ISAK 35 | Normal Balance |
|------|-----------|------------------|----------------|
| **300** | **Setoran Modal Pemilik** | Tidak Terikat | Credit |
| **301** | **Modal Awal** | Tidak Terikat | Credit |
| **302** | **Laba (Rugi) Periode Sebelumnya** | Tidak Terikat | Credit |
| **303** | **Laba (Rugi) Periode Berjalan** | Tidak Terikat | Credit |
| **304** | **Prive** | Tidak Terikat | Debit (contra-equity) |
| **3201** | **Ekuitas Saldo Awal** | Tidak Terikat | Credit |

> **ISAK 35 Rule:** Terikat Permanen can NEVER be reclassified to Tidak Terikat. Terikat Sementara can be reclassified to Tidak Terikat only when conditions are met (at period end).

### 1.4 REVENUE (4xx) — Normal Balance: Credit

| Kode | Nama Akun | Fee Type | Normal Balance |
|------|-----------|----------|----------------|
| **400** | **Penerimaan Dana Pendaftaran** | Pendaftaran | Credit |
| **401** | **Penerimaan Uang Gedung** | Gedung/Uang Pangkal | Credit |
| **402** | **Penerimaan Uang Kegiatan** | Kegiatan | Credit |
| **403** | **Penerimaan Uang Seragam** | Seragam | Credit |
| **404** | **Penerimaan Uang ATK** | ATK | Credit |
| **405** | **Penerimaan Uang SPP** | SPP | Credit |
| **406** | **Pendapatan Lain-Lain** | Lain-lain | Credit |
| **407** | **Penerimaan Piutang Siswa** | Piutang | Credit |
| **408** | **Penerimaan Uang Hibah** | Hibah | Credit |

### 1.5 EXPENSES (5xx) — Normal Balance: Debit

**Grouped by Excel categories (Biaya SPP, Biaya Pendaftaran, Biaya Kegiatan, Biaya Gedung, Biaya Seragam, Biaya ATK):**

| Kode | Nama Akun | Kategori Excel | Normal Balance |
|------|-----------|----------------|----------------|
| **500** | **Biaya Gaji** | Biaya SPP | Debit |
| **501** | **Biaya Tunjangan** | Biaya SPP | Debit |
| **502** | **Biaya ATK Kantor** | Biaya SPP | Debit |
| **503** | **Biaya UKS** | Biaya SPP | Debit |
| **504** | **Biaya Listrik, Internet dan Telepon** | Biaya SPP | Debit |
| **505** | **Biaya Iuran-Iuran** | Biaya SPP | Debit |
| **506** | **Biaya Kebersihan & Keamanan Kantor** | Biaya SPP | Debit |
| **507** | **Biaya Bahan Bakar** | Biaya SPP | Debit |
| **508** | **Biaya Admin Bank** | Biaya SPP | Debit |
| **509** | **Biaya PPDB** | Biaya Pendaftaran | Debit |
| **510** | **Biaya Konsumsi dan Rumah tangga** | Biaya Kegiatan | Debit |
| **511** | **Evaluasi Pembelajaran** | Biaya Kegiatan | Debit |
| **512** | **Biaya Kegiatan Kesiswaan** | Biaya Kegiatan | Debit |
| **513** | **Biaya Peningkatan SDM** | Biaya Kegiatan | Debit |
| **514** | **Biaya Parenting** | Biaya Kegiatan | Debit |
| **515** | **Biaya learning kit** | Biaya Kegiatan | Debit |
| **516** | **Biaya Sarana dan Prasarana** | Biaya Gedung | Debit |
| **517** | **Biaya Sewa** | Biaya Kegiatan | Debit |
| **518** | **Biaya Kunjungan Dinas** | Biaya Kegiatan | Debit |
| **519** | **Biaya Owner** | Biaya Gedung | Debit |
| **520** | **Biaya Seragam Siswa** | Biaya Seragam | Debit |
| **521** | **Biaya ATK Siswa** | Biaya ATK | Debit |
| **522** | **Biaya Gedung** | Biaya Gedung | Debit |
| **600** | **Beban Penyusutan Aktiva Tetap** | Penyusutan | Debit |

---

## 2. The Absolute Law of Double-Entry (Backend Engine)

To prevent data mismatches, all transaction recordings inside the `app/api/` folder and validation functions in `lib/accounting/accounting-validation.ts` must strictly obey these three laws:

1. **Basic Accounting Equation:** Total Assets = Total Liabilities + Total Net Assets (Equity).
2. **Journal Balance:** Within every single `journal_headers` record, the sum of `debit_amount` in the associated `journal_lines` **MUST BE EXACTLY EQUAL** to the sum of `credit_amount`.
3. **Atomic Transactions:** Use Prisma's `$transaction` feature strictly. If a system failure occurs while saving the Credit side, the Debit side save must be automatically rolled back. Journal entries must never be partially saved.

**Prisma Implementation Example (TypeScript):**

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create Header
  const header = await tx.journalHeader.create({ data: { ... } });
  
  // 2. Create Lines (Debit & Credit)
  await tx.journalLine.createMany({ data: lines });
  
  // 3. Balance Validation (Throw Error if Debit != Credit)
  if (totalDebit !== totalCredit) {
    throw new Error("Journal entry is unbalanced. Transaction aborted.");
  }
});
```

---

## 3. Single Source of Truth Reporting

Never create separate database tables to store "Ending General Ledger Balance", "Total Balance Sheet", or "Total Income Statement". This isolated table approach is the root cause of data mismatches.

* **General Ledger (`/api/reports/buku-besar`):** Generated dynamically by querying the `journal_lines` table filtered by Account ID and calculating the running balance chronologically.
* **Income Statement (`/api/reports/laba-rugi`):** Generated by summing all transactions from the **4xx (Revenue)** and **5xx (Expenses)** account groups within the selected timeframe.
* **Balance Sheet (`/api/reports/neraca`):** Generated by summing all mutations from the **1xx (Assets)**, **2xx (Liabilities)**, and **3xx (Net Assets)** account groups from the beginning of the system's operation up to the selected report date. The final Net Assets value must include the current year's Net Income/Loss to ensure the Balance Sheet balances perfectly.

---

## 4. ISAK 35 Mandatory Reports

**ISAK 35 requires FOUR (4) mandatory reports for non-profit entities (yayasan/sekolah):**

### 4.1 Laporan Posisi Keuangan (Balance Sheet)

**Endpoint:** `/api/reports/neraca`

**Structure:**
```
ASET
  Aktiva Lancar
    Kas (101)
    Bank (102)
    Piutang Siswa (103)
    Piutang Lain-Lain (104)
    Piutang Periode Sebelumnya (105)
    Biaya Dibayar Dimuka (106)
  Aktiva Tetap
    Tanah (107)
    Gedung (108)
    Kendaraan (109)
    Peralatan Kantor (110)
    Akumulasi Penyusutan (111)
TOTAL ASET

KEWAJIBAN
  Hutang Usaha (200)
  Hutang Lancar (201)
TOTAL KEWAJIBAN

ASET NETO
  Setoran Modal Pemilik (300)
  Modal Awal (301)
  Laba (Rugi) Periode Sebelumnya (302)
  Laba (Rugi) Periode Berjalan (303)
  Prive (304)
TOTAL ASET NETO

TOTAL KEWAJIBAN + ASET NETO
```

**Validation:** TOTAL ASET must equal TOTAL KEWAJIBAN + TOTAL ASET NETO (must equal 0 when summed).

### 4.2 Laporan Laba Rugi (Income Statement)

**Endpoint:** `/api/reports/laba-rugi`

**Parameters:** `academicYearId` (optional, defaults to active year)

**Structure:**
```
PENDAPATAN
  Penerimaan Dana Pendaftaran (400)
  Penerimaan Uang Gedung (401)
  Penerimaan Uang Kegiatan (402)
  Penerimaan Uang Seragam (403)
  Penerimaan Uang ATK (404)
  Penerimaan Uang SPP (405)
  Pendapatan Lain-Lain (406)
  Penerimaan Piutang Siswa (407)
  Penerimaan Uang Hibah (408)
JUMLAH PENDAPATAN

BIAYA USAHA
  [All expense accounts 500-522, 600]
JUMLAH BIAYA USAHA

LABA (RUGI) PERIODE BERJALAN = Pendapatan - Biaya (current academic year)
LABA (RUGI) PERIODE SEBELUMNYA = cumulative sum of ALL prior years' laba rugi
LABA (RUGI) TOTAL = Periode Berjalan + Periode Sebelumnya
```

**Validation:** Laba (Rugi) = Jumlah Pendapatan - Jumlah Biaya

**Carry-Forward Rule:** Revenue and Expense accounts do NOT carry forward between academic years. They generate laba rugi which flows to ekuitas (account 302/303).

### 4.3 Laporan Perubahan Aset Neto (Statement of Changes in Net Assets)

**Endpoint:** `/api/reports/perubahan-aset-neto`

**Parameters:** `academicYearId` (optional, defaults to active year)

**Structure:**
```
ASET NETO TIDAK TERIKAT
  Saldo Awal (300 + 301 + 302)
    302 = Laba Rugi Periode Sebelumnya (cumulative prior years)
  + Pendapatan Tidak Terikat (4xx) — current period only
  - Biaya Tidak Terikat (5xx) — current period only
  = Laba Rugi Periode Berjalan
  - Prive (304)
  Saldo Akhir = Saldo Awal + Laba Rugi Berjalan - Prive

TOTAL PERUBAHAN ASET NETO
```

**Validation:** 
- Saldo Akhir must match Neraca Aset Neto
- Revenue/Expense only from current academic year (no carry-forward)

### 4.4 Laporan Arus Kas (Cash Flow Statement)

**Endpoint:** `/api/reports/cashflow` (ENHANCED)

**Structure:**
```
ARUS KAS DARI KEGIATAN OPERASI
  Penerimaan SPP
  Penerimaan Pendaftaran
  Penerimaan Gedung
  Penerimaan Kegiatan
  Penerimaan Seragam
  Penerimaan ATK
  Penerimaan Lain-lain
  Pembayaran Gaji dan Tunjangan
  Pembayaran Operasional
  Pembayaran Biaya Kegiatan
  Pembayaran Biaya Gedung
KAS BERSIH DARI KEGIATAN OPERASI

ARUS KAS DARI KEGIATAN INVESTASI
  Pembelian Aktiva Tetap
  Penjualan Aktiva Tetap
KAS BERSIH DARI KEGIATAN INVESTASI

ARUS KAS DARI KEGIATAN PENDANAAN
  Penerimaan Setoran Modal Pemilik
  Pembayaran Prive
KAS BERSIH DARI KEGIATAN PENDANAAN

KENAIKAN (PENURUNAN) KAS BERSIH
SALDO KAS AWAL
SALDO KAS AKHIR
```

**Classification Rules:**
- **Operasi:** All revenue receipts (4xx) and operational expenses (5xx)
- **Investasi:** Purchase/sale of Aktiva Tetap (107-110)
- **Pendanaan:** Owner contributions (300), Prive (304)

### 4.5 Catatan Atas Laporan Keuangan (CaTK)

**Endpoint:** `/api/reports/catk` (NEW)

**Required Disclosures:**
1. **Informasi Umum:** Nama yayasan, alamat, tanggal pendirian, dasar hukum
2. **Ringkasan Kebijakan Akuntansi:** Metode akuntansi, basis akrual, kebijakan depresiasi
3. **ASET:** Rincian Aktiva Lancar dan Aktiva Tetap
4. **KEWAJIBAN:** Rincian Hutang Usaha dan Hutang Lancar
5. **ASET NETO:** Rincian per kategori (Tidak Terikat, Terikat Sementara, Terikat Permanen)
6. **PENDAPATAN:** Rincian per jenis (Pendaftaran, Gedung, Kegiatan, dll)
7. **BIAYA:** Rincian per kategori (Biaya SPP, Biaya Pendaftaran, dll)
8. **ASET NETO TERIKAT:** Syarat-syarat pengikatan dan penggunaannya
9. **TRANSAKSI DENGAN PIHAK BERELASI:** Jika ada
10. **PERISTIWA SETELAH PERIODE PELAPORAN:** Jika ada

---

## 5. Student Billing & Revenue Recognition

### 5.1 Fee Structure (Based on AL MADEENA)

| Kelas | Pendaftaran | Gedung | Kegiatan | Seragam | ATK | SPP | Total |
|-------|-------------|--------|----------|---------|-----|-----|-------|
| PLAYGROUP (PG) | 350,000 | 8,000,000 | 2,000,000 | 800,000 | 500,000 | 550,000 | 12,200,000 |
| KINDERGARTEN (KG) | 350,000 | 8,000,000 | 2,000,000 | 800,000 | 1,000,000 | 550,000 | 12,700,000 |

### 5.2 Revenue Recognition Timing

**Piutang is NOT created at billing creation.** Instead, piutang journal entries are created automatically when the `tanggalJatuhTempo` (due date) passes. This is handled by the `POST /api/piutang?action=auto-create` endpoint.

| Fee Type | Recognition Timing | Journal Entry |
|----------|-------------------|---------------|
| Pendaftaran | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Dana Pendaftaran (400) |
| Gedung | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Uang Gedung (401) |
| Kegiatan | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Uang Kegiatan (402) |
| Seragam | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Uang Seragam (403) |
| ATK | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Uang ATK (404) |
| SPP | After jatuh tempo (monthly) | Debit: Piutang Siswa (103), Credit: Penerimaan Uang SPP (405) |
| Hibah | After jatuh tempo | Debit: Piutang Siswa (103), Credit: Penerimaan Uang Hibah (408) |

**Billing Creation (no journal entry):**
- Billings are created with `tanggalJatuhTempo` and `keterangan` fields
- No journal entry at creation time
- Piutang journal is deferred until after the due date passes

### 5.3 Payment Processing

**Full Payment:**
```
Debit:  Kas (101) / Bank (102)
Credit: Piutang Siswa (103)
```

**Installment Payment (SPP - 6 installments):**
```
Debit:  Kas (101) / Bank (102)
Credit: Piutang Siswa (103)
```

### 5.4 Piutang (Receivables) Rules

| Account | Description | Usage |
|---------|-------------|-------|
| 103 | Piutang Siswa | Current period student fees (auto-created after jatuh tempo) |
| 104 | Piutang Karyawan | Employee billing receivables (auto-created after jatuh tempo) |
| 105 | Piutang Periode Sebelumnya | Previous period overdue fees (ISAK 35 requires separate disclosure) |

**Piutang Auto-Creation:**
- `POST /api/piutang?action=auto-create` — Runs daily or on-demand
- Finds billings where `tanggalJatuhTempo < now` and status is "Belum Lunas"
- Creates journal entries: Dr Piutang (103/104) / Cr Revenue (mapped per jenisBiaya)
- Uses `reference: "piutang-billing-{id}"` for idempotency (won't create duplicates)

**ISAK 35 Disclosure:** Piutang Periode Sebelumnya must be disclosed separately in CaTK.

> **Note:** Account 104 (Piutang Karyawan) is used for employee billing receivables (tipe="tagihan"). Student billing uses 103 (Piutang Siswa).

---

## 6. Expense Recognition & Classification

### 6.1 Expense Categories (Aligned with Excel)

| Category | Accounts | Description |
|----------|----------|-------------|
| **Biaya SPP** | 500-508 | Operational expenses funded by SPP revenue |
| **Biaya Pendaftaran** | 509 | PPDB-related expenses |
| **Biaya Kegiatan** | 510-515, 517-518 | Student activity expenses |
| **Biaya Gedung** | 516, 519, 522 | Building and facility expenses |
| **Biaya Seragam** | 520 | Uniform expenses |
| **Biaya ATK** | 521 | Student stationery expenses |

### 6.2 Expense Recognition Rules

- **Salary & Allowances (500, 501):** Recognized monthly when earned
- **Utilities (504):** Recognized when consumed
- **PPDB (509):** Recognized in the period incurred
- **Activities (510-518):** Recognized when activity occurs
- **Building (516, 519, 522):** Recognized when incurred, except prepaid rent
- **Prepaid Rent:** If rent is paid upfront, recognize over the rental period

### 6.3 Employee Expense Linking

**Employee expenses must link to `EmployeeBilling` model:**

| Jenis Biaya | Expense Account | Description |
|-------------|-----------------|-------------|
| Gaji | 500 | Biaya Gaji |
| Tunjangan | 501 | Biaya Tunjangan |
| Bonus | 501 | Biaya Tunjangan |
| Lembur | 500 | Biaya Gaji |
| Transport | 507 | Biaya Bahan Bakar |
| Makan | 510 | Biaya Konsumsi dan Rumah tangga |
| Lainnya | 500 | Biaya Gaji |

**Source:** `lib/services/billing.ts` — `EMPLOYEE_EXPENSE_ACCOUNTS` mapping

---

## 7. Aset Neto & Restriction Tracking

### 7.1 ISAK 35 Aset Neto Classification

**Three categories with different rules:**

| Category | Code | Description | Reclassification Allowed |
|----------|------|-------------|-------------------------|
| **Tidak Terikat** | 300-304 | No donor restrictions | N/A |
| **Terikat Sementara** | N/A (future) | Donor-imposed time/purpose restrictions | Yes, when conditions met |
| **Terikat Permanen** | N/A (future) | Donor-imposed perpetuity restrictions | **NEVER** |

### 7.2 Restriction Tracking Rules

**For each contribution/donation, track:**
1. **Donor name**
2. **Restriction type** (Tidak Terikat, Terikat Sementara, Terikat Permanen)
3. **Restriction conditions** (time period, specific purpose)
4. **Release conditions** (when Terikat Sementara becomes Tidak Terikat)

### 7.3 Journal Entry Examples

**Donation Received (Tidak Terikat):**
```
Debit:  Kas (101) / Bank (102)
Credit: Pendapatan Lain-Lain (406)
```

**Owner Capital Contribution:**
```
Debit:  Kas (101) / Bank (102)
Credit: Setoran Modal Pemilik (300)
```

### 7.4 Validation Rules

- Negative balance in any Aset Neto category is not allowed (except Prive which is contra-equity)

---

## 8. Cash Flow Classification

### 8.1 Classification Rules

**Every cash/bank journal entry MUST have cash flow classification:**

| Category | Code | Description | Examples |
|----------|------|-------------|----------|
| **Operasi** | OPS | Day-to-day operations | SPP receipts, salary payments, utility bills |
| **Investasi** | INV | Long-term asset transactions | Purchase/sale of Tanah, Gedung, Kendaraan |
| **Pendanaan** | FIN | Financing activities | Owner contributions, Prive |

### 8.2 Classification Mapping

| Transaction Type | Cash Flow Category |
|-----------------|-------------------|
| Penerimaan SPP | Operasi |
| Penerimaan Pendaftaran | Operasi |
| Penerimaan Gedung | Operasi |
| Penerimaan Kegiatan | Operasi |
| Penerimaan Seragam | Operasi |
| Penerimaan ATK | Operasi |
| Penerimaan Lain-lain | Operasi |
| Pembayaran Gaji | Operasi |
| Pembayaran Tunjangan | Operasi |
| Pembayaran Operasional | Operasi |
| Pembayaran Biaya Kegiatan | Operasi |
| Pembayaran Biaya Gedung | Operasi |
| Pembelian Aktiva Tetap | Investasi |
| Penjualan Aktiva Tetap | Investasi |
| Setoran Modal Pemilik | Pendanaan |
| Prive | Pendanaan |

### 8.3 Validation

**Every cashflow record must have:**
- `cashflowCategory` field (OPS/INV/FIN)
- Linked journal entry
- Proper classification based on account code

---

## 9. Automated Transaction Module Logic

### 9.1 Billing/Tuition Module (All Fee Types)

**When an invoice is issued (billing creation):**
- Billing record is created with `tanggalJatuhTempo` (due date) and `keterangan`
- **No journal entry is created at billing creation**
- Revenue recognition is deferred until the due date passes

**When `tanggalJatuhTempo` passes (auto-create piutang):**
```
Debit:  Piutang Siswa (103)
Credit: [Revenue Account based on fee type]
  - Pendaftaran → 400
  - Gedung → 401
  - Kegiatan → 402
  - Seragam → 403
  - ATK → 404
  - SPP → 405
  - Hibah → 408
```

This is handled by `POST /api/piutang?action=auto-create` which:
1. Marks overdue installments as "Jatuh Tempo"
2. Finds billings where `tanggalJatuhTempo < now` and creates piutang journal entries
3. Uses `reference: "piutang-billing-{id}"` for idempotency

**When payment received:**
```
Debit:  Kas (101) / Bank (102)
Credit: Piutang Siswa (103)
```

### 9.2 Installment Module (Student Billing Only)

**Installments are exclusive to student billing.** Employee billing does not support installments.

**Each SPP installment creates:**
```
Debit:  Piutang Siswa (103)
Credit: Penerimaan Uang SPP (405)
```

**Payment for each installment:**
```
Debit:  Kas (101) / Bank (102)
Credit: Piutang Siswa (103)
```

> **Note:** Cicilan billings can also be paid directly (full amount) without going through individual installments. When paid directly, all related installments are automatically marked as "Bayar" in the database.

### 9.3 Depreciation Module

**File:** `lib/accounting/accounting-depreciation.ts`

**Method:** Straight-Line
**Formula:** `(Acquisition Cost - Salvage Value) / Useful Life in Months`

**Journal Entry (at period end):**
```
Debit:  Beban Penyusutan Aktiva Tetap (600)
Credit: Akumulasi Penyusutan (111)
```

### 9.4 Initial Capital Module

**When foundation deposits initial capital:**
```
Debit:  Kas (101) / Bank (102)
Credit: Setoran Modal Pemilik (300)
```

### 9.5 Donation Module

**Donation (Tidak Terikat):**
```
Debit:  Kas (101) / Bank (102)
Credit: Pendapatan Lain-Lain (406)
```

### 9.6 Piutang Aging Module

**Track overdue receivables:**
- 30 days overdue: Warning notification
- 60 days overdue: Second warning
- 90+ days overdue: Collection action

**ISAK 35 Disclosure:** Piutang aging must be disclosed in CaTK.

### 9.7 Employee Billing Module

**Endpoint:** `POST /api/karyawan/billing`, `PATCH /api/karyawan/billing/[id]`

**Employee billing fields:**
- `tanggalJatuhTempo` — Due date for the billing
- `keterangan` — Description (e.g., "Gaji Bulan Maret")
- `tipe` — "tagihan" (employee owes school) or "pembayaran" (school pays employee)

**When employee billing is created (tipe=tagihan):**
- No journal entry at creation
- Piutang journal created after `tanggalJatuhTempo` passes (via auto-create):
```
Debit:  Piutang Lain-Lain (104)
Credit: Pendapatan Lain-Lain (406)
```

**When employee billing is paid (tipe=pembayaran, school pays employee):**
```
Debit:  [Expense Account based on jenisBiaya]
Credit: Kas (101) / Bank (102)
```

**Expense account mapping:**

| Jenis Biaya | Expense Account | Description |
|-------------|-----------------|-------------|
| Gaji | 500 | Biaya Gaji |
| Tunjangan | 501 | Biaya Tunjangan |
| Bonus | 501 | Biaya Tunjangan |
| Lembur | 500 | Biaya Gaji |
| Transport | 507 | Biaya Bahan Bakar |
| Makan | 510 | Biaya Konsumsi dan Rumah tangga |
| Lainnya | 500 | Biaya Gaji |

**Cashflow record:**
- `debit: 0` (cash goes OUT)
- `kredit: jumlah` (cash decreases)
- `cashflowCategory: "OPS"` (operational expense)

**Removed features:**
- Employee installments (EmployeeInstallment model deleted)
- Cicilan fields (isCicilan, tenor, tanggalMulaiCicilan removed from EmployeeBilling)
- Kasbon feature (Kasbon and KasbonInstallment models deleted)

---

## 10. Validation & Consistency Rules

### 10.1 Basic Validation

1. **Debit = Credit:** Every journal entry must balance
2. **Normal Balance:** Debit-normal accounts (1xx, 5xx, 6xx) cannot go negative unless explicitly allowed
3. **No Zero Amounts:** Journal entries cannot have zero amounts
4. **System Account Protection:** System accounts cannot be deleted

### 10.2 ISAK 35 Specific Validation

1. **Aset Neto Balance:** 300 + 301 + 302 + 303 + 304 = Total Aset Neto
2. **Reklasifikasi Rules:** Only at period end when conditions are met
3. **CaTK Completeness:** Required disclosures present

### 10.3 Report Consistency

**Validation Checklist:**
- [ ] Neraca: Total Aset = Total Kewajiban + Total Aset Neto
- [ ] Laba Rugi: Jumlah Pendapatan - Jumlah Biaya = Laba (Rugi)
- [ ] Perubahan Aset Neto: Saldo Awal + Perubahan = Saldo Akhir (matches Neraca)
- [ ] Arus Kas: Operasi + Investasi + Pendanaan = Kenaikan (Penurunan) Kas
- [ ] Cross-report: Laba Rugi flows to Aset Neto Tidak Terikat

### 10.4 Consistency Checker API

**Endpoint:** `/api/reports/consistency`

**Checks:**
1. Journal Balance (Total Debit = Total Kredit)
2. Ledger vs Account Balances match
3. Balance Sheet balances (Aset = Kewajiban + Aset Neto)
4. Profit/Loss calculation
5. Cash vs Cashflow consistency
6. Aset Neto cross-validation (Neraca vs Perubahan Aset Neto)

---

## 11. Period Controls

### 11.1 Fiscal Year Definition

**Academic Year:** July 1 - June 30 (e.g., 2024/2025 = July 2024 - June 2025)
**Calendar Year:** January 1 - December 31

### 11.2 Report Period Options

| Report | Academic Year | Calendar Year | Monthly |
|--------|---------------|---------------|---------|
| Neraca | ✅ | ✅ | ✅ |
| Laba Rugi | ✅ | ✅ | ✅ |
| Perubahan Aset Neto | ✅ | ✅ | ✅ |
| Arus Kas | ✅ | ✅ | ✅ |
| Buku Besar | ✅ | ✅ | ✅ |
| CaTK | ✅ | ✅ | ❌ |

### 11.3 Backdated Entry Rules

- Backdated entries allowed with approval
- Requires audit trail (who, when, why)
- No backdated entries after CaTK is finalized
- Previous period Piutang adjustments require special approval

### 11.4 Period Closing Rules

1. **Monthly Close:** Generate all 4 ISAK 35 reports + CaTK
2. **Annual Close:** Finalize reports, close period, generate opening balance for next period
3. **Opening Balance:** Next period opening = Previous period closing

### 11.5 UI Validation Rule

If a user performs a transaction that reduces an account balance to a negative value, the system must immediately display an error prompt, unless it involves specific accounts that are explicitly permitted to overdraw.

---

**Document Version:** 5.0  
**Last Updated:** June 27, 2026  
**Reference:** ISAK 35, AL MADEENA ISLAMIC SCHOOL CIREBON Accounting System  
**Maintained by:** School Finance Development Team
