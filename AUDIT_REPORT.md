# School Finance App — Compliance Audit Report

**Audit Date:** 2026-07-16  
**Rules File:** `/Users/riza/school-finance/rules.md`  
**Overall Compliance Score:** **62.5% (Partial)**

---

## 1. Form Handling (React Hook Form + Zod)

**Score: 4/10 — Partial**

### Compliant
- ✅ **`app/(dashboard)/billing/page.tsx`** (lines 89–100, 739–896): Uses `useForm`, `zodResolver`, `Controller`, `Field`, `FieldLabel`, `FieldError`, `mode: "onChange"`, `form.reset()` after success. Numeric coercion uses `parseFormattedNumber()`.
- ✅ **`app/(dashboard)/karyawan/billing/page.tsx`** (lines 120–131, 760–900): Same pattern as billing page.

### Partial
- ⚠️ **`components/reusable/FormDialog.tsx`** (line 17): Uses explicit `any` type: `form?: UseFormReturn<any>`.
- ⚠️ **Field accessibility**: Only billing pages consistently pass `data-invalid={!!form.formState.errors.xxx}` and `aria-invalid={!!form.formState.errors.xxx}`. Other pages don't use the Field component at all.
- ⚠️ **Numeric coercion**: Billing pages use `parseFormattedNumber()`, but other pages use raw `parseFloat()` or `parseInt()` without Zod transforms.

### Missing
- ❌ **`app/(dashboard)/students/page.tsx`** (lines 38–66, 492–620): Uses raw `useState` form handling (`formData`, `setFormData`) with NO `react-hook-form`, NO `zodResolver`, NO `Controller`, NO validation schema.
- ❌ **`app/(dashboard)/karyawan/page.tsx`** (lines 51–61, 219–351): Uses raw `useState` form handling with NO `react-hook-form`, NO Zod validation.
- ❌ **`app/(dashboard)/payment/page.tsx`** (lines 60–66, 440–528): Uses raw `useState` for payment form with NO `react-hook-form`, NO Zod.
- ❌ **`app/(dashboard)/cashflow/page.tsx`** (lines 43–51, 261–463): Uses raw `useState` for edit form with NO `react-hook-form`, NO Zod.
- ❌ **`app/(dashboard)/accounts/page.tsx`** (lines 63–68, 233–326): Uses raw `useState` form handling with NO `react-hook-form`, NO Zod.
- ❌ **`app/(dashboard)/keuangan/page.tsx`** (lines 61–68, 214–318): Uses raw `useState` for transfer form with NO `react-hook-form`, NO Zod.
- ❌ **No `useFieldArray`** found anywhere in the codebase.
- ❌ **`app/(dashboard)/students/page.tsx`** (lines 500, 514, 529, etc.): Uses raw `<select>` elements instead of `Controller`-wrapped inputs.

---

## 2. Table Handling (TanStack Table)

**Score: 5/10 — Partial**

### Compliant
- ✅ **`components/reusable/DataTable.tsx`**: Properly implements `@tanstack/react-table` with `useReactTable`, `getCoreRowModel`, `getPaginationRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getExpandedRowModel`, server pagination support, `ColumnDef<TData>` typing, sorting state, filtering state.
- ✅ **`app/(dashboard)/billing/page.tsx`** (lines 302–426): Uses reusable `DataTable` with typed `ColumnDef<BillingRowData>[]`, expandable rows, `renderSubComponent`.
- ✅ **`app/(dashboard)/karyawan/billing/page.tsx`** (lines 291–430): Uses reusable `DataTable` with typed `ColumnDef<EmployeeBillingRowData>[]`.
- ✅ **`components/ui/data-table.tsx`** (lines 43–58): Implements `<Skeleton>`-based `DataTableSkeleton` loader.

### Partial
- ⚠️ **`app/(dashboard)/jurnal/page.tsx`** (lines 97–150): Uses `DataTable` from `@/components/ui/data-table` (NOT the reusable one), but does use `ColumnDef<JurnalLine>[]` and TanStack Table APIs.
- ⚠️ **`app/(dashboard)/buku-besar/page.tsx`** (lines 58–103): Uses `DataTable` from `@/components/ui/data-table` with `ColumnDef<BukuBesarEntry>[]`.
- ⚠️ **Loading states**: The reusable `DataTable` in `components/reusable/DataTable.tsx` (lines 142–150) shows a simple text "Memuat..." instead of skeleton loaders. Only `components/ui/data-table.tsx` uses actual skeletons.
- ⚠️ **Server-side pagination**: Billing pages fetch 1000 records (`page=1&limit=1000`) and do client-side grouping/filtering. Not true server-side pagination for the grouped dataset.

### Missing
- ❌ **`app/(dashboard)/students/page.tsx`** (lines 367–446): Uses raw `<Table>` from shadcn/ui with manual mapping (`students.map(...)`). NO TanStack Table at all.
- ❌ **`app/(dashboard)/payment/page.tsx`** (lines 319–365): Uses raw `<Table>` from shadcn/ui. NO TanStack Table.
- ❌ **`app/(dashboard)/karyawan/page.tsx`** (lines 494–569): Uses raw `<Table>` from shadcn/ui. NO TanStack Table.
- ❌ **`app/(dashboard)/cashflow/page.tsx`** (lines 661–748): Uses raw `<Table>` from shadcn/ui. NO TanStack Table.
- ❌ **`app/(dashboard)/accounts/page.tsx`** (lines 436–477): Uses raw divs/lists. NO TanStack Table.
- ❌ **`app/(dashboard)/keuangan/page.tsx`** (lines 332–389, 418–444): Uses raw `<Table>` from shadcn/ui. NO TanStack Table.

---

## 3. Reusable Components

**Score: 7/10 — Partial**

### Compliant
All required components exist in `/components/reusable/`:
- ✅ **`DataTable.tsx`** (lines 1–216): Generic TanStack table with pagination, sorting, filtering, expandable rows.
- ✅ **`FormDialog.tsx`** (lines 1–74): Dialog wrapper with `form.reset()` on close.
- ✅ **`SearchableSelect.tsx`** (lines 1–136): Async searchable dropdown with debounce.
- ✅ **`StatusBadge.tsx`** (lines 1–36): Consistent status badges with `cva` variant mapping.
- ✅ **`CurrencyInput.tsx`** (lines 1–38): Rupiah-formatted input with `Rp` prefix, uses `formatNumberInput`.
- ✅ **`InstallmentPlanPreview.tsx`** (lines 1–75): Shows installment breakdown preview with `formatRupiah`.
- ✅ **`WizardModal.tsx`** (lines 1–123): Multi-step modal with progress bar, Back/Next.
- ✅ **`Field.tsx`** (lines 1–124): `Field`, `FieldLabel`, `FieldError`, `FieldDescription`, `FieldSet`, `FieldLegend`.
- ✅ **`BulkPayDialog.tsx`** (lines 1–209): Additional reusable component for bulk payments.

### Partial
- ⚠️ **Inconsistent usage**: Billing pages use most reusable components correctly. Many other pages (students, karyawan, payment, cashflow, accounts, keuangan) use raw Radix Dialog, raw `<input>`, raw `<select>`, and inline badge styling instead of the reusable components.

### Missing
- ❌ No `WizardModal` usage found anywhere in the codebase — the component exists but is never used.
- ❌ `SearchableSelect` is only used in billing pages; other pages use native `<select>`.
- ❌ `CurrencyInput` is only used in billing pages and BulkPayDialog; other pages use raw `<Input type="number">`.
- ❌ `FormDialog` is only used in billing pages; other pages inline Radix Dialog markup.

---

## 4. API & Data Fetching

**Score: 8/10 — Compliant**

### Compliant
- ✅ TanStack Query (`@tanstack/react-query`) used in all dashboard pages.
- ✅ `useMutation` used for POST/PUT/PATCH/DELETE operations in billing, students, karyawan, cashflow, accounts, payment, keuangan.
- ✅ `queryClient.invalidateQueries` called after mutations consistently.
- ✅ API routes are RESTful (mostly GET/POST/PATCH/DELETE).
- ✅ Zod validation on server routes:
  - `/api/billing/route.ts` (lines 32–48): `createBillingSchema` with `zodResolver` pattern via `validateBody`.
  - `/api/payment/manual/route.ts` (lines 33–45): `manualPaymentSchema` with `.safeParse()`.
  - `/api/students/route.ts` (lines 19–41): `createStudentSchema` with `.safeParse()`.
  - `/api/journal/route.ts` (lines 18–47): `createJournalSchema`, `approveSchema`, `postSchema`.
  - `/api/cashflow/route.ts` (lines 40–81): `createCashflowSchema`.
  - `/api/karyawan/billing/route.ts`: Zod validation present.

### Partial
- ⚠️ **`/api/karyawan/route.ts`** (not fully read): DELETE uses query param (`?id=...`) instead of path param (`/[id]`) — inconsistent REST pattern.
- ⚠️ Some mutations don't use optimistic updates.

### Missing
- ❌ `toast.promise()` is NOT used anywhere. All async operations manually call `toast.success` / `toast.error` in `onSuccess` / `onError` callbacks instead.

---

## 5. Financial Integration (Jurnal + COA + Buku Besar + Laporan)

**Score: 6/10 — Partial**

### Compliant
- ✅ **`postToJournal()`** called on every payment:
  - `/api/payment/manual/route.ts` (lines 118, 186): Student payments post to journal.
  - `/api/cashflow/route.ts` (lines 152, 558): Cashflow transactions post to journal.
  - `/lib/services/billing.ts` (lines 149, 199, 249): Billing payment helper functions post to journal.
- ✅ **COA balances updated atomically** within Prisma `$transaction`:
  - `/lib/services/journal.ts` (lines 86–102): Updates `tx.account.update({ saldo: { increment: ... } })` inside transaction.
  - `/api/journal/route.ts` (lines 560–577): Updates account balances when posting.
- ✅ **Cashflow records created alongside journal entries**:
  - `/api/payment/manual/route.ts` (lines 128–167): Creates `tx.cashflow.create` records for each journal line.
  - `/api/cashflow/route.ts` (lines 162–193): Creates cashflow records linked to journal.
  - `/api/journal/route.ts` (lines 371–393): Creates cashflow records when journal is created.
- ✅ **ISAK 35 Cash Flow Classification**:
  - `/api/cashflow/route.ts` (lines 93–111): `classifyCashflow()` maps accounts to OPS/INV/FIN.
- ✅ **Four Mandatory Reports API routes exist**:
  - `/api/reports/neraca/route.ts` ✅
  - `/api/reports/laba-rugi/route.ts` ✅
  - `/api/reports/perubahan-aset-neto/route.ts` ✅
  - `/api/reports/cashflow-report/route.ts` ✅
  - `/api/reports/catk/route.ts` ✅

### Partial
- ⚠️ **Account code mappings do NOT match the required ISAK 35 format**:
  - Rule requires: `Pendaftaran=4-0101`, `Gedung/Uang Pangkal=4-0102`, `Kegiatan=4-0103`, `Seragam=4-0104`, `ATK=4-0105`, `SPP=4-0106`, `default=4-0201`.
  - Actual in `/lib/services/billing.ts` (lines 28–36): `Pendaftaran="400"`, `Uang Pangkal="401"`, `Uang Kegiatan="402"`, `Uang Seragam="403"`, `Uang ATK="404"`, `SPP="405"`, `Hibah="408"`.
  - The chart of accounts in `/lib/accounting/accounting-chart-of-accounts.ts` uses 3-digit codes (400, 401, 500, 501) instead of the required 4-digit ISAK format. This is a **significant compliance gap** for ISAK 35 reporting.
- ⚠️ **Employee expense mappings do NOT match the rule**:
  - Rule requires: `Gaji=5-0101`, `Tunjangan=5-0102`, `Bonus=5-0102`.
  - Actual in `/lib/services/billing.ts` (lines 40–48): `Gaji="500"`, `Tunjangan="501"`, `Bonus="501"`.
- ⚠️ **Aset Neto Classification**: No evidence of tracking `Tidak Terikat (3-1xxx)`, `Terikat Sementara (3-2xxx)`, `Terikat Permanen (3-3xxx)` in the chart of accounts or reports. The equity accounts only have `300`, `301`, `302`, `303`, `304`, `3201`.

### Missing
- ❌ **`/api/billing/[id]/route.ts`** and **`/api/billing/bulk-pay/route.ts`**: Not fully audited, but the billing PATCH endpoint likely needs to verify it calls `postToJournal` for payments. Need to verify these endpoints.
- ❌ No `PAYMENT_TYPE_ACCOUNTS` mapping found under that exact name (the `FEE_TYPE_TO_ACCOUNT_CODE` exists but with wrong codes).
- ❌ Cashflow category for some manual transactions may default to `"OPS"` without proper classification logic in all API routes.

---

## 6. Context7 Usage

**Score: 0/10 — Missing**

- ❌ **No Context7 imports, references, or usage found anywhere** in the codebase.
- ❌ No `resolve-library-id` calls, no `query-docs` calls.
- ❌ No comments or documentation indicating Context7 is being used.
- **Note:** This is primarily a development-time tool usage rule. The codebase itself cannot "contain" Context7 usage, but there is no evidence (e.g., in docs, comments, or scripts) that developers are following this rule.

---

## 7. Code Style & Patterns

**Score: 6/10 — Partial**

### Compliant
- ✅ **TypeScript**: Used throughout. Strict mode status unknown but code is well-typed.
- ✅ **Tailwind CSS v4**: Uses v4 syntax like `bg-linear-to-br` (e.g., `accounts/page.tsx` line 401, `karyawan/page.tsx` line 401).
- ✅ **shadcn/ui**: Extensively used (`@/components/ui/*`).
- ✅ **`formatRupiah()`**: Used consistently across all pages.
- ✅ **`useDebounce()`**: Used in billing, students, cashflow, karyawan pages (from `use-debounce` package).
- ✅ **Business logic in `/lib/services/`**: `journal.ts`, `billing.ts`, `piutang.ts` contain business logic.
- ✅ **`parseFormattedNumber()` / `formatNumberInput()`**: Available and used in billing pages and currency utilities.

### Partial
- ⚠️ **`any` type used**: `FormDialog.tsx` line 17 explicitly disables the ESLint rule for `any`.
- ⚠️ **`"use client"` directive**: Almost every dashboard page is a client component. This is appropriate for highly interactive pages, but some simpler display pages (e.g., reports) might benefit from server components.
- ⚠️ **`toast.promise()`**: NOT used anywhere. Rule explicitly requires `toast.promise()` for async operations with loading/success/error states.

### Missing
- ❌ **Numeric parsing inconsistency**: Many pages use `parseFloat(form.gajiPokok)` or `parseInt(form.tahunMasuk)` directly instead of the project's `parseFormattedNumber()` utility.
- ❌ **Form validation inconsistency**: Many pages don't use Zod at all (see Section 1).

---

## 8. You Might Not Need an Effect (React Effects Best Practices)

**Score: 4/10 — Partial**

### Compliant
- ✅ **External system subscriptions**:
  - `AuthContext.tsx` (line 71): Auth state check — acceptable for external auth system.
  - `AcademicYearContext.tsx` (line 94): Data fetching for academic year — acceptable.
  - `AppSidebar.tsx` (line 136): Mobile/desktop detection — acceptable for window/media queries.
  - `components/ui/sidebar.tsx` (line 97): shadcn sidebar state — acceptable.
  - `ReminderBell.tsx` (line 31): Notification check — acceptable.
  - `reminder/page.tsx` (lines 77–84): `localStorage` read on mount — acceptable one-time init.

### Partial
- ⚠️ **`app/(dashboard)/installment/page.tsx`** (lines 9–11): Uses `useEffect(() => { router.replace("/billing"); }, [router])` for redirect. This could be done with Next.js middleware or a server redirect instead, but is a common pattern.

### Missing / Anti-Patterns
- ❌ **State reset on prop change in Effects** (Rule violation: "Resetting State"):
  - `app/(dashboard)/jurnal/page.tsx` (lines 26–31): `useEffect(() => { setStartDate(selectedYear.tanggalMulai); setEndDate(selectedYear.tanggalSelesai); }, [selectedYear]);`
  - `app/(dashboard)/buku-besar/page.tsx` (lines 24–29): Same pattern.
  - `app/(dashboard)/cashflow/page.tsx` (lines 63–68): Same pattern.
  - `app/(dashboard)/reports/page.tsx` (lines 26–30): Same pattern.
  - **Fix:** Pass `key={selectedYear?.id}` to the component or compute dates during rendering instead of syncing state in an Effect.

- ❌ **Data transformation in Effects** (Rule violation: "Don't use Effects to transform data for rendering"):
  - `app/(dashboard)/students/page.tsx` (lines 194–203): `useMemo(() => students.filter(...), [students, searchTerm])` — actually uses `useMemo`, which is the correct pattern. ✅
  - However, many pages compute filtered lists inline during render, which is correct.

- ❌ **POST in Effects**: Not found. ✅
- ❌ **Chains of Effects**: Not found. ✅
- ❌ **Event handling in Effects**: Not found. ✅

---

## Summary Table

| Rule Section | Score | Status |
|---|---|---|
| 1. Form Handling (RHF + Zod) | 4/10 | ⚠️ Partial |
| 2. Table Handling (TanStack Table) | 5/10 | ⚠️ Partial |
| 3. Reusable Components | 7/10 | ⚠️ Partial |
| 4. API & Data Fetching | 8/10 | ✅ Compliant |
| 5. Financial Integration | 6/10 | ⚠️ Partial |
| 6. Context7 Usage | 0/10 | ❌ Missing |
| 7. Code Style & Patterns | 6/10 | ⚠️ Partial |
| 8. You Might Not Need an Effect | 4/10 | ⚠️ Partial |

### **Overall Compliance: 62.5%**

---

## Top Priority Recommendations

1. **Fix ISAK 35 Account Mappings** (Critical): Update `FEE_TYPE_TO_ACCOUNT_CODE` and `EMPLOYEE_EXPENSE_ACCOUNTS` in `/lib/services/billing.ts` and the Chart of Accounts in `/lib/accounting/accounting-chart-of-accounts.ts` to use the required 4-digit format (4-0101, 5-0101, etc.). Add Aset Neto classification accounts (3-1xxx, 3-2xxx, 3-3xxx).

2. **Migrate Remaining Pages to React Hook Form + Zod** (High): Students, Karyawan, Payment, Cashflow, Accounts, and Keuangan pages all use raw `useState` form handling. Migrate them to use `useForm`, `zodResolver`, `Controller`, `Field`, and `CurrencyInput`.

3. **Migrate Remaining Pages to TanStack Table** (High): Students, Payment, Karyawan, Cashflow, Accounts, and Keuangan pages use raw HTML tables. Migrate them to the reusable `DataTable` component.

4. **Fix Effects Anti-Patterns** (Medium): Replace `useEffect` date-range resets in Jurnal, Buku Besar, Cashflow, and Reports pages with `key` prop-based component resets or compute values during render.

5. **Use Skeleton Loaders Consistently** (Medium): Update `components/reusable/DataTable.tsx` to use `<Skeleton>` components instead of plain text "Memuat...".

6. **Use `toast.promise()`** (Low): Replace manual `toast.success`/`toast.error` patterns in mutations with `toast.promise()`.

7. **Remove `any` Type** (Low): Fix `FormDialog.tsx` line 17 to use a generic type parameter instead of `any`.

8. **Document Context7 Usage** (Low): Since this is a development process rule, ensure team documentation reflects Context7 usage for library docs.
