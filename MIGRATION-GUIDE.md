# Database Migration and Testing - Final Integration Guide

## Overview
This document outlines the steps to complete the school finance system database migration and testing.

---

## Migration Steps

### Prerequisites
Ensure your `.env` file contains:
```
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret-key"
ADMIN_EMAIL="admin@school.com"
ADMIN_PASSWORD_HASH="..." # bcrypt hash
```

### Step 1: Generate Prisma Client
```bash
npx prisma generate
```

### Step 2: Run Database Migration
```bash
npx prisma migrate dev --name add_assets_debts_installments_academic_year
```

**Note**: The schema includes these new models:
- `Asset` - Fixed assets tracking (Tanah, Gedung, Kendaraan, Peralatan)
- `Debt` - Liability/debt tracking (Hutang)
- `Installment` - Student payment installments
- `AcademicYear` - Academic year management
- `JournalEntry` & `JournalEntryLine` - Double-entry bookkeeping
- `Period` - Period management (bulan/tahun)
- `Snapshot` - Data freeze for reports
- `Notification` - System notifications
- `AuditTrail` - Audit logging

### Step 3: Seed Default Data
```bash
npx prisma db seed
```

This will create:
- Complete Chart of Accounts (77 accounts matching "AL MADEENA MASTER")
- Default fee structures for PLAYGROUP and KINDERGARTEN
- Account code mappings for fee types

---

## Testing Checklist

### 1. Authentication & Authorization
- [ ] Login with **owner** role (full access)
- [ ] Login with **admin** role (manage students, transactions, reports)
- [ ] Login with **user** role (view only, limited create)

### 2. Transaction Management
- [ ] Create **pemasukan** (income) transaction
- [ ] Create **pengeluaran** (expense) transaction
- [ ] Create **asset purchase** transaction
- [ ] Create **debt/hutang** entry
- [ ] Create **piutang** entry

### 3. Double-Entry Validation
- [ ] Test valid transaction (debit = kredit) - should succeed
- [ ] Test invalid transaction (debit ≠ kredit) - should show error
- [ ] Test transaction with both debit and kredit on same line - should fail

### 4. Report Calculations
- [ ] **Laba/Rugi Report**
  - Total Pendapatan should match revenue account balances
  - Total Beban should match expense account balances
  - Laba/Rugi = Pendapatan - Beban
- [ ] **Neraca (Balance Sheet)**
  - Total Aset = Total Kewajiban + Total Ekuitas
  - Verify Asset accounts (101-111)
  - Verify Liability accounts (200-201)
  - Verify Equity accounts (300-304)

### 5. Import/Export
- [ ] Import with **duplicates** - should handle gracefully (idempotency)
- [ ] Import with **new data** - should create new records
- [ ] Export to **PDF** - verify formatting
- [ ] Export to **Excel** - verify data integrity

### 6. Dashboard
- [ ] Charts render correctly
- [ ] Data reflects actual transactions
- [ ] Date filtering works

### 7. Student Billing
- [ ] Create billing for student
- [ ] Record payment (cash/bank)
- [ ] Track installment payments

---

## Acceptance Criteria Verification

| # | Criteria | Verification Method |
|---|----------|---------------------|
| 1 | Database migration applies successfully | Run `npx prisma migrate dev` - should succeed with no errors |
| 2 | All API endpoints functional | Test each endpoint with appropriate HTTP method |
| 3 | Double-entry validation working | Create imbalanced transaction - should reject |
| 4 | Laba Rugi calculation correct | Compare with manual calculation from account balances |
| 5 | Neraca balance verified | Verify Aset = Kewajiban + Ekuitas |
| 6 | RBAC roles working | Login with each role - verify permissions |
| 7 | All CRUD operations functional | Create, Read, Update, Delete on each entity |

---

## Key Implementation Details

### Double-Entry Validation
Located in `src/lib/accounting/validation.ts`:
- `validateDebitKreditBalance()` - Ensures total debit = total kredit
- `validateTransaction()` - Full validation pipeline
- `validateBulkImport()` - Per-row validation for imports

### Chart of Accounts (77 Accounts)
- **Aktiva Lancar** (101-106): Kas, Bank, Piutang Siswa, etc.
- **Aktiva Tetap** (107-111): Tanah, Gedung, Kendaraan, etc.
- **Kewajiban** (200-201): Hutang Usaha, Hutang Lancar
- **Modal** (300-304): Setoran Modal, Modal Awal, Laba/Rugi
- **Pendapatan** (400-407): Registration, Building, Activities, etc.
- **Biaya** (500-522): Salary, Allowance, ATK, Electricity, etc.

### Authentication
- Owner: Full system access
- Admin: Manage students, transactions, reports
- User: View-only access

---

## Troubleshooting

### Migration Fails
1. Check DATABASE_URL is correct
2. Ensure PostgreSQL is running
3. Run `npx prisma migrate reset` if schema is out of sync

### Seed Fails
1. Check ADMIN_PASSWORD_HASH is valid bcrypt
2. Ensure no conflicting data exists
3. Run cleanup first: `npx prisma execute --sql 'DELETE FROM ...'`

### API Returns 500
1. Check server logs for error details
2. Verify JWT_SECRET is set
3. Ensure Prisma client is generated

---

## Next Steps

After successful migration and testing:
1. Deploy to production environment
2. Set up scheduled database backups
3. Configure monitoring for error tracking
4. Document user manual for end users