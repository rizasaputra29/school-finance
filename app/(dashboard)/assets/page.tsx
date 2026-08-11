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
	Package,
	TrendingDown,
	DollarSign,
	MapPin,
	ChevronRight,
} from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import * as Dialog from "@radix-ui/react-dialog";
import type { ColumnDef } from "@tanstack/react-table";

type AssetStatus = "Active" | "Inactive";

interface Asset {
	id: string;
	kodeAkun: string;
	nama: string;
	kategori: string;
	lokasi: string | null;
	tanggalPerolehan: string;
	hargaPerolehan: number;
	umurTeknis: number;
	nilaiResidu: number;
	isTanah: boolean;
	status: AssetStatus;
	bookValue: number;
	sisaUmurTeknis: number | null;
	accumulatedDepreciation: number;
	depreciatedYears: number;
}

interface AssetSummary {
	totalAset: number;
	totalPenyusutan: number;
	nilaiBuku: number;
}

const ASSET_CATEGORIES = ["Peralatan", "Kendaraan", "Bangunan", "Tanah"];

export default function AssetsPage() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();

	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<"" | AssetStatus>("");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDepreciating, setIsDepreciating] = useState(false);
	const [error, setError] = useState("");

	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

	const [formData, setFormData] = useState({
		nama: "",
		kategori: "",
		lokasi: "",
		tanggalPerolehan: new Date().toISOString().slice(0, 10),
		hargaPerolehan: "",
		umurTeknis: "",
		nilaiResidu: "",
		isTanah: false,
		kodeAkun: "",
		kodeAkunPembayaran: "",
	});

	const { data: assetResult, isLoading } = useQuery({
		queryKey: ["assets", statusFilter, debouncedSearchTerm, selectedYear?.id],
		queryFn: async () => {
			const params = new URLSearchParams({
				page: "1",
				limit: "1000",
				isAsset: "true",
			});
			if (selectedYear?.id) params.set("academicYearId", selectedYear.id);
			if (statusFilter) params.set("status", statusFilter);
			if (debouncedSearchTerm)
				params.set("search", encodeURIComponent(debouncedSearchTerm));

			const response = await fetch(`/api/assets/purchase?${params}`);
			const result = await response.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data aset");

			const assetData: Asset[] = (result.data?.assets || []).map(
				(a: Record<string, unknown>) => ({
					id: a.id as string,
					kodeAkun: (a.kodeAkun as string) || "",
					nama: a.nama as string,
					kategori: a.kategori as string,
					lokasi: (a.lokasi as string) || null,
					tanggalPerolehan: (a.tanggal as string) || "",
					hargaPerolehan: (a.jumlah as number) || 0,
					umurTeknis: (a.umurTeknis as number) || 0,
					nilaiResidu: (a.nilaiResidu as number) || 0,
					isTanah: (a.isTanah as boolean) || false,
					status: (a.status as AssetStatus) || "Active",
					bookValue: (a.bookValue as number) ?? ((a.jumlah as number) || 0),
					sisaUmurTeknis: (a.sisaUmurTeknis as number) ?? null,
					accumulatedDepreciation: (a.accumulatedDepreciation as number) || 0,
					depreciatedYears: (a.depreciatedYears as number) || 0,
				}),
			);

			return {
				assets: assetData,
				summary: {
					totalAset:
						result.meta?.summary?.totalAset ??
						assetData.reduce((s, a) => s + a.hargaPerolehan, 0),
					totalPenyusutan:
						result.meta?.summary?.totalPenyusutan ??
						assetData.reduce((s, a) => s + a.accumulatedDepreciation, 0),
					nilaiBuku:
						result.meta?.summary?.nilaiBuku ??
						assetData.reduce((s, a) => s + a.bookValue, 0),
				} as AssetSummary,
			};
		},
		placeholderData: (prev) => prev,
	});

	const assets = assetResult?.assets ?? [];
	const summary = assetResult?.summary ?? { totalAset: 0, totalPenyusutan: 0, nilaiBuku: 0 };

	const { data: accountsData } = useQuery({
		queryKey: ["accounts", "Asset"],
		queryFn: async () => {
			const res = await fetch("/api/accounts?tipeAkun=Asset");
			const result = await res.json();
			if (!result.success) throw new Error("Gagal memuat data akun");
			return result.data;
		},
	});

	const assetAccounts: { kodeAkun: string; namaAkun: string }[] =
		(accountsData ?? []).filter(
			(a: { tipeAkun: string }) => a.tipeAkun === "Asset",
		);

	const createMutation = useMutation({
		mutationFn: async (submitData: Record<string, unknown>) => {
			const res = await fetch("/api/assets/purchase", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(submitData),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menambah aset");
			return result;
		},
		onSuccess: (result, submitData) => {
			setIsDialogOpen(false);
			setFormData({
				nama: "",
				kategori: "",
				lokasi: "",
				tanggalPerolehan: new Date().toISOString().slice(0, 10),
				hargaPerolehan: "",
				umurTeknis: "",
				nilaiResidu: "",
				isTanah: false,
				kodeAkun: "",
				kodeAkunPembayaran: "",
			});
			queryClient.invalidateQueries({ queryKey: ["assets"] });
			toast.success(`Aset "${submitData.nama}" berhasil ditambahkan`);
		},
		onError: (err: Error) => {
			setError(err.message);
			toast.error(err.message);
		},
	});

	const depreciationMutation = useMutation({
		mutationFn: async () => {
			const depYear = selectedYear
				? new Date(selectedYear.tanggalSelesai).getFullYear()
				: new Date().getFullYear();
			const res = await fetch("/api/assets/depreciation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ year: depYear }),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memproses penyusutan");
			return result;
		},
		onSuccess: (result) => {
			setIsDepreciating(false);
			queryClient.invalidateQueries({ queryKey: ["assets"] });
			toast.success(result.message || "Penyusutan berhasil diproses");
		},
		onError: (err: Error) => {
			setIsDepreciating(false);
			toast.error(err.message);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		createMutation.mutate({
			tanggal: formData.tanggalPerolehan,
			nama: formData.nama,
			kategori: formData.kategori,
			jumlah: parseFormattedNumber(formData.hargaPerolehan),
			lokasi: formData.lokasi || undefined,
			umurTeknis: formData.isTanah ? 0 : parseFormattedNumber(formData.umurTeknis),
			nilaiResidu: parseFormattedNumber(formData.nilaiResidu) || 0,
			kodeAkun: formData.kodeAkun,
			kodeAkunPembayaran: formData.kodeAkunPembayaran,
		});
	};

	const handleProsesPenyusutan = () => {
		setIsDepreciating(true);
		depreciationMutation.mutate();
	};

	const depYear = selectedYear
		? new Date(selectedYear.tanggalSelesai).getFullYear()
		: new Date().getFullYear();

	const columns: ColumnDef<Asset>[] = [
		{
			id: "expand",
			size: 40,
			header: "",
			cell: ({ row }) => {
				const a = row.original;
				if (a.isTanah || a.depreciatedYears === 0) return null;
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
			accessorKey: "kategori",
			header: "Kategori",
			cell: ({ row }) => (
				<Badge variant="secondary">{row.original.kategori}</Badge>
			),
		},
		{
			accessorKey: "lokasi",
			header: "Lokasi",
			cell: ({ row }) =>
				row.original.lokasi ? (
					<span className="inline-flex items-center gap-1 text-sm text-gray-600">
						<MapPin className="h-3 w-3" />
						{row.original.lokasi}
					</span>
				) : (
					<span className="text-gray-400">-</span>
				),
		},
		{
			accessorKey: "hargaPerolehan",
			header: "Harga Perolehan",
			cell: ({ row }) => (
				<span className="text-right font-semibold block">
					{formatRupiah(row.original.hargaPerolehan)}
				</span>
			),
		},
		{
			id: "nilaiBuku",
			header: "Nilai Buku",
			cell: ({ row }) => (
				<span className="text-right font-semibold block">
					{formatRupiah(row.original.bookValue)}
				</span>
			),
		},
		{
			accessorKey: "umurTeknis",
			header: "Umur Teknis",
			cell: ({ row }) =>
				row.original.isTanah ? (
					<span className="text-gray-400">-</span>
				) : (
					`${row.original.umurTeknis} tahun`
				),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={row.original.status === "Active" ? "success" : "outline"}
				>
					{row.original.status}
				</Badge>
			),
		},
		{
			id: "tanggalPerolehan",
			header: "Tgl Perolehan",
			cell: ({ row }) => (
				<span className="text-xs text-slate-500">
					{row.original.tanggalPerolehan
						? formatShortDate(row.original.tanggalPerolehan)
						: "-"}
				</span>
			),
		},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Pengelolaan Aset
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Kelola aset tetap dan penyusutan
					</p>
				</div>

				{isAdmin && (
					<Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
						<Dialog.Trigger asChild>
							<Button size="sm" className="text-xs md:text-sm">
								<Plus className="h-4 w-4 md:mr-2" />
								<span className="hidden md:inline">Tambah Aset</span>
								<span className="md:hidden">Tambah</span>
							</Button>
						</Dialog.Trigger>
						<Dialog.Portal>
							<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
							<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
								<Dialog.Title className="text-lg font-semibold text-slate-900">
									Tambah Aset Baru
								</Dialog.Title>
								<Dialog.Description className="mt-1 text-sm text-slate-500">
									Catat pembelian aset tetap baru
								</Dialog.Description>

								<form onSubmit={handleSubmit} className="mt-6 space-y-4">
									{error && (
										<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
											{error}
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="nama">Nama Aset</Label>
										<Input
											id="nama"
											value={formData.nama}
											onChange={(e) =>
												setFormData({ ...formData, nama: e.target.value })
											}
											placeholder="Contoh: Laptop Dell Latitude"
											required
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kategori">Kategori</Label>
										<select
											id="kategori"
											value={formData.kategori}
											onChange={(e) => {
												const val = e.target.value;
												setFormData({
													...formData,
													kategori: val,
													isTanah: val === "Tanah",
													umurTeknis: val === "Tanah" ? "" : formData.umurTeknis,
												});
											}}
											className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#059DEA] focus:outline-none focus:ring-2 focus:ring-[#059DEA]/20"
											required
										>
											<option value="">-- Pilih Kategori --</option>
											{ASSET_CATEGORIES.map((kat) => (
												<option key={kat} value={kat}>
													{kat}
												</option>
											))}
										</select>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kodeAkun">Akun Aset</Label>
										<select
											id="kodeAkun"
											value={formData.kodeAkun}
											onChange={(e) =>
												setFormData({ ...formData, kodeAkun: e.target.value })
											}
											className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#059DEA] focus:outline-none focus:ring-2 focus:ring-[#059DEA]/20"
											required
										>
											<option value="">Pilih akun aset...</option>
											{assetAccounts.map((a) => (
												<option key={a.kodeAkun} value={a.kodeAkun}>
													{a.kodeAkun} - {a.namaAkun}
												</option>
											))}
										</select>
										<p className="text-xs text-slate-400">
											Akun aset dari daftar akun
										</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="kodeAkunPembayaran">Sumber Pembayaran</Label>
										<select
											id="kodeAkunPembayaran"
											value={formData.kodeAkunPembayaran}
											onChange={(e) =>
												setFormData({
													...formData,
													kodeAkunPembayaran: e.target.value,
												})
											}
											className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#059DEA] focus:outline-none focus:ring-2 focus:ring-[#059DEA]/20"
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
										<Label htmlFor="lokasi">Lokasi (Opsional)</Label>
										<Input
											id="lokasi"
											value={formData.lokasi}
											onChange={(e) =>
												setFormData({ ...formData, lokasi: e.target.value })
											}
											placeholder="Contoh: Ruang Guru"
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="tanggalPerolehan">Tanggal Perolehan</Label>
										<Input
											id="tanggalPerolehan"
											type="date"
											value={formData.tanggalPerolehan}
											onChange={(e) =>
												setFormData({
													...formData,
													tanggalPerolehan: e.target.value,
												})
											}
											required
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="hargaPerolehan">Harga Perolehan (Rp)</Label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
												Rp
											</span>
											<Input
												id="hargaPerolehan"
												type="text"
												inputMode="numeric"
												value={formData.hargaPerolehan}
												onChange={(e) => {
													const formatted = formatNumberInput(e.target.value);
													setFormData({ ...formData, hargaPerolehan: formatted });
												}}
												placeholder="5.000.000"
												className="pl-10"
												required
											/>
										</div>
									</div>

									{!formData.isTanah && (
										<div className="space-y-2">
											<Label htmlFor="umurTeknis">Umur Teknis (Tahun)</Label>
											<Input
												id="umurTeknis"
												type="text"
												inputMode="numeric"
												value={formData.umurTeknis}
												onChange={(e) => {
													const formatted = formatNumberInput(e.target.value);
													setFormData({ ...formData, umurTeknis: formatted });
												}}
												placeholder="5"
												required
											/>
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="nilaiResidu">Nilai Residu (Rp)</Label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
												Rp
											</span>
											<Input
												id="nilaiResidu"
												type="text"
												inputMode="numeric"
												value={formData.nilaiResidu}
												onChange={(e) => {
													const formatted = formatNumberInput(e.target.value);
													setFormData({ ...formData, nilaiResidu: formatted });
												}}
												placeholder="0"
												className="pl-10"
											/>
										</div>
									</div>

									<div className="flex items-center gap-2 pt-1">
										<input
											type="checkbox"
											id="isTanah"
											checked={formData.isTanah}
											onChange={(e) =>
												setFormData({
													...formData,
													isTanah: e.target.checked,
													umurTeknis: e.target.checked ? "" : formData.umurTeknis,
												})
											}
											className="h-4 w-4 rounded border-slate-300 text-[#059DEA] focus:ring-[#059DEA]"
										/>
										<Label htmlFor="isTanah" className="cursor-pointer">
											Tanah (tidak disusutkan)
										</Label>
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
			<div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
				<Card className="bg-[#059DEA] shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
							<Package className="h-5 w-5 md:h-6 md:w-6 text-white" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-white/80 truncate">
								Total Aset
							</p>
							<p className="text-sm md:text-xl font-bold text-white truncate">
								{formatRupiah(summary.totalAset)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-amber-50 shrink-0">
							<TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Total Penyusutan
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatRupiah(summary.totalPenyusutan)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-emerald-50 shrink-0">
							<DollarSign className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Nilai Buku
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatRupiah(summary.nilaiBuku)}
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
								placeholder="Cari nama aset atau kategori..."
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
								variant={statusFilter === "Active" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("Active")}
								className="whitespace-nowrap"
							>
								Active
							</Button>
							<Button
								variant={statusFilter === "Inactive" ? "default" : "outline"}
								size="sm"
								onClick={() => setStatusFilter("Inactive")}
								className="whitespace-nowrap"
							>
								Inactive
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Action Row: Proses Penyusutan */}
			{isAdmin && (
				<div className="flex flex-col sm:flex-row gap-3">
					<Button
						size="sm"
						onClick={handleProsesPenyusutan}
						disabled={isDepreciating}
						className="text-xs md:text-sm"
					>
						<TrendingDown className="h-4 w-4 md:mr-2" />
						<span className="hidden md:inline">Proses Penyusutan</span>
						<span className="md:hidden">Penyusutan</span>
						<span className="ml-1 text-xs opacity-80">{depYear}</span>
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							window.open(`/api/assets/depreciation?year=${depYear}`, "_blank")
						}
						className="text-xs md:text-sm"
					>
						Lihat Detail Penyusutan {depYear}
					</Button>
				</div>
			)}

			{/* Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Daftar Aset
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
						data={assets}
						loading={isLoading}
						emptyMessage="Tidak ada data aset"
						pageSize={50}
						renderSubComponent={({ row }) => {
							const a = row.original;
							if (a.isTanah || a.umurTeknis === 0) return null;

							const annualDepreciation =
								(a.hargaPerolehan - a.nilaiResidu) / a.umurTeknis;
							const startYear = a.tanggalPerolehan
								? new Date(a.tanggalPerolehan).getFullYear()
								: new Date().getFullYear();

							const schedule: {
								year: number;
								depreciation: number;
								accumulated: number;
								bookValue: number;
							}[] = [];

							let accum = 0;
							for (let y = 0; y < a.umurTeknis; y++) {
								const yearNum = startYear + y;
								const depAmount =
									y === 0
										? annualDepreciation *
											(1 - new Date(a.tanggalPerolehan).getMonth() / 12)
										: annualDepreciation;
								accum += depAmount;
								schedule.push({
									year: yearNum,
									depreciation: Math.round(depAmount),
									accumulated: Math.round(accum),
									bookValue: Math.round(a.hargaPerolehan - accum),
								});
							}

							return (
								<div className="p-4 bg-gray-50">
									<div className="mb-3">
										<h4 className="text-sm font-semibold text-gray-700 mb-1">
											Jadwal Penyusutan
										</h4>
										<div className="flex flex-wrap gap-4 text-xs text-gray-500">
											<span>
												Depresiasi/tahun:{" "}
												<strong className="text-gray-700">
													{formatRupiah(annualDepreciation)}
												</strong>
											</span>
											<span>
												Akumulasi:{" "}
												<strong className="text-gray-700">
													{formatRupiah(a.accumulatedDepreciation)}
												</strong>
											</span>
											<span>
												Nilai Buku:{" "}
												<strong className="text-gray-700">
													{formatRupiah(a.bookValue)}
												</strong>
											</span>
										</div>
									</div>
									{schedule.length > 0 && (
										<div className="overflow-x-auto">
											<table className="w-full text-xs border-collapse">
												<thead>
													<tr className="bg-gray-100">
														<th className="text-left py-1.5 px-2 font-medium text-gray-600">
															Tahun
														</th>
														<th className="text-right py-1.5 px-2 font-medium text-gray-600">
															Depresiasi
														</th>
														<th className="text-right py-1.5 px-2 font-medium text-gray-600">
															Akumulasi
														</th>
														<th className="text-right py-1.5 px-2 font-medium text-gray-600">
															Nilai Buku
														</th>
													</tr>
												</thead>
												<tbody>
													{schedule.map((row) => (
														<tr
															key={row.year}
															className="border-t border-gray-200 hover:bg-gray-100/50"
														>
															<td className="py-1.5 px-2 text-gray-700">
																{row.year}
															</td>
															<td className="py-1.5 px-2 text-right text-gray-700">
																{formatRupiah(row.depreciation)}
															</td>
															<td className="py-1.5 px-2 text-right text-gray-700">
																{formatRupiah(row.accumulated)}
															</td>
															<td className="py-1.5 px-2 text-right font-medium text-gray-900">
																{formatRupiah(row.bookValue)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>
							);
						}}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
