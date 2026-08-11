"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Search,
	Users,
	Plus,
	Pencil,
	Trash2,
	Briefcase,
	UserCheck,
	UserX,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "@/components/reusable/FormDialog";
import {
	Field,
	FieldLabel,
	FieldError,
} from "@/components/reusable/Field";
import { DataTable } from "@/components/reusable/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { Employee } from "@/types/employee";
import type { Pagination } from "@/types/pagination";

const JABATAN_OPTIONS = [
	"Guru",
	"Staff",
	"Kepala Sekolah",
	"Wakil Kepala Sekolah",
	"Admin",
	"Kebersihan",
	"Satpam",
];

const STATUS_OPTIONS = [
	{ value: "Active", label: "Aktif" },
	{ value: "Inactive", label: "Nonaktif" },
];

const JENIS_KELAMIN_OPTIONS = [
	{ value: "", label: "-" },
	{ value: "L", label: "Laki-laki" },
	{ value: "P", label: "Perempuan" },
];

const employeeFormSchema = z.object({
	nip: z.string().min(1, "NIP wajib diisi"),
	nama: z.string().min(1, "Nama wajib diisi"),
	jabatan: z.string().min(1, "Jabatan wajib dipilih"),
	jenisKelamin: z.string().optional(),
	noTelp: z.string().optional(),
	alamat: z.string().optional(),
	tanggalMasuk: z.string().min(1, "Tanggal masuk wajib diisi"),
	gajiPokok: z.string().optional(),
	status: z.string(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export default function KaryawanPage() {
	const { isAdmin } = useAuth();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebounce(search, 400);
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [jabatanFilter, setJabatanFilter] = useState<string>("");
	const [currentPage, setCurrentPage] = useState(1);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

	const createForm = useForm<EmployeeFormValues>({
		resolver: zodResolver(employeeFormSchema),
		defaultValues: {
			nip: "",
			nama: "",
			jabatan: "",
			jenisKelamin: "",
			noTelp: "",
			alamat: "",
			tanggalMasuk: new Date().toISOString().split("T")[0],
			gajiPokok: "",
			status: "Active",
		},
		mode: "onChange",
	});

	const editForm = useForm<EmployeeFormValues>({
		resolver: zodResolver(employeeFormSchema),
		defaultValues: {
			nip: "",
			nama: "",
			jabatan: "",
			jenisKelamin: "",
			noTelp: "",
			alamat: "",
			tanggalMasuk: new Date().toISOString().split("T")[0],
			gajiPokok: "",
			status: "Active",
		},
		mode: "onChange",
	});

	const { data: queryResult, isLoading } = useQuery({
		queryKey: ["employees", currentPage, debouncedSearch, statusFilter, jabatanFilter],
		queryFn: async () => {
			const params = new URLSearchParams({
				page: String(currentPage),
				limit: "10",
				...(debouncedSearch && { search: debouncedSearch }),
				...(statusFilter && { status: statusFilter }),
				...(jabatanFilter && { jabatan: jabatanFilter }),
			});
			const res = await fetch(`/api/karyawan?${params}`);
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data karyawan");
			return result;
		},
	});

	const employees: Employee[] = queryResult?.data ?? [];
	const summary = queryResult?.meta?.summary ?? { total: 0, active: 0, inactive: 0 };
	const pagination: Pagination = queryResult?.meta?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 0 };

	const createMutation = useMutation({
		mutationFn: async (data: EmployeeFormValues) => {
			const res = await fetch("/api/karyawan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					gajiPokok: parseFloat(data.gajiPokok || "0") || 0,
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menyimpan");
			return result;
		},
		onSuccess: (result) => {
			setIsCreateOpen(false);
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			toast.success(`Karyawan ${result.data.nama} berhasil ditambahkan`);
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const editMutation = useMutation({
		mutationFn: async (data: EmployeeFormValues) => {
			if (!selectedEmployee) throw new Error("No employee selected");
			const res = await fetch("/api/karyawan", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: selectedEmployee.id,
					...data,
					gajiPokok: parseFloat(data.gajiPokok || "0") || 0,
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menyimpan");
			return result;
		},
		onSuccess: (result) => {
			setIsEditOpen(false);
			setSelectedEmployee(null);
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			toast.success(`Karyawan ${result.data.nama} berhasil diupdate`);
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			if (!selectedEmployee) throw new Error("No employee selected");
			const res = await fetch(`/api/karyawan?id=${selectedEmployee.id}`, {
				method: "DELETE",
			});
			if (res.status === 204) {
				return { success: true, data: selectedEmployee };
			}
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menghapus data");
			return result;
		},
		onSuccess: (result) => {
			setIsDeleteOpen(false);
			setSelectedEmployee(null);
			queryClient.invalidateQueries({ queryKey: ["employees"] });
			toast.success(`Karyawan ${result.data?.nama || selectedEmployee?.nama} berhasil dihapus`);
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const openEditDialog = (emp: Employee) => {
		setSelectedEmployee(emp);
		editForm.reset({
			nip: emp.nip,
			nama: emp.nama,
			jabatan: emp.jabatan,
			jenisKelamin: emp.jenisKelamin || "",
			noTelp: emp.noTelp || "",
			alamat: emp.alamat || "",
			tanggalMasuk: new Date(emp.tanggalMasuk).toISOString().split("T")[0],
			gajiPokok: String(emp.gajiPokok),
			status: emp.status,
		});
		setIsEditOpen(true);
	};

	const handleCreate = createForm.handleSubmit((data) => {
		createMutation.mutate(data);
	});

	const handleEdit = editForm.handleSubmit((data) => {
		editMutation.mutate(data);
	});

	const columns: ColumnDef<Employee>[] = [
		{
			accessorKey: "nip",
			header: "NIP",
			cell: ({ row }) => (
				<span className="font-mono text-sm">{row.original.nip}</span>
			),
		},
		{
			accessorKey: "nama",
			header: "Nama",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.nama}</span>
			),
		},
		{
			accessorKey: "jabatan",
			header: "Jabatan",
		},
		{
			accessorKey: "gajiPokok",
			header: "Gaji Pokok",
			cell: ({ row }) => formatRupiah(row.original.gajiPokok),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<span
					className={`px-2 py-1 text-xs font-medium rounded-full ${
						row.original.status === "Active"
							? "bg-green-100 text-green-700"
							: "bg-red-100 text-red-700"
					}`}
				>
					{row.original.status === "Active" ? "Aktif" : "Nonaktif"}
				</span>
			),
		},
	];

	if (isAdmin) {
		columns.push({
			id: "actions",
			header: () => <div className="text-right">Aksi</div>,
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<button
						onClick={() => openEditDialog(row.original)}
						className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
					>
						<Pencil className="h-4 w-4" />
					</button>
					<button
						onClick={() => {
							setSelectedEmployee(row.original);
							setIsDeleteOpen(true);
						}}
						className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				</div>
			),
		});
	}

	const renderFormContent = (form: typeof createForm) => (
		<>
			<div className="grid grid-cols-2 gap-3">
				<Controller
					control={form.control}
					name="nip"
					render={({ field, fieldState }) => (
						<Field data-invalid={!!fieldState.error}>
							<FieldLabel htmlFor="nip">NIP *</FieldLabel>
							<Input
								{...field}
								id="nip"
								aria-invalid={!!fieldState.error}
							/>
							<FieldError errors={fieldState.error ? [fieldState.error] : []} />
						</Field>
					)}
				/>
				<Controller
					control={form.control}
					name="nama"
					render={({ field, fieldState }) => (
						<Field data-invalid={!!fieldState.error}>
							<FieldLabel htmlFor="nama">Nama *</FieldLabel>
							<Input
								{...field}
								id="nama"
								aria-invalid={!!fieldState.error}
							/>
							<FieldError errors={fieldState.error ? [fieldState.error] : []} />
						</Field>
					)}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Controller
					control={form.control}
					name="jabatan"
					render={({ field, fieldState }) => (
						<Field data-invalid={!!fieldState.error}>
							<FieldLabel htmlFor="jabatan">Jabatan *</FieldLabel>
							<select
								{...field}
								id="jabatan"
								className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
								aria-invalid={!!fieldState.error}
							>
								<option value="">Pilih Jabatan</option>
								{JABATAN_OPTIONS.map((j) => (
									<option key={j} value={j}>
										{j}
									</option>
								))}
							</select>
							<FieldError errors={fieldState.error ? [fieldState.error] : []} />
						</Field>
					)}
				/>
				<Controller
					control={form.control}
					name="jenisKelamin"
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="jenisKelamin">Jenis Kelamin</FieldLabel>
							<select
								{...field}
								id="jenisKelamin"
								className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
							>
								{JENIS_KELAMIN_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</Field>
					)}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Controller
					control={form.control}
					name="tanggalMasuk"
					render={({ field, fieldState }) => (
						<Field data-invalid={!!fieldState.error}>
							<FieldLabel htmlFor="tanggalMasuk">Tanggal Masuk *</FieldLabel>
							<Input
								{...field}
								id="tanggalMasuk"
								type="date"
								aria-invalid={!!fieldState.error}
							/>
							<FieldError errors={fieldState.error ? [fieldState.error] : []} />
						</Field>
					)}
				/>
				<Controller
					control={form.control}
					name="gajiPokok"
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="gajiPokok">Gaji Pokok</FieldLabel>
							<Input
								{...field}
								id="gajiPokok"
								type="number"
								placeholder="0"
							/>
						</Field>
					)}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Controller
					control={form.control}
					name="noTelp"
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="noTelp">No. Telp</FieldLabel>
							<Input {...field} id="noTelp" />
						</Field>
					)}
				/>
				<Controller
					control={form.control}
					name="status"
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="status">Status</FieldLabel>
							<select
								{...field}
								id="status"
								className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
							>
								{STATUS_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</Field>
					)}
				/>
			</div>
			<Controller
				control={form.control}
				name="alamat"
				render={({ field }) => (
					<Field>
						<FieldLabel htmlFor="alamat">Alamat</FieldLabel>
						<Input {...field} id="alamat" />
					</Field>
				)}
			/>
		</>
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Data Karyawan</h1>
					<p className="text-sm text-gray-500 mt-1">
						Kelola data karyawan sekolah
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/karyawan/payroll">
						<Button variant="outline" className="gap-2">
							<Briefcase className="h-4 w-4" /> Gaji & Tunjangan
						</Button>
					</Link>
					{isAdmin && (
						<Button
							onClick={() => setIsCreateOpen(true)}
							className="bg-[#059DEA] hover:bg-[#0480c4] text-white gap-2"
						>
							<Plus className="h-4 w-4" /> Tambah
						</Button>
					)}
				</div>
			</div>

			<FormDialog
				title="Tambah Karyawan"
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				form={createForm}
			>
				<form onSubmit={handleCreate} className="space-y-4">
					{renderFormContent(createForm)}
					<div className="flex justify-end gap-2 pt-2">
						<Button
							type="submit"
							className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
							disabled={createMutation.isPending}
						>
							{createMutation.isPending ? "Menyimpan..." : "Simpan"}
						</Button>
					</div>
				</form>
			</FormDialog>

			{/* Summary */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<Card className="border-0 shadow-sm bg-linear-to-br from-blue-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Total Karyawan
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Users className="h-5 w-5 text-blue-500" />
							<span className="text-2xl font-bold text-gray-900">
								{summary.total}
							</span>
						</div>
					</CardContent>
				</Card>
				<Card className="border-0 shadow-sm bg-linear-to-br from-green-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Aktif
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<UserCheck className="h-5 w-5 text-green-500" />
							<span className="text-2xl font-bold text-gray-900">
								{summary.active}
							</span>
						</div>
					</CardContent>
				</Card>
				<Card className="border-0 shadow-sm bg-linear-to-br from-red-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Nonaktif
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<UserX className="h-5 w-5 text-red-500" />
							<span className="text-2xl font-bold text-gray-900">
								{summary.inactive}
							</span>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search & Filters */}
			<div className="flex flex-col sm:flex-row gap-3">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
					<Input
						placeholder="Cari nama, NIP, jabatan..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<div className="flex gap-2">
					<select
						value={statusFilter}
						onChange={(e) => {
							setStatusFilter(e.target.value);
							setCurrentPage(1);
						}}
						className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
					>
						<option value="">Semua Status</option>
						{STATUS_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
					<select
						value={jabatanFilter}
						onChange={(e) => {
							setJabatanFilter(e.target.value);
							setCurrentPage(1);
						}}
						className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
					>
						<option value="">Semua Jabatan</option>
						{JABATAN_OPTIONS.map((j) => (
							<option key={j} value={j}>
								{j}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Table */}
			<Card className="border-0 shadow-sm">
				<CardContent className="p-0">
					<DataTable
						columns={columns}
						data={employees}
						loading={isLoading}
						emptyMessage="Belum ada data karyawan"
						serverPagination={{
							pageIndex: pagination.page - 1,
							pageSize: pagination.limit,
							total: pagination.total,
							onPaginationChange: (newPagination) => {
								setCurrentPage(newPagination.pageIndex + 1);
							},
						}}
					/>
				</CardContent>
			</Card>

			{/* Edit Dialog */}
			<FormDialog
				title="Edit Karyawan"
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
			>
				<form onSubmit={handleEdit} className="space-y-4">
					{renderFormContent(editForm)}
					<div className="flex justify-end gap-2 pt-2">
						<Button
							type="submit"
							className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
							disabled={editMutation.isPending}
						>
							{editMutation.isPending ? "Menyimpan..." : "Perbarui"}
						</Button>
					</div>
				</form>
			</FormDialog>

			{/* Delete Dialog */}
			<Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
					<Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm z-50">
						<Dialog.Title className="text-lg font-semibold mb-2">
							Hapus Karyawan
						</Dialog.Title>
						<p className="text-sm text-gray-600 mb-4">
							Yakin ingin menghapus <strong>{selectedEmployee?.nama}</strong>?
							Data tidak dapat dikembalikan.
						</p>
						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
								Batal
							</Button>
							<Button
								onClick={() => deleteMutation.mutate()}
								className="bg-red-600 hover:bg-red-700 text-white"
								disabled={deleteMutation.isPending}
							>
								{deleteMutation.isPending ? "Menghapus..." : "Hapus"}
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
