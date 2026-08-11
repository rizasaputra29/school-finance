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
import { TransactionButtons } from "@/components/Transaction/TransactionButtons";
import {
	Search,
	TrendingUp,
	TrendingDown,
	Wallet,
	Filter,
	Pencil,
	Trash2,
} from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import { useForm, Controller, useWatch } from "react-hook-form";
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
import type { CashflowCard } from "@/types/cashflow";
import type { Account } from "@/types/account";
import type { Pagination } from "@/types/pagination";
import type { CashflowSummary as Summary } from "@/types/summary";
import * as Dialog from "@radix-ui/react-dialog";

const cashflowFormSchema = z.object({
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	keterangan: z.string().min(1, "Keterangan wajib diisi"),
	kategori: z.string().optional(),
	entries: z
		.array(
			z.object({
				kodeAkun: z.string().min(1, "Akun wajib dipilih"),
				debit: z.string(),
				kredit: z.string(),
			}),
		)
		.min(2, "Minimal 2 entri diperlukan"),
});

type CashflowFormValues = z.infer<typeof cashflowFormSchema>;

function CashflowInner() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();

	const initialStart = selectedYear?.tanggalMulai?.split("T")[0] ?? "";
	const initialEnd = selectedYear?.tanggalSelesai?.split("T")[0] ?? "";

	const [searchTerm, setSearchTerm] = useState("");
	const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
	const [startDate, setStartDate] = useState(initialStart);
	const [endDate, setEndDate] = useState(initialEnd);
	const [currentPage, setCurrentPage] = useState(1);

	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [selectedCard, setSelectedCard] = useState<CashflowCard | null>(null);

	const [accountSearch, setAccountSearch] = useState("");
	const [debouncedAccountSearch] = useDebounce(accountSearch, 200);
	const [showAccountDropdown, setShowAccountDropdown] = useState(false);
	const [editingEntryIndex, setEditingEntryIndex] = useState<number | null>(null);

	const cashflowForm = useForm<CashflowFormValues>({
		resolver: zodResolver(cashflowFormSchema),
		defaultValues: {
			tanggal: new Date().toISOString().split("T")[0],
			keterangan: "",
			kategori: "",
			entries: [
				{ kodeAkun: "", debit: "", kredit: "" },
				{ kodeAkun: "", debit: "", kredit: "" },
			],
		},
		mode: "onChange",
	});

	const watchedEntries = useWatch({ control: cashflowForm.control, name: "entries" });

	const { data: accountsData } = useQuery({
		queryKey: ["accounts"],
		queryFn: async () => {
			const res = await fetch("/api/accounts");
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data akun");
			return result.data as Account[];
		},
	});

	const accounts = accountsData ?? [];

	const { data: cashflowData, isLoading } = useQuery({
		queryKey: [
			"cashflows",
			currentPage,
			typeFilter,
			startDate,
			endDate,
			debouncedSearchTerm,
			selectedYear?.id,
		],
		queryFn: async () => {
			let url = `/api/cashflow?page=${currentPage}&limit=10`;
			if (selectedYear?.id) url += `&academicYearId=${selectedYear.id}`;
			if (startDate) url += `&startDate=${startDate}`;
			if (endDate) url += `&endDate=${endDate}`;
			if (typeFilter !== "all") url += `&type=${typeFilter}`;
			if (debouncedSearchTerm)
				url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

			const res = await fetch(url);
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data cashflow");
			return result;
		},
	});

	const cashflows: CashflowCard[] = cashflowData?.data ?? [];
	const pagination: Pagination = cashflowData?.meta?.pagination ?? {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	};
	const summary: Summary = cashflowData?.meta?.summary ?? {
		totalDebit: 0,
		totalKredit: 0,
		saldo: 0,
	};

	const editMutation = useMutation({
		mutationFn: async (data: CashflowFormValues) => {
			const res = await fetch(`/api/cashflow/${selectedCard!.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tanggal: data.tanggal,
					keterangan: data.keterangan,
					kategori: data.kategori,
					entries: data.entries
						.filter((e) => e.kodeAkun)
						.map((e) => ({
							kodeAkun: e.kodeAkun,
							debit: parseFormattedNumber(String(e.debit)) || 0,
							kredit: parseFormattedNumber(String(e.kredit)) || 0,
						})),
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal mengupdate transaksi");
			return result;
		},
		onSuccess: () => {
			setIsEditOpen(false);
			setSelectedCard(null);
			cashflowForm.reset();
			queryClient.invalidateQueries({ queryKey: ["cashflows"] });
			toast.success("Transaksi berhasil diupdate");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await fetch(`/api/cashflow/${selectedCard!.id}`, {
				method: "DELETE",
			});
			if (res.status === 204) return { success: true, data: selectedCard };
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menghapus transaksi");
			return result;
		},
		onSuccess: (result) => {
			setIsDeleteOpen(false);
			setSelectedCard(null);
			queryClient.invalidateQueries({ queryKey: ["cashflows"] });
			toast.success(
				`Transaksi ${result.data?.keterangan || selectedCard?.keterangan} berhasil dihapus`,
			);
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const handleEdit = cashflowForm.handleSubmit((data) => {
		editMutation.mutate(data);
	});

	const handleDelete = () => {
		if (!selectedCard) return;
		deleteMutation.mutate();
	};

	const openEditDialog = (card: CashflowCard) => {
		setSelectedCard(card);
		const entry1 = card.entries[0] || { kodeAkun: "", debit: 0, kredit: 0 };
		const entry2 = card.entries[1] || { kodeAkun: "", debit: 0, kredit: 0 };
		cashflowForm.reset({
			tanggal: new Date(card.tanggal).toISOString().split("T")[0],
			keterangan: card.keterangan,
			kategori: card.kategori || "",
			entries: [
				{
					kodeAkun: entry1.kodeAkun,
					debit: entry1.debit > 0 ? formatNumberInput(entry1.debit) : "",
					kredit: entry1.kredit > 0 ? formatNumberInput(entry1.kredit) : "",
				},
				{
					kodeAkun: entry2.kodeAkun,
					debit: entry2.debit > 0 ? formatNumberInput(entry2.debit) : "",
					kredit: entry2.kredit > 0 ? formatNumberInput(entry2.kredit) : "",
				},
			],
		});
		setIsEditOpen(true);
	};

	const clearFilters = () => {
		setTypeFilter("all");
		setStartDate(initialStart);
		setEndDate(initialEnd);
		setSearchTerm("");
	};

	const selectAccount = (index: number, kodeAkun: string) => {
		cashflowForm.setValue(`entries.${index}.kodeAkun`, kodeAkun, {
			shouldValidate: true,
		});
		setAccountSearch("");
		setShowAccountDropdown(false);
		setEditingEntryIndex(null);
	};

	const columns: ColumnDef<CashflowCard>[] = [
		{
			accessorKey: "tanggal",
			header: "Tanggal",
			cell: ({ row }) => (
				<span className="whitespace-nowrap">{formatShortDate(row.original.tanggal)}</span>
			),
		},
		{
			accessorKey: "keterangan",
			header: "Keterangan",
			cell: ({ row }) => (
				<div>
					{row.original.keterangan}
					{row.original.kategori && (
						<Badge variant="secondary" className="ml-2 text-xs">
							{row.original.kategori}
						</Badge>
					)}
				</div>
			),
		},
		{
			id: "debitAccount",
			header: "Debit (Akun)",
			cell: ({ row }) => {
				const debitEntry = row.original.entries.find((e) => e.debit > 0);
				return debitEntry ? (
					<div className="flex items-center gap-1">
						<Badge variant="secondary" className="font-mono">
							{debitEntry.kodeAkun}
						</Badge>
						<span className="text-sm text-slate-600 truncate max-w-[120px]">
							{debitEntry.namaAkun}
						</span>
					</div>
				) : (
					"-"
				);
			},
		},
		{
			accessorKey: "totalDebit",
			header: () => <div className="text-right">Debit</div>,
			cell: ({ row }) => (
				<div className="text-right font-semibold text-emerald-600">
					{row.original.totalDebit > 0 ? formatRupiah(row.original.totalDebit) : "-"}
				</div>
			),
		},
		{
			id: "creditAccount",
			header: "Kredit (Akun)",
			cell: ({ row }) => {
				const creditEntry = row.original.entries.find((e) => e.kredit > 0);
				return creditEntry ? (
					<div className="flex items-center gap-1">
						<Badge variant="secondary" className="font-mono">
							{creditEntry.kodeAkun}
						</Badge>
						<span className="text-sm text-slate-600 truncate max-w-[120px]">
							{creditEntry.namaAkun}
						</span>
					</div>
				) : (
					"-"
				);
			},
		},
		{
			accessorKey: "totalKredit",
			header: () => <div className="text-right">Kredit</div>,
			cell: ({ row }) => (
				<div className="text-right font-semibold text-red-600">
					{row.original.totalKredit > 0 ? formatRupiah(row.original.totalKredit) : "-"}
				</div>
			),
		},
		...(isAdmin
			? [
					{
						id: "actions" as const,
						header: "Aksi",
						cell: ({ row }: { row: { original: CashflowCard } }) => (
							<div className="flex gap-1">
								<Button
									size="sm"
									variant="ghost"
									onClick={() => openEditDialog(row.original)}
								>
									<Pencil className="h-4 w-4" />
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="text-red-600 hover:text-red-700"
									onClick={() => {
										setSelectedCard(row.original);
										setIsDeleteOpen(true);
									}}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						),
					},
				]
			: []),
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">Cashflow</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Kelola arus kas masuk dan keluar
					</p>
				</div>
				{isAdmin && (
					<TransactionButtons
						accounts={accounts}
						onSuccess={() =>
							queryClient.invalidateQueries({ queryKey: ["cashflows"] })
						}
					/>
				)}
			</div>

			{/* Summary Cards */}
			<div className="grid gap-3 grid-cols-2 md:grid-cols-3">
				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-[#059DEA]/20 shrink-0">
							<TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Total Pendapatan
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatRupiah(summary.totalDebit)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-gray-100 shrink-0">
							<TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Total Pengeluaran
							</p>
							<p className="text-sm md:text-xl font-bold text-gray-900 truncate">
								{formatRupiah(summary.totalKredit)}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-[#059DEA] shadow-sm col-span-2 md:col-span-1">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/50 shrink-0">
							<Wallet className="h-5 w-5 md:h-6 md:w-6 text-white" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-white/80 truncate">
								Saldo Akhir
							</p>
							<p className="text-sm md:text-xl font-bold text-white truncate">
								{formatRupiah(summary.saldo ?? 0)}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search & Filters */}
			<Card>
				<CardContent className="p-4">
					<div className="flex flex-col gap-4">
						<div className="relative w-full">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<Input
								type="text"
								placeholder="Cari keterangan, kode akun, atau kategori..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-10 w-full"
							/>
						</div>
						<div className="flex flex-col sm:flex-row gap-3">
							{selectedYear && (
								<div className="space-y-1 min-w-[200px]">
									<Label className="text-xs text-gray-500">Tahun Ajaran</Label>
									<div className="flex items-center h-9 px-3 rounded-lg border border-gray-200 bg-gray-50">
										<Badge variant="secondary" className="text-xs">
											{selectedYear.tahunAjaran}
										</Badge>
									</div>
								</div>
							)}
							<div className="space-y-1 min-w-[200px]">
								<Label className="text-xs text-gray-500">Tipe Transaksi</Label>
								<div className="flex w-full rounded-lg border border-gray-200 p-1">
									<button
										onClick={() => setTypeFilter("all")}
										className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
											typeFilter === "all"
												? "bg-gray-900 text-white shadow-sm"
												: "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
										}`}
									>
										Semua
									</button>
									<button
										onClick={() => setTypeFilter("income")}
										className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
											typeFilter === "income"
												? "bg-[#059DEA] text-white shadow-sm"
												: "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
										}`}
									>
										Masuk
									</button>
									<button
										onClick={() => setTypeFilter("expense")}
										className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
											typeFilter === "expense"
												? "bg-red-100 text-red-700 shadow-sm"
												: "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
										}`}
									>
										Keluar
									</button>
								</div>
							</div>

							<div className="flex gap-2 w-full sm:w-auto">
								<div className="space-y-1 flex-1 sm:flex-none">
									<Label className="text-xs text-gray-500">Dari</Label>
									<Input
										type="date"
										value={startDate}
										onChange={(e) => setStartDate(e.target.value)}
										className="w-40 text-xs"
									/>
								</div>
								<div className="space-y-1 flex-1 sm:flex-none">
									<Label className="text-xs text-gray-500">Sampai</Label>
									<Input
										type="date"
										value={endDate}
										onChange={(e) => setEndDate(e.target.value)}
										className="w-40 text-xs"
									/>
								</div>
							</div>

							{(typeFilter !== "all" || startDate !== initialStart || endDate !== initialEnd || searchTerm) && (
								<Button
									variant="outline"
									size="sm"
									onClick={clearFilters}
									className="self-end w-full sm:w-auto mt-2 sm:mt-0"
								>
									<Filter className="mr-1 h-3 w-3" />
									Reset
								</Button>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						Daftar Transaksi
						{typeFilter !== "all" && (
							<Badge
								variant={typeFilter === "income" ? "income" : "expense"}
								className="ml-2"
							>
								{typeFilter === "income" ? "Pendapatan" : "Pengeluaran"}
							</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<DataTable
						columns={columns}
						data={cashflows}
						loading={isLoading}
						emptyMessage="Tidak ada data transaksi"
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
				title="Edit Transaksi"
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				form={cashflowForm}
			>
				<form onSubmit={handleEdit} className="space-y-4">
					<Controller
						control={cashflowForm.control}
						name="tanggal"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="tanggal">Tanggal</FieldLabel>
								<Input
									{...field}
									id="tanggal"
									type="date"
									aria-invalid={!!fieldState.error}
								/>
								<FieldError errors={fieldState.error ? [fieldState.error] : []} />
							</Field>
						)}
					/>

					<Controller
						control={cashflowForm.control}
						name="keterangan"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="keterangan">Keterangan</FieldLabel>
								<Input
									{...field}
									id="keterangan"
									placeholder="Contoh: Pembayaran Listrik"
									aria-invalid={!!fieldState.error}
								/>
								<FieldError errors={fieldState.error ? [fieldState.error] : []} />
							</Field>
						)}
					/>

					<Controller
						control={cashflowForm.control}
						name="kategori"
						render={({ field }) => (
							<Field>
								<FieldLabel htmlFor="kategori">Kategori</FieldLabel>
								<Input
									{...field}
									id="kategori"
									placeholder="Contoh: Operasional"
								/>
							</Field>
						)}
					/>

					{[0, 1].map((index) => (
						<div
							key={index}
							className="rounded-lg border border-gray-200 p-4 space-y-3"
						>
							<div className="flex items-center justify-between">
								<Label className="text-sm font-semibold text-gray-700">
									{index === 0 ? "Debit (Masuk)" : "Kredit (Keluar)"}
								</Label>
								{watchedEntries?.[index]?.kodeAkun && (
									<Badge variant="secondary" className="font-mono">
										{watchedEntries?.[index]?.kodeAkun}
									</Badge>
								)}
							</div>

							<Controller
								control={cashflowForm.control}
								name={`entries.${index}.kodeAkun`}
								render={({ fieldState }) => (
									<Field data-invalid={!!fieldState.error}>
										<FieldLabel className="text-xs text-gray-500">Akun</FieldLabel>
										<div className="relative">
											<Input
												type="text"
												placeholder="Cari kode atau nama akun..."
												value={editingEntryIndex === index ? accountSearch : ""}
												onChange={(e) => {
													setEditingEntryIndex(index);
													setAccountSearch(e.target.value);
												}}
												onFocus={() => {
													setEditingEntryIndex(index);
													setShowAccountDropdown(true);
												}}
												onBlur={() =>
													setTimeout(() => {
														setShowAccountDropdown(false);
														setEditingEntryIndex(null);
													}, 200)
												}
											/>
											{showAccountDropdown && editingEntryIndex === index && (
												<div className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg">
													{accounts
														.filter(
															(acc) =>
																debouncedAccountSearch === "" ||
																acc.kodeAkun
																	.toLowerCase()
																	.includes(debouncedAccountSearch.toLowerCase()) ||
																acc.namaAkun
																	.toLowerCase()
																	.includes(debouncedAccountSearch.toLowerCase()) ||
																acc.tipeAkun
																	.toLowerCase()
																	.includes(debouncedAccountSearch.toLowerCase()),
														)
														.map((acc) => (
															<button
																key={acc.id}
																type="button"
																onClick={() => selectAccount(index, acc.kodeAkun)}
																className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors border-b border-gray-50 last:border-b-0 ${
																	watchedEntries?.[index]?.kodeAkun === acc.kodeAkun
																		? "bg-[#059DEA]/30 font-medium"
																		: ""
																}`}
															>
																<span className="font-mono font-medium">
																	{acc.kodeAkun}
																</span>{" "}
																- {acc.namaAkun}
																<span className="ml-2 text-xs text-gray-400">
																	({acc.tipeAkun})
																</span>
															</button>
														))}
													{accounts.filter(
														(acc) =>
															debouncedAccountSearch === "" ||
															acc.kodeAkun
																.toLowerCase()
																.includes(debouncedAccountSearch.toLowerCase()) ||
															acc.namaAkun
																.toLowerCase()
																.includes(debouncedAccountSearch.toLowerCase()),
													).length === 0 && (
														<p className="px-3 py-2 text-sm text-gray-500">
															Tidak ada akun ditemukan
														</p>
													)}
												</div>
											)}
										</div>
										{watchedEntries?.[index]?.kodeAkun && (
											<div className="flex items-center gap-2 mt-1">
												<span className="text-sm text-slate-600">
													{accounts.find(
														(a) =>
															a.kodeAkun ===
															watchedEntries?.[index]?.kodeAkun,
													)?.namaAkun}
												</span>
												<button
													type="button"
													onClick={() =>
														cashflowForm.setValue(`entries.${index}.kodeAkun`, "", {
															shouldValidate: true,
														})
													}
													className="text-xs text-red-500 hover:text-red-700"
												>
													✕
												</button>
											</div>
										)}
										<FieldError errors={fieldState.error ? [fieldState.error] : []} />
									</Field>
								)}
							/>

							<div className="grid grid-cols-2 gap-3">
								<Controller
									control={cashflowForm.control}
									name={`entries.${index}.debit`}
									render={({ field }) => (
										<Field>
											<FieldLabel className="text-xs text-gray-500">Debit</FieldLabel>
											<div className="relative">
												<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
													Rp
												</span>
												<Input
													value={field.value}
													onChange={(e) =>
														field.onChange(formatNumberInput(e.target.value))
													}
													placeholder="0"
													className="pl-10"
												/>
											</div>
										</Field>
									)}
								/>
								<Controller
									control={cashflowForm.control}
									name={`entries.${index}.kredit`}
									render={({ field }) => (
										<Field>
											<FieldLabel className="text-xs text-gray-500">Kredit</FieldLabel>
											<div className="relative">
												<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
													Rp
												</span>
												<Input
													value={field.value}
													onChange={(e) =>
														field.onChange(formatNumberInput(e.target.value))
													}
													placeholder="0"
													className="pl-10"
												/>
											</div>
										</Field>
									)}
								/>
							</div>
						</div>
					))}

					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsEditOpen(false)}
						>
							Batal
						</Button>
						<Button type="submit" disabled={editMutation.isPending}>
							{editMutation.isPending ? "Menyimpan..." : "Update"}
						</Button>
					</div>
				</form>
			</FormDialog>

			{/* Delete Confirmation Dialog */}
			<Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
						<Dialog.Title className="text-lg font-semibold text-slate-900">
							Hapus Transaksi
						</Dialog.Title>
						<p className="mt-2 text-sm text-slate-600">
							Apakah Anda yakin ingin menghapus transaksi ini? Saldo akun akan
							otomatis disesuaikan.
						</p>
						<div className="mt-6 flex justify-end gap-3">
							<Dialog.Close asChild>
								<Button variant="outline">Batal</Button>
							</Dialog.Close>
							<Button variant="destructive" onClick={handleDelete}>
								Hapus
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}

export default function CashflowPage() {
	return <CashflowInner key={useAcademicYear().selectedYear?.id} />;
}
