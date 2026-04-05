"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Plus,
	Search,
	ChevronLeft,
	ChevronRight,
	Receipt,
	CheckCircle,
	Clock,
	CreditCard,
} from "lucide-react";
import {
	formatCurrency,
	formatShortDate,
	formatNumberInput,
	parseFormattedNumber,
} from "@/lib/utils/utils-core";
import { useDebounce } from "@/hooks/use-debounce";
import * as Dialog from "@radix-ui/react-dialog";

interface Student {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
}

interface Billing {
	id: string;
	studentId: string;
	student: Student;
	jenisBiaya: string;
	periodeBulan: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
	catatan: string | null;
}

interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

interface Summary {
	totalTagihan: number;
	totalBelumLunas: number;
	totalLunas: number;
	countBelumLunas: number;
	countLunas: number;
}

const JENIS_BIAYA = [
	"Pendaftaran",
	"Gedung",
	"Kegiatan",
	"Seragam",
	"ATK",
	"SPP",
];

export default function BillingPage() {
	const { isAdmin } = useAuth();
	const [billings, setBillings] = useState<Billing[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	});
	const [summary, setSummary] = useState<Summary>({
		totalTagihan: 0,
		totalBelumLunas: 0,
		totalLunas: 0,
		countBelumLunas: 0,
		countLunas: 0,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [studentSearch, setStudentSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	// Debounce search term to avoid excessive API calls
	const debouncedSearchTerm = useDebounce(searchTerm, 300);
	const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
	const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
	const [error, setError] = useState("");
	const [formData, setFormData] = useState({
		studentId: "",
		jenisBiaya: "",
		periodeBulan: new Date().toISOString().slice(0, 7),
		jumlah: "",
		catatan: "",
	});

	const fetchData = useCallback(
		async (page = 1) => {
			setIsLoading(true);
			try {
				// Fetch students and billings in parallel
				const studentsRes = fetch("/api/students?limit=1000&status=Active");

				let billingsUrl = `/api/billing?page=${page}&limit=10`;
				if (statusFilter) billingsUrl += `&statusBayar=${statusFilter}`;
				if (debouncedSearchTerm)
					billingsUrl += `&search=${encodeURIComponent(debouncedSearchTerm)}`;
				const billingsRes = fetch(billingsUrl);

				const [studentsResponse, billingsResponse] = await Promise.all([
					studentsRes,
					billingsRes,
				]);

				const studentsResult = await studentsResponse.json();
				if (!studentsResult.success) {
					toast.error(
						studentsResult.error?.message || "Gagal memuat data siswa",
					);
				} else {
					setStudents(studentsResult.data);
				}

				const billingsResult = await billingsResponse.json();
				if (!billingsResult.success) {
					toast.error(
						billingsResult.error?.message || "Gagal memuat data tagihan",
					);
					setIsLoading(false);
					return;
				}
				setBillings(billingsResult.data);
				setPagination(billingsResult.meta.pagination);
				setSummary(billingsResult.meta.summary);
			} catch (error) {
				console.error("Failed to fetch data:", error);
				toast.error("Terjadi kesalahan saat memuat data");
			} finally {
				setIsLoading(false);
			}
		},
		[statusFilter, debouncedSearchTerm],
	);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		// Parse formatted number before sending
		const submitData = {
			...formData,
			jumlah: parseFormattedNumber(formData.jumlah),
		};

		const promise = fetch("/api/billing", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(submitData),
		}).then(async (res) => {
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal membuat tagihan");
			return result;
		});

		toast.promise(promise, {
			loading: "Membuat tagihan...",
			success: (result) => {
				setIsDialogOpen(false);
				setFormData({
					studentId: "",
					jenisBiaya: "",
					periodeBulan: new Date().toISOString().slice(0, 7),
					jumlah: "",
					catatan: "",
				});
				fetchData(pagination.page);
				return `Tagihan ${result.data.jenisBiaya} berhasil dibuat`;
			},
			error: (err) => {
				setError(err.message);
				return err.message;
			},
		});
	};

	const handlePayment = async () => {
		if (!selectedBilling) return;

		const promise = fetch(`/api/billing/${selectedBilling.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ statusBayar: "Lunas" }),
		}).then(async (res) => {
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memproses pembayaran");
			return result;
		});

		toast.promise(promise, {
			loading: "Memproses pembayaran...",
			success: (result) => {
				setIsPayDialogOpen(false);
				setSelectedBilling(null);
				fetchData(pagination.page);
				return `Pembayaran ${result.data.jenisBiaya} berhasil diproses`;
			},
			error: (err) => err.message,
		});
	};

	const selectedStudent = students.find((s) => s.id === formData.studentId);

	const filteredBillings = useMemo(
		() =>
			billings.filter(
				(b) =>
					b.student.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
					b.student.nis.toLowerCase().includes(searchTerm.toLowerCase()) ||
					b.jenisBiaya.toLowerCase().includes(searchTerm.toLowerCase()),
			),
		[billings, searchTerm],
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Biaya Siswa
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Kelola tagihan dan pembayaran siswa
					</p>
				</div>

				{isAdmin && (
					<Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
						<Dialog.Trigger asChild>
							<Button size="sm" className="text-xs md:text-sm">
								<Plus className="h-4 w-4 md:mr-2" />
								<span className="hidden md:inline">Tambah Tagihan</span>
								<span className="md:hidden">Tambah</span>
							</Button>
						</Dialog.Trigger>
						<Dialog.Portal>
							<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
							<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
								<Dialog.Title className="text-lg font-semibold text-slate-900">
									Tambah Tagihan Baru
								</Dialog.Title>
								<Dialog.Description className="mt-1 text-sm text-slate-500">
									Buat tagihan baru untuk siswa
								</Dialog.Description>

								<form onSubmit={handleSubmit} className="mt-6 space-y-4">
									{error && (
										<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
											{error}
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="studentId">Pilih Siswa</Label>
										<div className="relative">
											<Input
												type="text"
												placeholder="Cari nama atau NIS siswa..."
												value={studentSearch}
												onChange={(e) => setStudentSearch(e.target.value)}
											/>
											{studentSearch && (
												<div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
													{students
														.filter(
															(s) =>
																s.nama
																	.toLowerCase()
																	.includes(studentSearch.toLowerCase()) ||
																s.nis
																	.toLowerCase()
																	.includes(studentSearch.toLowerCase()) ||
																s.kelas
																	.toLowerCase()
																	.includes(studentSearch.toLowerCase()),
														)
														.slice(0, 20)
														.map((s) => (
															<button
																key={s.id}
																type="button"
																onClick={() => {
																	setFormData({ ...formData, studentId: s.id });
																	setStudentSearch("");
																}}
																className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
																	formData.studentId === s.id
																		? "bg-[#059DEA]/30 font-medium"
																		: ""
																}`}
															>
																<span className="font-medium">{s.nis}</span> -{" "}
																{s.nama}{" "}
																<span className="text-gray-500">
																	({s.kelas})
																</span>
															</button>
														))}
													{students.filter(
														(s) =>
															s.nama
																.toLowerCase()
																.includes(studentSearch.toLowerCase()) ||
															s.nis
																.toLowerCase()
																.includes(studentSearch.toLowerCase()),
													).length === 0 && (
														<p className="px-3 py-2 text-sm text-gray-500">
															Tidak ada siswa ditemukan
														</p>
													)}
												</div>
											)}
										</div>
									</div>

									{selectedStudent && (
										<div className="rounded-lg bg-slate-50 p-3">
											<p className="text-sm text-slate-600">
												<span className="font-medium">Nama:</span>{" "}
												{selectedStudent.nama}
											</p>
											<p className="text-sm text-slate-600">
												<span className="font-medium">Kelas:</span>{" "}
												{selectedStudent.kelas}
											</p>
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="jenisBiaya">Jenis Biaya</Label>
										<select
											id="jenisBiaya"
											value={formData.jenisBiaya}
											onChange={(e) =>
												setFormData({ ...formData, jenisBiaya: e.target.value })
											}
											className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
											required
										>
											<option value="">-- Pilih Jenis Biaya --</option>
											{JENIS_BIAYA.map((jenis) => (
												<option key={jenis} value={jenis}>
													{jenis}
												</option>
											))}
										</select>
									</div>

									<div className="space-y-2">
										<Label htmlFor="periodeBulan">Periode (Bulan)</Label>
										<Input
											id="periodeBulan"
											type="month"
											value={formData.periodeBulan}
											onChange={(e) =>
												setFormData({
													...formData,
													periodeBulan: e.target.value,
												})
											}
											required
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="jumlah">Jumlah (Rp)</Label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
												Rp
											</span>
											<Input
												id="jumlah"
												type="text"
												inputMode="numeric"
												value={formData.jumlah}
												onChange={(e) => {
													const formatted = formatNumberInput(e.target.value);
													setFormData({ ...formData, jumlah: formatted });
												}}
												placeholder="500.000"
												className="pl-10"
												required
											/>
										</div>
										<p className="text-xs text-slate-400">
											Contoh: 500.000 = lima ratus ribu rupiah
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="catatan">Catatan (Opsional)</Label>
										<Input
											id="catatan"
											value={formData.catatan}
											onChange={(e) =>
												setFormData({ ...formData, catatan: e.target.value })
											}
											placeholder="Catatan tambahan..."
										/>
									</div>

									<div className="flex justify-end gap-3 pt-4">
										<Dialog.Close asChild>
											<Button type="button" variant="outline">
												Batal
											</Button>
										</Dialog.Close>
										<Button type="submit">Simpan</Button>
									</div>
								</form>
							</Dialog.Content>
						</Dialog.Portal>
					</Dialog.Root>
				)}
			</div>

			<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
				<Card className="bg-[#059DEA] shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
							<Receipt className="h-5 w-5 md:h-6 md:w-6 text-white" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-white/80 truncate">
								Total Tagihan
							</p>
							<p className="text-sm md:text-xl font-bold text-white truncate">
								{formatCurrency(summary.totalTagihan)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-amber-50 shrink-0">
							<Clock className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Belum Lunas
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatCurrency(summary.totalBelumLunas)}
							</p>
							<p className="text-[10px] text-gray-400 mt-0.5 md:mt-1 truncate">
								{summary.countBelumLunas} tagihan
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-[#059DEA]/20 shrink-0">
							<CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Lunas
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatCurrency(summary.totalLunas)}
							</p>
							<p className="text-[10px] text-gray-400 mt-0.5 md:mt-1 truncate">
								{summary.countLunas} tagihan
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-gray-100 shrink-0">
							<CreditCard className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Total Transaksi
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{pagination.total}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search */}
			<Card>
				<CardContent className="p-4">
					<div className="flex flex-col gap-3">
						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<Input
								type="text"
								placeholder="Cari nama siswa, NIS, atau jenis biaya..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-10 w-full"
							/>
						</div>
						<div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 hide-scrollbar">
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
								variant={statusFilter === "Belum Lunas" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("Belum Lunas")}
								className="whitespace-nowrap"
							>
								Belum Lunas
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Daftar Tagihan
						{statusFilter && (
							<Badge variant="secondary" className="ml-2">
								{statusFilter}
							</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="flex h-48 items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
						</div>
					) : filteredBillings.length > 0 ? (
						<div className="overflow-x-auto -mx-4 px-4">
							<Table className="min-w-[800px]">
								<TableHeader>
									<TableRow>
										<TableHead>NIS</TableHead>
										<TableHead>Nama Siswa</TableHead>
										<TableHead>Kelas</TableHead>
										<TableHead>Jenis Biaya</TableHead>
										<TableHead>Periode</TableHead>
										<TableHead className="text-right">Jumlah</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Aksi</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredBillings.map((b) => (
										<TableRow key={b.id}>
											<TableCell className="font-mono">
												{b.student.nis}
											</TableCell>
											<TableCell className="font-medium">
												{b.student.nama}
											</TableCell>
											<TableCell>
												<Badge variant="secondary">{b.student.kelas}</Badge>
											</TableCell>
											<TableCell>{b.jenisBiaya}</TableCell>
											<TableCell>{b.periodeBulan}</TableCell>
											<TableCell className="text-right font-semibold">
												{formatCurrency(b.jumlah)}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														b.statusBayar === "Lunas" ? "success" : "warning"
													}
												>
													{b.statusBayar}
												</Badge>
											</TableCell>
											<TableCell>
												{b.statusBayar === "Belum Lunas" && isAdmin && (
													<Button
														size="sm"
														variant="outline"
														onClick={() => {
															setSelectedBilling(b);
															setIsPayDialogOpen(true);
														}}
													>
														Bayar
													</Button>
												)}
												{b.statusBayar === "Lunas" && b.tanggalBayar && (
													<span className="text-xs text-slate-500">
														{formatShortDate(b.tanggalBayar)}
													</span>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className="flex h-48 items-center justify-center text-slate-400">
							Tidak ada data tagihan
						</div>
					)}

					{/* Pagination */}
					{pagination.totalPages > 1 && (
						<div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
							<p className="text-xs md:text-sm text-slate-500 text-center sm:text-left">
								Menampilkan {(pagination.page - 1) * pagination.limit + 1} -{" "}
								{Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
								dari {pagination.total} tagihan
							</p>
							<div className="flex justify-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={pagination.page === 1}
									onClick={() => fetchData(pagination.page - 1)}
									className="w-10 p-0"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span className="flex items-center px-4 text-sm font-medium border border-gray-200 rounded-md">
									{pagination.page} / {pagination.totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={pagination.page === pagination.totalPages}
									onClick={() => fetchData(pagination.page + 1)}
									className="w-10 p-0"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Payment Confirmation Dialog */}
			<Dialog.Root open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
						<Dialog.Title className="text-lg font-semibold text-slate-900">
							Konfirmasi Pembayaran
						</Dialog.Title>
						{selectedBilling && (
							<div className="mt-4 space-y-3">
								<div className="rounded-lg bg-slate-50 p-4">
									<p className="text-sm text-slate-600">
										<span className="font-medium">Siswa:</span>{" "}
										{selectedBilling.student.nama}
									</p>
									<p className="text-sm text-slate-600">
										<span className="font-medium">Jenis:</span>{" "}
										{selectedBilling.jenisBiaya}
									</p>
									<p className="text-sm text-slate-600">
										<span className="font-medium">Periode:</span>{" "}
										{selectedBilling.periodeBulan}
									</p>
									<p className="mt-2 text-lg font-bold text-slate-900">
										{formatCurrency(selectedBilling.jumlah)}
									</p>
								</div>
								<p className="text-sm text-slate-500">
									Pembayaran akan otomatis tercatat di Cashflow sebagai
									pemasukan.
								</p>
							</div>
						)}
						<div className="mt-6 flex justify-end gap-3">
							<Dialog.Close asChild>
								<Button variant="outline">Batal</Button>
							</Dialog.Close>
							<Button onClick={handlePayment}>Konfirmasi Bayar</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
