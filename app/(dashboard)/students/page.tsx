"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Users, Plus, Pencil, Trash2 } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import * as Dialog from "@radix-ui/react-dialog";
import { FormDialog } from "@/components/reusable/FormDialog";
import { Field, FieldLabel, FieldError } from "@/components/reusable/Field";
import { DataTable } from "@/components/reusable/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { Student } from "@/types/student";
import type { Pagination } from "@/types/pagination";

const KELAS_OPTIONS = ["PLAYGROUP", "KINDERGARTEN"];

const studentFormSchema = z.object({
	nis: z.string().min(1, "NIS wajib diisi").max(20),
	nama: z.string().min(1, "Nama wajib diisi").max(100),
	jenisKelamin: z.string().optional(),
	kelas: z.string().min(1, "Kelas wajib dipilih"),
	tahunMasuk: z.string().min(1, "Tahun masuk wajib diisi"),
	tahunAjaran: z.string().optional(),
	namaOrtu: z.string().optional(),
	noTelp: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

export default function StudentsPage() {
	const { isAdmin } = useAuth();
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [showInactive, setShowInactive] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);

	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

	const form = useForm<StudentFormValues>({
		resolver: zodResolver(studentFormSchema),
		mode: "onChange",
		defaultValues: {
			nis: "",
			nama: "",
			jenisKelamin: "",
			kelas: "",
			tahunMasuk: new Date().getFullYear().toString(),
			tahunAjaran: "",
			namaOrtu: "",
			noTelp: "",
		},
	});

	const { data: studentsResult, isLoading } = useQuery({
		queryKey: ["students", currentPage, statusFilter, showInactive, debouncedSearchTerm],
		queryFn: async () => {
			let url = `/api/students?page=${currentPage}&limit=10`;
			if (statusFilter) url += `&statusBayar=${statusFilter}`;
			if (showInactive) url += `&status=Inactive`;
			if (debouncedSearchTerm)
				url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

			const res = await fetch(url);
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data siswa");
			return result;
		},
	});

	const students: Student[] = useMemo(() => studentsResult?.data ?? [], [studentsResult?.data]);
	const pagination: Pagination = studentsResult?.meta?.pagination ?? {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	};

	const createMutation = useMutation({
		mutationFn: async (submitData: StudentFormValues) => {
			const res = await fetch("/api/students", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(submitData),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menambah siswa");
			return result;
		},
		onSuccess: () => {
			setIsCreateOpen(false);
			form.reset();
			queryClient.invalidateQueries({ queryKey: ["students"] });
		},
	});

	const editMutation = useMutation({
		mutationFn: async (submitData: StudentFormValues) => {
			if (!selectedStudent) throw new Error("No student selected");
			const res = await fetch(`/api/students/${selectedStudent.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(submitData),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal mengupdate siswa");
			return result;
		},
		onSuccess: () => {
			setIsEditOpen(false);
			setSelectedStudent(null);
			form.reset();
			queryClient.invalidateQueries({ queryKey: ["students"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			if (!selectedStudent) throw new Error("No student selected");
			const res = await fetch(`/api/students/${selectedStudent.id}`, {
				method: "DELETE",
			});
			if (res.status === 204) {
				return { success: true, data: selectedStudent };
			}
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menghapus siswa");
			return result;
		},
		onSuccess: (result) => {
			setIsDeleteOpen(false);
			setSelectedStudent(null);
			queryClient.invalidateQueries({ queryKey: ["students"] });
			toast.success(`Siswa ${result.data?.nama || selectedStudent?.nama} berhasil dihapus`);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const onCreateSubmit = (data: StudentFormValues) => {
		toast.promise(createMutation.mutateAsync(data), {
			loading: "Menyimpan...",
			success: "Siswa berhasil ditambahkan",
			error: (err) => err.message || "Gagal menyimpan",
		});
	};

	const onEditSubmit = (data: StudentFormValues) => {
		toast.promise(editMutation.mutateAsync(data), {
			loading: "Menyimpan...",
			success: "Siswa berhasil diupdate",
			error: (err) => err.message || "Gagal menyimpan",
		});
	};

	const handleDelete = () => {
		if (!selectedStudent) return;
		deleteMutation.mutate();
	};

	const openEditDialog = useCallback((student: Student) => {
		setSelectedStudent(student);
		form.reset({
			nis: student.nis,
			nama: student.nama,
			jenisKelamin: student.jenisKelamin || "",
			kelas: student.kelas,
			tahunMasuk: student.tahunMasuk.toString(),
			tahunAjaran: student.tahunAjaran || "",
			namaOrtu: student.namaOrtu || "",
			noTelp: student.noTelp || "",
		});
		setIsEditOpen(true);
	}, [form]);

	const filteredStudents = useMemo(
		() =>
			students.filter(
				(s) =>
					s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
					s.nis.toLowerCase().includes(searchTerm.toLowerCase()) ||
					s.kelas.toLowerCase().includes(searchTerm.toLowerCase()),
			),
		[students, searchTerm],
	);

	const { lunasCount, belumLunasCount } = useMemo(() => {
		const lunas = students.filter((s) => s.statusBayar === "Lunas").length;
		return { lunasCount: lunas, belumLunasCount: students.length - lunas };
	}, [students]);

	const columns = useMemo<ColumnDef<Student>[]>(
		() => [
			{
				accessorKey: "nis",
				header: "NIS",
				cell: ({ row }) => (
					<span className="font-mono font-medium">{row.original.nis}</span>
				),
			},
			{
				accessorKey: "nama",
				header: "Nama",
				cell: ({ row }) => (
					<span className="font-medium">
						{row.original.nama}
						{row.original.status === "Inactive" && (
							<Badge variant="secondary" className="ml-2 text-xs">
								Tidak Aktif
							</Badge>
						)}
					</span>
				),
			},
			{
				accessorKey: "kelas",
				header: "Kelas",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.kelas}</Badge>
				),
			},
			{ accessorKey: "tahunMasuk", header: "Tahun Masuk" },
			{
				accessorKey: "totalTagihan",
				header: "Tagihan",
				cell: ({ row }) => (
					<span className="text-right block">
						{formatRupiah(row.original.totalTagihan)}
					</span>
				),
			},
			{
				accessorKey: "totalBayar",
				header: "Dibayar",
				cell: ({ row }) => (
					<span className="text-right font-semibold text-emerald-600">
						{formatRupiah(row.original.totalBayar)}
					</span>
				),
			},
			{
				accessorKey: "statusBayar",
				header: "Status",
				cell: ({ row }) => (
					<Badge
						variant={
							row.original.statusBayar === "Lunas" ? "success" : "warning"
						}
					>
						{row.original.statusBayar}
					</Badge>
				),
			},
			...(isAdmin
				? [
						{
							id: "aksi",
							header: "Aksi",
							cell: ({ row }: { row: { original: Student } }) => (
								<div className="flex gap-1">
									<Button
										size="sm"
										variant="ghost"
										onClick={() => openEditDialog(row.original)}
									>
										<Pencil className="h-4 w-4" />
									</Button>
									{row.original.status === "Active" && (
										<Button
											size="sm"
											variant="ghost"
											className="text-red-600 hover:text-red-700"
											onClick={() => {
												setSelectedStudent(row.original);
												setIsDeleteOpen(true);
											}}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							),
						},
					]
				: []),
		],
		[isAdmin, openEditDialog],
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Data Siswa
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Kelola data siswa dan status pembayaran
					</p>
				</div>

				{isAdmin && (
					<Button
						onClick={() => setIsCreateOpen(true)}
						size="sm"
						className="text-xs md:text-sm"
					>
						<Plus className="h-4 w-4 md:mr-2" />
						<span className="hidden md:inline">Tambah Siswa</span>
						<span className="md:hidden">Tambah</span>
					</Button>
				)}
			</div>

			{/* Stats */}
			<div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
				<Card className="bg-[#059DEA] shadow-sm col-span-2 md:col-span-1">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
							<Users className="h-5 w-5 md:h-6 md:w-6 text-white" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-white/80 truncate">
								Total Siswa
							</p>
							<p className="text-sm md:text-xl font-bold text-white truncate">
								{pagination.total}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-[#059DEA]/20 shrink-0">
							<span className="text-sm md:text-lg font-bold text-gray-700">
								✓
							</span>
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Lunas
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{lunasCount}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-amber-50 shrink-0">
							<span className="text-sm md:text-lg font-bold text-amber-600">
								!
							</span>
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
								Belum Lunas
							</p>
							<p className="text-sm md:text-xl font-bold text-slate-900 font-mono truncate">
								{belumLunasCount}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search & Filters */}
			<Card>
				<CardContent className="p-4">
					<div className="flex flex-col gap-3">
						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<Input
								type="text"
								placeholder="Cari nama, NIS, atau kelas..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-10 w-full"
							/>
						</div>
						<div className="flex items-center justify-between gap-4">
							<div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 hide-scrollbar flex-1">
								<Button
									variant={statusFilter === "" ? "default" : "outline"}
									size="sm"
									onClick={() => setStatusFilter("")}
									className="whitespace-nowrap"
								>
									Semua
								</Button>
								<Button
									variant={statusFilter === "Lunas" ? "default" : "outline"}
									size="sm"
									onClick={() => setStatusFilter("Lunas")}
									className="whitespace-nowrap"
								>
									Lunas
								</Button>
								<Button
									variant={
										statusFilter === "Belum Lunas" ? "default" : "outline"
									}
									size="sm"
									onClick={() => setStatusFilter("Belum Lunas")}
									className="whitespace-nowrap"
								>
									Belum Lunas
								</Button>
							</div>
							<label className="flex items-center gap-2 text-xs md:text-sm text-gray-600 whitespace-nowrap">
								<input
									type="checkbox"
									checked={showInactive}
									onChange={(e) => setShowInactive(e.target.checked)}
									className="rounded border-gray-300"
								/>
								Tampilkan non-aktif
							</label>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Daftar Siswa
						{statusFilter && (
							<Badge variant="secondary" className="ml-2">
								{statusFilter}
							</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<DataTable
						columns={columns}
						data={filteredStudents}
						loading={isLoading}
						emptyMessage="Tidak ada data siswa"
						className="min-w-225"
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

			{/* Create Dialog */}
			<FormDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				title="Tambah Siswa Baru"
				form={form}
			>
				<form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<Controller
							control={form.control}
							name="nis"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="nis">NIS *</FieldLabel>
									<Input id="nis" {...field} placeholder="12345" />
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
						<Controller
							control={form.control}
							name="jenisKelamin"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="jenisKelamin">
										Jenis Kelamin
									</FieldLabel>
									<select
										id="jenisKelamin"
										{...field}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
									>
										<option value="">Pilih</option>
										<option value="L">Laki-laki</option>
										<option value="P">Perempuan</option>
									</select>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
					</div>

					<Controller
						control={form.control}
						name="nama"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="nama">Nama Lengkap *</FieldLabel>
								<Input
									id="nama"
									{...field}
									placeholder="Nama lengkap siswa"
								/>
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<div className="grid grid-cols-2 gap-4">
						<Controller
							control={form.control}
							name="kelas"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="kelas">Kelas *</FieldLabel>
									<select
										id="kelas"
										{...field}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
									>
										<option value="">Pilih Kelas</option>
										{KELAS_OPTIONS.map((kelas) => (
											<option key={kelas} value={kelas}>
												{kelas}
											</option>
										))}
									</select>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
						<Controller
							control={form.control}
							name="tahunMasuk"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="tahunMasuk">
										Tahun Masuk *
									</FieldLabel>
									<Input id="tahunMasuk" type="number" {...field} />
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
					</div>

					<Controller
						control={form.control}
						name="tahunAjaran"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="tahunAjaran">
									Tahun Ajaran
								</FieldLabel>
								<Input
									id="tahunAjaran"
									{...field}
									placeholder="2025/2026"
								/>
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<Controller
						control={form.control}
						name="namaOrtu"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="namaOrtu">
									Nama Orang Tua
								</FieldLabel>
								<Input
									id="namaOrtu"
									{...field}
									placeholder="Nama orang tua/wali"
								/>
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<Controller
						control={form.control}
						name="noTelp"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="noTelp">No. Telepon</FieldLabel>
								<Input
									id="noTelp"
									{...field}
									placeholder="08xxxxxxxxxx"
								/>
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsCreateOpen(false)}
						>
							Batal
						</Button>
						<Button type="submit">Simpan</Button>
					</div>
				</form>
			</FormDialog>

			{/* Edit Dialog */}
			<FormDialog
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				title="Edit Data Siswa"
				form={form}
			>
				<form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<Controller
							control={form.control}
							name="nis"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="edit-nis">NIS</FieldLabel>
									<Input
										id="edit-nis"
										{...field}
										disabled
										className="bg-slate-100"
									/>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
						<Controller
							control={form.control}
							name="jenisKelamin"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="edit-jenisKelamin">
										Jenis Kelamin
									</FieldLabel>
									<select
										id="edit-jenisKelamin"
										{...field}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
									>
										<option value="">Pilih</option>
										<option value="L">Laki-laki</option>
										<option value="P">Perempuan</option>
									</select>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
					</div>

					<Controller
						control={form.control}
						name="nama"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="edit-nama">
									Nama Lengkap *
								</FieldLabel>
								<Input id="edit-nama" {...field} />
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<div className="grid grid-cols-2 gap-4">
						<Controller
							control={form.control}
							name="kelas"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="edit-kelas">
										Kelas *
									</FieldLabel>
									<select
										id="edit-kelas"
										{...field}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
									>
										<option value="">Pilih Kelas</option>
										{KELAS_OPTIONS.map((kelas) => (
											<option key={kelas} value={kelas}>
												{kelas}
											</option>
										))}
									</select>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
						<Controller
							control={form.control}
							name="tahunMasuk"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="edit-tahunMasuk">
										Tahun Masuk
									</FieldLabel>
									<Input
										id="edit-tahunMasuk"
										type="number"
										{...field}
									/>
									<FieldError
										errors={
											fieldState.error ? [fieldState.error] : []
										}
									/>
								</Field>
							)}
						/>
					</div>

					<Controller
						control={form.control}
						name="tahunAjaran"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="edit-tahunAjaran">
									Tahun Ajaran
								</FieldLabel>
								<Input id="edit-tahunAjaran" {...field} />
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<Controller
						control={form.control}
						name="namaOrtu"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="edit-namaOrtu">
									Nama Orang Tua
								</FieldLabel>
								<Input id="edit-namaOrtu" {...field} />
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<Controller
						control={form.control}
						name="noTelp"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="edit-noTelp">
									No. Telepon
								</FieldLabel>
								<Input id="edit-noTelp" {...field} />
								<FieldError
									errors={fieldState.error ? [fieldState.error] : []}
								/>
							</Field>
						)}
					/>

					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsEditOpen(false)}
						>
							Batal
						</Button>
						<Button type="submit">Update</Button>
					</div>
				</form>
			</FormDialog>

			{/* Delete Confirmation Dialog */}
			<Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
						<Dialog.Title className="text-lg font-semibold text-slate-900">
							Hapus Siswa Permanen
						</Dialog.Title>
						<p className="mt-2 text-sm text-slate-600">
							Apakah Anda yakin ingin menghapus data siswa{" "}
							<strong>{selectedStudent?.nama}</strong>? Data tagihan dan history
							pembayaran juga akan dihapus secara permanen.
						</p>
						<div className="mt-6 flex justify-end gap-3">
							<Dialog.Close asChild>
								<Button variant="outline">Batal</Button>
							</Dialog.Close>
							<Button variant="destructive" onClick={handleDelete}>
								Nonaktifkan
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
