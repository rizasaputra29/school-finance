import { z } from 'zod';

// ==================== Account Types ====================
export const AccountCreateSchema = z.object({
  kodeAkun: z.string().min(1, 'Kode akun wajib diisi'),
  namaAkun: z.string().min(1, 'Nama akun wajib diisi'),
  tipeAkun: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  saldo: z.union([z.number(), z.string()]).optional().default(0),
});

export const AccountUpdateSchema = AccountCreateSchema.partial();

export type AccountCreateInput = z.infer<typeof AccountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof AccountUpdateSchema>;

// ==================== Cashflow Types ====================
export const CashflowCreateSchema = z.object({
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  keterangan: z.string().min(1, 'Keterangan wajib diisi'),
  kodeAkun: z.string().min(1, 'Kode akun wajib diisi'),
  kategori: z.string().optional(),
  debit: z.union([z.number(), z.string()]).optional().default(0),
  kredit: z.union([z.number(), z.string()]).optional().default(0),
});

export const CashflowUpdateSchema = CashflowCreateSchema.partial();

export type CashflowCreateInput = z.infer<typeof CashflowCreateSchema>;
export type CashflowUpdateInput = z.infer<typeof CashflowUpdateSchema>;

// ==================== Student Types ====================
export const StudentCreateSchema = z.object({
  nis: z.string().min(1, 'NIS wajib diisi'),
  nama: z.string().min(1, 'Nama wajib diisi'),
  kelas: z.string().optional(),
  alamat: z.string().optional(),
  namaOrangTua: z.string().optional(),
  telepon: z.string().optional(),
});

export const StudentUpdateSchema = StudentCreateSchema.partial();

export type StudentCreateInput = z.infer<typeof StudentCreateSchema>;
export type StudentUpdateInput = z.infer<typeof StudentUpdateSchema>;

// ==================== Billing Types ====================
export const BillingCreateSchema = z.object({
  studentId: z.string().min(1, 'Student ID wajib diisi'),
  jenisTagihan: z.string().min(1, 'Jenis tagihan wajib diisi'),
  jumlah: z.union([z.number(), z.string()]).optional().default(0),
  jatuhTempo: z.string().min(1, 'Tanggal jatuh tempo wajib diisi'),
  keterangan: z.string().optional(),
});

export const BillingUpdateSchema = BillingCreateSchema.partial().extend({
  status: z.enum(['LUNAS', 'BELUM_LUNAS']).optional(),
});

export type BillingCreateInput = z.infer<typeof BillingCreateSchema>;
export type BillingUpdateInput = z.infer<typeof BillingUpdateSchema>;

// ==================== Auth Types ====================
export const LoginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ==================== Import Types ====================
export const ImportDataSchema = z.object({
  type: z.enum(['students', 'billing', 'cashflow', 'accounts']),
  data: z.array(z.record(z.string(), z.unknown())),
});

export type ImportDataInput = z.infer<typeof ImportDataSchema>;

// ==================== Pagination Types ====================
export const PaginationParamsSchema = z.object({
  page: z.union([z.string(), z.number()]).optional().default(1),
  limit: z.union([z.string(), z.number()]).optional().default(10),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

// ==================== API Response Types ====================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CashflowResponse extends PaginatedResponse<unknown> {
  summary: {
    totalDebit: number;
    totalKredit: number;
    saldo: number;
  };
}
