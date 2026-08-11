"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/reusable/DataTable";
import {
	Plus,
	Search,
	Landmark,
	AlertCircle,
	CheckCircle,
	CreditCard,
	ChevronRight,
} from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import * as Dialog from "@radix-ui/react-dialog";
import type { ColumnDef } from "@tanstack/react-table";

interface Debt {
	id: string;
	kodeAkun: string;
	nama: string;
	kreditur: string;
	jumlahAwal: number;
	jumlahSisa: number;
	jumlahSisaDisplay?: number;
	tenor: number;
	tanggalMulai: string;
	tanggalJatuhTempo: string;
	cicilanPerBulan: number;
	status: string;
	computedPaid?: number;
	computedSisaTenor?: number;
	nextDueDate?: string;
	isOverdue?: boolean;
}

interface DebtSummary {
	totalHutangAwal: number;
	totalHutangSisa: number;
}

interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export default function DebtPage() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
	const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
	const [paymentAmount, setPaymentAmount] = useState("");
	const [paymentKodeAkun, setPaymentKodeAkun] = useState("");
	const [error, setError] = useState("");
	const [formData, setFormData] = useState({
		nama: "",
		kreditur: "",
		kodeAkun: "",
		kodeAkunPembayaran: "",
		jumlahAwal: "",
		tenor: "",
		tanggalMulai: new Date().toISOString().slice(0, 10),
	});

	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

	const { data: debtResult, isLoading } = useQuery({
		queryKey: ["debts", statusFilter, debouncedSearchTerm, selectedYear?.id],
		queryFn: async () => {
			let url = `/api/debt?page=1&limit=1000`;
			if (selectedYear?.id) url += `&academicYearId=${selectedYear.id}`;
			if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
			if (debouncedSearchTerm)
				url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

			const res = await fetch(url);
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data hutang");
			return result;
		},
		placeholderData: (prev) => prev,
	});

	const debts: Debt[] = debtResult?.data ?? [];
	const summary: DebtSummary = debtResult?.meta?.summary ?? { totalHutangAwal: 0, totalHutangSisa: 0 };

	const { data: accountsData } = useQuery({
		queryKey: ["accounts", "Asset,Liability"],
		queryFn: async () => {
			const res = await fetch("/api/accounts?tipeAkun=Asset,Liability");
			const result = await res.json();
			if (!result.success) throw new Error("Gagal memuat data akun");
			return result.data;
		},
	});

	const liabilityAccounts: { kodeAkun: string; namaAkun: string }[] =
		(accountsData ?? []).filter(
			(a: { tipeAkun: string }) => a.tipeAkun === "Liability",
		);

	const assetAccounts: { kodeAkun: string; namaAkun: string }[] =
		(accountsData ?? []).filter(
			(a: { tipeAkun: string }) => a.tipeAkun === "Asset",
		);

	const createMutation = useMutation({
		mutationFn: async (submitData: Record<string, unknown>) => {
			const res = await fetch("/api/debt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(submitData),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal membuat hutang");
			return result;
		},
		onSuccess: (result) => {
			setIsDialogOpen(false);
			setFormData({
				nama: "",
				kreditur: "",
				kodeAkun: "",
				kodeAkunPembayaran: "",
				jumlahAwal: "",
				tenor: "",
				tanggalMulai: new Date().toISOString().slice(0, 10),
			});
			queryClient.invalidateQueries({ queryKey: ["debts"] });
			toast.success(`Hutang ${result.data.nama} berhasil dibuat`);
		},
		onError: (err: Error) => {
			setError(err.message);
			toast.error(err.message);
		},
	});

	const paymentMutation = useMutation({
		mutationFn: async ({ debtId, jumlahBayar, kodeAkun }: { debtId: string; jumlahBayar: number; kodeAkun: string }) => {
			const res = await fetch("/api/debt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "payment", debtId, jumlahPembayaran: jumlahBayar, kodeAkun }),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memproses pembayaran");
			return result;
		},
		onSuccess: () => {
			setIsPayDialogOpen(false);
			setSelectedDebt(null);
			setPaymentAmount("");
			setPaymentKodeAkun("");
			queryClient.invalidateQueries({ queryKey: ["debts"] });
			toast.success("Pembayaran berhasil diproses");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		const jumlahAwal = parseFormattedNumber(formData.jumlahAwal);
		const tenor = parseInt(formData.tenor) || 0;
		createMutation.mutate({
			...formData,
			jumlahAwal,
			tenor,
			cicilanPerBulan: tenor > 0 ? Math.ceil(jumlahAwal / tenor) : 0,
		});
	};

	const handlePayment = () => {
		if (!selectedDebt || !paymentAmount || !paymentKodeAkun) return;
		const jumlahBayar = parseFormattedNumber(paymentAmount);
		if (jumlahBayar <= 0) {
			toast.error("Jumlah bayar harus lebih dari 0");
			return;
		}
		paymentMutation.mutate({ debtId: selectedDebt.id, jumlahBayar, kodeAkun: paymentKodeAkun });
	};

	const columns: ColumnDef<Debt>[] = [
		{
			id: "expand",
			size: 40,
			header: "",
			cell: ({ row }) => {
				const d = row.original;
				if (!d.tenor || d.tenor <= 0) return null;
				return (
					<button
						onClick={() => row.toggleExpanded()}
						className="p-1 hover:bg-gray-100 rounded"
					>
						<ChevronRight
							className={`h-4 w-4 transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`}
						/>
					</button>
				);
			},
		},
		{
			accessorKey: "kodeAkun",
			header: "Kode Akun",
			cell: ({ row }) => (
				<span className="font-mono text-sm">{row.original.kodeAkun}</span>
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
			accessorKey: "kreditur",
			header: "Kreditur",
		},
		{
			accessorKey: "jumlahAwal",
			header: "Jumlah Awal",
			cell: ({ row }) => (
				<span className="text-right font-semibold block">
					{formatRupiah(row.original.jumlahAwal)}
				</span>
			),
		},
		{
			accessorKey: "jumlahSisa",
			header: "Sisa",
			cell: ({ row }) => (
				<span className="text-right font-semibold block">
					{formatRupiah(row.original.jumlahSisaDisplay ?? row.original.jumlahSisa)}
				</span>
			),
		},
		{
			accessorKey: "cicilanPerBulan",
			header: "Cicilan/Bulan",
			cell: ({ row }) => (
				<span className="text-right block">
					{formatRupiah(row.original.cicilanPerBulan)}
				</span>
			),
		},
		{
			accessorKey: "tenor",
			header: "Tenor",
			cell: ({ row }) => (
				<span className="text-center block">{row.original.tenor} bln</span>
			),
		},
		{
			accessorKey: "tanggalJatuhTempo",
			header: "Jatuh Tempo",
			cell: ({ row }) => formatShortDate(row.original.nextDueDate ?? row.original.tanggalJatuhTempo),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => {
				const d = row.original;
				const effectiveStatus = d.isOverdue ? "Jatuh Tempo" : d.status;
				return (
					<Badge
						variant={
							effectiveStatus === "Lunas"
								? "success"
								: effectiveStatus === "Jatuh Tempo"
									? "destructive"
									: "warning"
						}
					>
						{effectiveStatus}
					</Badge>
				);
			},
		},
		{
			id: "actions",
			header: "Aksi",
			cell: ({ row }) => {
				const d = row.original;
				if (d.status === "Lunas" || !isAdmin) return null;
				const effectiveOverdue = d.isOverdue || d.status === "Jatuh Tempo";
				return (
					<Button
						size="sm"
						variant="outline"
									onClick={() => {
										setSelectedDebt(d);
										setPaymentAmount("");
										setPaymentKodeAkun("");
										setIsPayDialogOpen(true);
									}}
						className={
							effectiveOverdue
								? "text-red-600 border-red-200 hover:bg-red-50"
								: ""
						}
					>
						Bayar
					</Button>
				);
			},
		},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Manajemen Hutang
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Kelola data hutang dan pembayaran cicilan
					</p>
				</div>

				{isAdmin && (
					<Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
						<Dialog.Trigger asChild>
							<Button size="sm" className="text-xs md:text-sm">
								<Plus className="h-4 w-4 md:mr-2" />
								<span className="hidden md:inline">Tambah Hutang</span>
								<span className="md:hidden">Tambah</span>
							</Button>
						</Dialog.Trigger>
						<Dialog.Portal>
							<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
							<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
								<Dialog.Title className="text-lg font-semibold text-slate-900">
									Tambah Hutang Baru
								</Dialog.Title>
								<Dialog.Description className="mt-1 text-sm text-slate-500">
									Buat catatan hutang baru
								</Dialog.Description>

								<form onSubmit={handleSubmit} className="mt-6 space-y-4">
									{error && (
										<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
											{error}
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="nama">Nama Hutang</Label>
										<Input
											id="nama"
											value={formData.nama}
											onChange={(e) =>
												setFormData({ ...formData, nama: e.target.value })
											}
											placeholder="Contoh: Pinjaman Modal Usaha"
											required
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kreditur">Kreditur</Label>
										<Input
											id="kreditur"
											value={formData.kreditur}
											onChange={(e) =>
												setFormData({ ...formData, kreditur: e.target.value })
											}
											placeholder="Contoh: Bank ABC"
											required
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kodeAkun">Kode Akun (Hutang)</Label>
										<select
											id="kodeAkun"
											value={formData.kodeAkun}
											onChange={(e) =>
												setFormData({ ...formData, kodeAkun: e.target.value })
											}
											className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
											required
										>
											<option value="">Pilih akun hutang...</option>
											{liabilityAccounts.map((a) => (
												<option key={a.kodeAkun} value={a.kodeAkun}>
													{a.kodeAkun} - {a.namaAkun}
												</option>
											))}
										</select>
										<p className="text-xs text-slate-400">
											Akun liability dari daftar akun
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kodeAkunPembayaran">Sumber Dana</Label>
										<select
											id="kodeAkunPembayaran"
											value={formData.kodeAkunPembayaran}
											onChange={(e) =>
												setFormData({
													...formData,
													kodeAkunPembayaran: e.target.value,
												})
											}
											className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
											required
										>
											<option value="">Pilih akun kas/bank...</option>
											{assetAccounts.map((a) => (
												<option key={a.kodeAkun} value={a.kodeAkun}>
													{a.kodeAkun} - {a.namaAkun}
												</option>
											))}
										</select>
										<p className="text-xs text-slate-400">
											Akun kas/bank dari daftar akun
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="jumlahAwal">Jumlah Awal (Rp)</Label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
												Rp
											</span>
											<Input
												id="jumlahAwal"
												type="text"
												inputMode="numeric"
												value={formData.jumlahAwal}
												onChange={(e) => {
													const formatted = formatNumberInput(e.target.value);
													setFormData({ ...formData, jumlahAwal: formatted });
												}}
												placeholder="10.000.000"
												className="pl-10"
												required
											/>
										</div>
										<p className="text-xs text-slate-400">
											Total pinjaman awal
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="tenor">Tenor (Bulan)</Label>
										<Input
											id="tenor"
											type="number"
											min={1}
											max={360}
											value={formData.tenor}
											onChange={(e) =>
												setFormData({ ...formData, tenor: e.target.value })
											}
											placeholder="Contoh: 10"
											required
										/>
										<p className="text-xs text-slate-400">
											Lama pinjaman dalam bulan
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="tanggalMulai">Tanggal Mulai</Label>
										<Input
											id="tanggalMulai"
											type="date"
											value={formData.tanggalMulai}
											onChange={(e) =>
												setFormData({
													...formData,
													tanggalMulai: e.target.value,
												})
											}
											required
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

			{/* Summary Cards */}
			<div className="grid gap-3 grid-cols-2">
				<Card className="bg-[#059DEA] shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
							<Landmark className="h-5 w-5 md:h-6 md:w-6 text-white" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-white/80 truncate">
								Total Hutang Awal
							</p>
							<p className="text-sm md:text-xl font-bold text-white truncate">
								{formatRupiah(summary.totalHutangAwal)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-amber-50 shrink-0">
							<CreditCard className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Sisa Hutang
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatRupiah(summary.totalHutangSisa)}
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
								placeholder="Cari nama hutang atau kreditur..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-10 w-full"
							/>
						</div>
						<div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0">
							<Button
								variant={statusFilter === "" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("")}
								className="whitespace-nowrap"
							>
								Semua
							</Button>
							<Button
								variant={statusFilter === "Aktif" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("Aktif")}
								className="whitespace-nowrap"
							>
								Aktif
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
								variant={statusFilter === "Jatuh Tempo" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("Jatuh Tempo")}
								className="whitespace-nowrap text-red-600 border-red-200 hover:bg-red-50"
							>
								<AlertCircle className="w-3 h-3 mr-1" />
								Jatuh Tempo
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Daftar Hutang
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
						data={debts}
						loading={isLoading}
						emptyMessage="Tidak ada data hutang"
						pageSize={50}
						renderSubComponent={({ row }) => {
							const d = row.original;
							if (!d.tenor || d.tenor <= 0 || !d.tanggalMulai) return null;

							// Build cicilan schedule
							const startDate = new Date(d.tanggalMulai);
							const cicilan = d.cicilanPerBulan;
							const totalMonths = d.tenor;
							let remaining = d.jumlahAwal;

							const schedule: {
								month: number;
								date: string;
								cicilan: number;
								remaining: number;
							}[] = [];

							for (let m = 0; m < totalMonths; m++) {
								const payDate = new Date(startDate);
								payDate.setMonth(payDate.getMonth() + m);
								const monthCicilan = m === totalMonths - 1 ? remaining : cicilan;
								remaining = Math.max(0, remaining - monthCicilan);
								schedule.push({
									month: m + 1,
									date: payDate.toISOString().slice(0, 10),
									cicilan: monthCicilan,
									remaining,
								});
							}

							return (
								<div className="p-4 bg-gray-50">
									<div className="mb-3">
										<h4 className="text-sm font-semibold text-gray-700 mb-1">
											Jadwal Cicilan
										</h4>
										<div className="flex flex-wrap gap-4 text-xs text-gray-500">
											<span>
												Cicilan/bulan:{" "}
												<strong className="text-gray-700">
													{formatRupiah(d.cicilanPerBulan)}
												</strong>
											</span>
											<span>
												Total:{" "}
												<strong className="text-gray-700">
													{formatRupiah(d.jumlahAwal)}
												</strong>
											</span>
										<span>
											Sisa:{" "}
											<strong className="text-gray-700">
												{formatRupiah(d.jumlahSisaDisplay ?? d.jumlahSisa)}
											</strong>
										</span>
										</div>
									</div>
									<div className="overflow-x-auto">
										<table className="w-full text-xs border-collapse">
											<thead>
												<tr className="bg-gray-100">
													<th className="text-left py-1.5 px-2 font-medium text-gray-600">
														Bulan ke
													</th>
													<th className="text-left py-1.5 px-2 font-medium text-gray-600">
														Tanggal
													</th>
													<th className="text-right py-1.5 px-2 font-medium text-gray-600">
														Cicilan
													</th>
													<th className="text-right py-1.5 px-2 font-medium text-gray-600">
														Sisa
													</th>
												</tr>
											</thead>
											<tbody>
												{schedule.map((row) => (
													<tr
														key={row.month}
														className="border-t border-gray-200 hover:bg-gray-100/50"
													>
														<td className="py-1.5 px-2 text-gray-700">
															{row.month}
														</td>
														<td className="py-1.5 px-2 text-gray-700">
															{formatShortDate(row.date)}
														</td>
														<td className="py-1.5 px-2 text-right text-gray-700">
															{formatRupiah(row.cicilan)}
														</td>
														<td className="py-1.5 px-2 text-right font-medium text-gray-900">
															{formatRupiah(row.remaining)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							);
						}}
					/>
				</CardContent>
			</Card>

			{/* Payment Dialog */}
			<Dialog.Root open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
						<Dialog.Title className="text-lg font-semibold text-slate-900">
							Pembayaran Hutang
						</Dialog.Title>
						<Dialog.Description className="mt-1 text-sm text-slate-500">
							Masukkan jumlah pembayaran cicilan
						</Dialog.Description>

						{selectedDebt && (
							<div className="mt-4 space-y-3">
								<div className="rounded-lg bg-slate-50 p-4">
									<p className="text-sm text-slate-600">
										<span className="font-medium">Nama:</span>{" "}
										{selectedDebt.nama}
									</p>
									<p className="text-sm text-slate-600">
										<span className="font-medium">Kreditur:</span>{" "}
										{selectedDebt.kreditur}
									</p>
								<p className="text-sm text-slate-600">
									<span className="font-medium">Sisa Hutang:</span>{" "}
									{formatRupiah(selectedDebt.jumlahSisaDisplay ?? selectedDebt.jumlahSisa)}
								</p>
									<p className="text-sm text-slate-600">
										<span className="font-medium">Cicilan/Bulan:</span>{" "}
										{formatRupiah(selectedDebt.cicilanPerBulan)}
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="paymentKodeAkun">Sumber Pembayaran</Label>
									<select
										id="paymentKodeAkun"
										value={paymentKodeAkun}
										onChange={(e) => setPaymentKodeAkun(e.target.value)}
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
										required
									>
										<option value="">Pilih akun kas/bank...</option>
										{assetAccounts.map((a) => (
											<option key={a.kodeAkun} value={a.kodeAkun}>
												{a.kodeAkun} - {a.namaAkun}
											</option>
										))}
									</select>
									<p className="text-xs text-slate-400">
										Akun kas/bank dari daftar akun
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="jumlahBayar">Jumlah Bayar (Rp)</Label>
									<div className="relative">
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
											Rp
										</span>
										<Input
											id="jumlahBayar"
											type="text"
											inputMode="numeric"
											value={paymentAmount}
											onChange={(e) => {
												const formatted = formatNumberInput(e.target.value);
												setPaymentAmount(formatted);
											}}
											placeholder={formatRupiah(selectedDebt.cicilanPerBulan, {
												symbol: false,
											})}
											className="pl-10"
										/>
									</div>
									<p className="text-xs text-slate-400">
										Cicilan per bulan: {formatRupiah(selectedDebt.cicilanPerBulan)}
									</p>
								</div>
							</div>
						)}

						<div className="mt-6 flex justify-end gap-3">
							<Dialog.Close asChild>
							<Button
								variant="outline"
								onClick={() => {
									setSelectedDebt(null);
									setPaymentAmount("");
									setPaymentKodeAkun("");
								}}
							>
								Batal
							</Button>
							</Dialog.Close>
							<Button onClick={handlePayment} disabled={!paymentAmount}>
								Konfirmasi Bayar
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
