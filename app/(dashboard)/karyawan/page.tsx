"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Search,
	ChevronLeft,
	ChevronRight,
	Users,
	Plus,
	Pencil,
	Trash2,
	Briefcase,
	UserCheck,
	UserX,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/utils-core";
import { useDebounce } from "@/hooks/use-debounce";
import * as Dialog from "@radix-ui/react-dialog";

interface Employee {
	id: string;
	nip: string;
	nama: string;
	jabatan: string;
	jenisKelamin: string | null;
	noTelp: string | null;
	alamat: string | null;
	tanggalMasuk: string;
	gajiPokok: number;
	status: string;
	_count: { payrolls: number };
}

interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

const JABATAN_OPTIONS = [
	"Guru",
	"Staff",
	"Kepala Sekolah",
	"Wakil Kepala Sekolah",
	"Admin",
	"Kebersihan",
	"Satpam",
];

const INITIAL_FORM = {
	nip: "",
	nama: "",
	jabatan: "",
	jenisKelamin: "",
	noTelp: "",
	alamat: "",
	tanggalMasuk: new Date().toISOString().split("T")[0],
	gajiPokok: "",
	status: "Active",
};

export default function KaryawanPage() {
	const { isAdmin } = useAuth();
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0 });
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	});
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 400);

	// Dialog states
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
		null,
	);
	const [form, setForm] = useState(INITIAL_FORM);
	const [error, setError] = useState("");

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({
				page: String(pagination.page),
				limit: "10",
				...(debouncedSearch && { search: debouncedSearch }),
			});
			const res = await fetch(`/api/karyawan?${params}`);
			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal memuat data karyawan");
				return;
			}
			setEmployees(result.data);
			setSummary(result.meta.summary);
			setPagination(result.meta.pagination);
		} catch {
			toast.error("Terjadi kesalahan saat memuat data karyawan");
		} finally {
			setLoading(false);
		}
	}, [pagination.page, debouncedSearch]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const promise = fetch("/api/karyawan", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...form,
				gajiPokok: parseFloat(form.gajiPokok) || 0,
			}),
		}).then(async (res) => {
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menyimpan");
			return result;
		});

		toast.promise(promise, {
			loading: "Menambahkan karyawan...",
			success: (result) => {
				setIsCreateOpen(false);
				setForm(INITIAL_FORM);
				fetchData();
				return `Karyawan ${result.data.nama} berhasil ditambahkan`;
			},
			error: (err) => {
				setError(err.message);
				return err.message;
			},
		});
	};

	const handleEdit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedEmployee) return;
		setError("");

		const promise = fetch("/api/karyawan", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: selectedEmployee.id,
				...form,
				gajiPokok: parseFloat(form.gajiPokok) || 0,
			}),
		}).then(async (res) => {
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menyimpan");
			return result;
		});

		toast.promise(promise, {
			loading: "Mengupdate data karyawan...",
			success: (result) => {
				setIsEditOpen(false);
				setSelectedEmployee(null);
				fetchData();
				return `Karyawan ${result.data.nama} berhasil diupdate`;
			},
			error: (err) => {
				setError(err.message);
				return err.message;
			},
		});
	};

	const handleDelete = async () => {
		if (!selectedEmployee) return;

		const promise = fetch(`/api/karyawan?id=${selectedEmployee.id}`, {
			method: "DELETE",
		}).then(async (res) => {
			// Handle 204 No Content for DELETE
			if (res.status === 204) {
				return { success: true, data: selectedEmployee };
			}
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menghapus data");
			return result;
		});

		toast.promise(promise, {
			loading: "Menghapus karyawan...",
			success: (result) => {
				setIsDeleteOpen(false);
				setSelectedEmployee(null);
				fetchData();
				return `Karyawan ${result.data?.nama || selectedEmployee.nama} berhasil dihapus`;
			},
			error: (err) => err.message,
		});
	};

	const openEditDialog = (emp: Employee) => {
		setSelectedEmployee(emp);
		setForm({
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
		setError("");
		setIsEditOpen(true);
	};

	const renderForm = (
		onSubmit: (e: React.FormEvent) => Promise<void>,
		submitLabel: string,
	) => (
		<form onSubmit={onSubmit} className="space-y-4">
			{error && (
				<div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
					{error}
				</div>
			)}
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						NIP *
					</label>
					<Input
						value={form.nip}
						onChange={(e) => setForm({ ...form, nip: e.target.value })}
						required
					/>
				</div>
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Nama *
					</label>
					<Input
						value={form.nama}
						onChange={(e) => setForm({ ...form, nama: e.target.value })}
						required
					/>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Jabatan *
					</label>
					<select
						className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
						value={form.jabatan}
						onChange={(e) => setForm({ ...form, jabatan: e.target.value })}
						required
					>
						<option value="">Pilih Jabatan</option>
						{JABATAN_OPTIONS.map((j) => (
							<option key={j} value={j}>
								{j}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Jenis Kelamin
					</label>
					<select
						className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
						value={form.jenisKelamin}
						onChange={(e) => setForm({ ...form, jenisKelamin: e.target.value })}
					>
						<option value="">-</option>
						<option value="L">Laki-laki</option>
						<option value="P">Perempuan</option>
					</select>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Tanggal Masuk *
					</label>
					<Input
						type="date"
						value={form.tanggalMasuk}
						onChange={(e) => setForm({ ...form, tanggalMasuk: e.target.value })}
						required
					/>
				</div>
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Gaji Pokok
					</label>
					<Input
						type="number"
						value={form.gajiPokok}
						onChange={(e) => setForm({ ...form, gajiPokok: e.target.value })}
						placeholder="0"
					/>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						No. Telp
					</label>
					<Input
						value={form.noTelp}
						onChange={(e) => setForm({ ...form, noTelp: e.target.value })}
					/>
				</div>
				<div>
					<label className="text-sm font-medium text-gray-700 mb-1 block">
						Status
					</label>
					<select
						className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
						value={form.status}
						onChange={(e) => setForm({ ...form, status: e.target.value })}
					>
						<option value="Active">Aktif</option>
						<option value="Inactive">Nonaktif</option>
					</select>
				</div>
			</div>
			<div>
				<label className="text-sm font-medium text-gray-700 mb-1 block">
					Alamat
				</label>
				<Input
					value={form.alamat}
					onChange={(e) => setForm({ ...form, alamat: e.target.value })}
				/>
			</div>
			<div className="flex justify-end gap-2 pt-2">
				<Button
					type="submit"
					className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
				>
					{submitLabel}
				</Button>
			</div>
		</form>
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
						<Dialog.Root
							open={isCreateOpen}
							onOpenChange={(o) => {
								setIsCreateOpen(o);
								if (o) {
									setForm(INITIAL_FORM);
									setError("");
								}
							}}
						>
							<Dialog.Trigger asChild>
								<Button className="bg-[#059DEA] hover:bg-[#0480c4] text-white gap-2">
									<Plus className="h-4 w-4" /> Tambah
								</Button>
							</Dialog.Trigger>
							<Dialog.Portal>
								<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
								<Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg z-50 max-h-[90vh] overflow-y-auto">
									<Dialog.Title className="text-lg font-semibold mb-4">
										Tambah Karyawan
									</Dialog.Title>
									{renderForm(handleCreate, "Simpan")}
								</Dialog.Content>
							</Dialog.Portal>
						</Dialog.Root>
					)}
				</div>
			</div>

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

			{/* Search */}
			<div className="relative max-w-sm">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
				<Input
					placeholder="Cari nama, NIP, jabatan..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			{/* Table */}
			<Card className="border-0 shadow-sm">
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="bg-gray-50">
									<TableHead className="font-semibold">NIP</TableHead>
									<TableHead className="font-semibold">Nama</TableHead>
									<TableHead className="font-semibold">Jabatan</TableHead>
									<TableHead className="font-semibold">Gaji Pokok</TableHead>
									<TableHead className="font-semibold">Status</TableHead>
									{isAdmin && (
										<TableHead className="font-semibold text-right">
											Aksi
										</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center py-8 text-gray-500"
										>
											Memuat...
										</TableCell>
									</TableRow>
								) : employees.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center py-8 text-gray-500"
										>
											Belum ada data karyawan
										</TableCell>
									</TableRow>
								) : (
									employees.map((emp) => (
										<TableRow key={emp.id} className="hover:bg-gray-50">
											<TableCell className="font-mono text-sm">
												{emp.nip}
											</TableCell>
											<TableCell className="font-medium">{emp.nama}</TableCell>
											<TableCell>{emp.jabatan}</TableCell>
											<TableCell>{formatCurrency(emp.gajiPokok)}</TableCell>
											<TableCell>
												<span
													className={`px-2 py-1 text-xs font-medium rounded-full ${emp.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
												>
													{emp.status === "Active" ? "Aktif" : "Nonaktif"}
												</span>
											</TableCell>
											{isAdmin && (
												<TableCell className="text-right">
													<div className="flex justify-end gap-1">
														<button
															onClick={() => openEditDialog(emp)}
															className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
														>
															<Pencil className="h-4 w-4" />
														</button>
														<button
															onClick={() => {
																setSelectedEmployee(emp);
																setIsDeleteOpen(true);
															}}
															className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
												</TableCell>
											)}
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					{pagination.totalPages > 1 && (
						<div className="flex items-center justify-between px-4 py-3 border-t">
							<span className="text-sm text-gray-500">
								Halaman {pagination.page} dari {pagination.totalPages} (
								{pagination.total} data)
							</span>
							<div className="flex gap-1">
								<button
									disabled={pagination.page <= 1}
									onClick={() =>
										setPagination((p) => ({ ...p, page: p.page - 1 }))
									}
									className="h-8 w-8 flex items-center justify-center rounded-lg border disabled:opacity-50"
								>
									<ChevronLeft className="h-4 w-4" />
								</button>
								<button
									disabled={pagination.page >= pagination.totalPages}
									onClick={() =>
										setPagination((p) => ({ ...p, page: p.page + 1 }))
									}
									className="h-8 w-8 flex items-center justify-center rounded-lg border disabled:opacity-50"
								>
									<ChevronRight className="h-4 w-4" />
								</button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Edit Dialog */}
			<Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
					<Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg z-50 max-h-[90vh] overflow-y-auto">
						<Dialog.Title className="text-lg font-semibold mb-4">
							Edit Karyawan
						</Dialog.Title>
						{renderForm(handleEdit, "Perbarui")}
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

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
								onClick={handleDelete}
								className="bg-red-600 hover:bg-red-700 text-white"
							>
								Hapus
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
