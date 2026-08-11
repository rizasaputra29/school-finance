"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Search,
	Receipt,
	CheckCircle,
	Clock,
	AlertCircle,
	ChevronRight,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { DataTable } from "@/components/reusable/DataTable";
import { StatusBadge } from "@/components/reusable/StatusBadge";
import {
	CurrencyInput,
	parseFormattedNumber,
} from "@/components/reusable/CurrencyInput";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import { FormDialog } from "@/components/reusable/FormDialog";
import { BulkPayDialog } from "@/components/reusable/BulkPayDialog";
import { Field, FieldLabel, FieldError } from "@/components/reusable/Field";
import { InstallmentPlanPreview } from "@/components/reusable/InstallmentPlanPreview";
import { BILLING_TYPES } from "@/config/classes";
import { groupBillings, type BillingRowData } from "@/lib/services/billing";
import type {
	Billing,
	BillingSummary,
} from "@/types/billing";
import type { StudentMinimal as Student } from "@/types/student";
import type { Pagination as PaginationMeta } from "@/types/pagination";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { useAcademicYear } from "@/context/AcademicYearContext";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

const createBillingSchema = z.object({
	studentId: z.string().min(1, "Siswa wajib dipilih"),
	jenisBiaya: z.string().min(1, "Jenis biaya wajib diisi"),
	jumlah: z.string().min(1, "Jumlah wajib diisi"),
	catatan: z.string().optional(),
	isCicilan: z.boolean(),
	tenor: z.string().optional(),
});

type CreateBillingForm = z.infer<typeof createBillingSchema>;

export default function BillingPage() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState("");
	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
	const [statusFilter, setStatusFilter] = useState("");
	const [overdueFilter, setOverdueFilter] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [studentSearch, setStudentSearch] = useState("");
	const [debouncedStudentSearch] = useDebounce(studentSearch, 200);
	const [paymentSource, setPaymentSource] = useState<"kas" | "bank">("kas");
	const [selectedBillingForPay, setSelectedBillingForPay] = useState<Billing | null>(null);
	const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
	const [isGenerateSppOpen, setIsGenerateSppOpen] = useState(false);
	const [sppJumlah, setSppJumlah] = useState("");
	const [sppTanggal, setSppTanggal] = useState("5");
	const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);
	const [selectedGroupForBulkPay, setSelectedGroupForBulkPay] = useState<BillingRowData | null>(null);

	const form = useForm<CreateBillingForm>({
		resolver: zodResolver(createBillingSchema),
		mode: "onChange",
		defaultValues: {
			studentId: "",
			jenisBiaya: "",
			jumlah: "",
			catatan: "",
			isCicilan: false,
			tenor: "",
		},
	});

	const watchIsCicilan = form.watch("isCicilan");
	const watchJumlah = form.watch("jumlah");
	const watchTenor = form.watch("tenor");

	const { data: studentsData } = useQuery({
		queryKey: ["students", "billing"],
		queryFn: () =>
			fetch("/api/students?limit=1000&status=Active").then((r) => r.json()),
	});

	const students: Student[] = studentsData?.data ?? [];

	const fetchData = useCallback(() => {
		let url = `/api/billing?page=1&limit=1000`;
		if (statusFilter) url += `&statusBayar=${statusFilter}`;
		if (overdueFilter) url += `&overdue=true`;
		if (selectedYear?.id) url += `&academicYearId=${selectedYear.id}`;
		if (debouncedSearchTerm)
			url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;
		return fetch(url).then((r) => r.json());
	}, [statusFilter, overdueFilter, selectedYear?.id, debouncedSearchTerm]);

	const { data, isLoading } = useQuery({
		queryKey: [
			"billings",
			statusFilter,
			overdueFilter,
			selectedYear?.id,
			debouncedSearchTerm,
		],
		queryFn: fetchData,
		placeholderData: () => ({
			data: [],
			meta: {
				pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
				summary: {
					totalTagihan: 0,
					totalBelumLunas: 0,
					totalLunas: 0,
					totalCicilan: 0,
					countBelumLunas: 0,
					countLunas: 0,
					countCicilan: 0,
					countOverdue: 0,
				},
			},
		}),
	});

	const billings: Billing[] = data?.data ?? [];
	const pagination: PaginationMeta = data?.meta?.pagination ?? {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	};
	const summary: BillingSummary = data?.meta?.summary ?? {
		totalTagihan: 0,
		totalBelumLunas: 0,
		totalLunas: 0,
		totalCicilan: 0,
		countBelumLunas: 0,
		countLunas: 0,
		countCicilan: 0,
		countOverdue: 0,
	};

	const groupedBillings = useMemo(() => {
		return groupBillings(billings as BillingRowData[]);
	}, [billings]);

	const createMutation = useMutation({
		mutationFn: (payload: Record<string, unknown>) =>
			fetch("/api/billing", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(
						result.error?.message || "Gagal membuat tagihan",
					);
				return result;
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["billings"] });
			queryClient.invalidateQueries({ queryKey: ["students", "billing"] });
			setIsCreateOpen(false);
			form.reset();
			toast.success("Tagihan berhasil dibuat");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const payMutation = useMutation({
		mutationFn: ({ id, data: payload }: { id: string; data: Record<string, unknown> }) =>
			fetch(`/api/billing/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(
						result.error?.message || "Gagal memproses pembayaran",
					);
				return result;
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["billings"] });
			queryClient.invalidateQueries({ queryKey: ["students", "billing"] });
			setIsPayDialogOpen(false);
			setSelectedBillingForPay(null);
			toast.success("Pembayaran berhasil diproses");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const generateSppMutation = useMutation({
		mutationFn: (payload: { academicYearId: string; jumlahPerBulan: number; tanggalJatuhTempo: number }) =>
			fetch("/api/billing/generate-spp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(
						result.error?.message || "Gagal generate SPP",
					);
				return result;
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["billings"] });
			queryClient.invalidateQueries({ queryKey: ["students", "billing"] });
			setIsGenerateSppOpen(false);
			setSppJumlah("");
			toast.success(result.message || "SPP berhasil di-generate");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const bulkPayMutation = useMutation({
		mutationFn: ({ billingIds, source }: { billingIds: string[]; source: "kas" | "bank" }) =>
			fetch("/api/billing/bulk-pay", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ billingIds, source }),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(
						result.error?.message || "Gagal memproses pembayaran",
					);
				return result;
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["billings"] });
			queryClient.invalidateQueries({ queryKey: ["students", "billing"] });
			setIsBulkPayOpen(false);
			setSelectedGroupForBulkPay(null);
			toast.success(result.message || "Pembayaran berhasil diproses");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const handleSubmit = (formData: CreateBillingForm) => {
		createMutation.mutate({
			studentId: formData.studentId,
			jenisBiaya: formData.jenisBiaya,
			jumlah: parseFormattedNumber(formData.jumlah),
			catatan: formData.catatan || undefined,
			isCicilan: formData.isCicilan,
			tenor: formData.isCicilan ? parseInt(formData.tenor || "0") : undefined,
			academicYearId: selectedYear?.id,
		});
	};

	const handlePay = (billing: Billing) => {
		setSelectedBillingForPay(billing);
		setPaymentSource("kas");
		setIsPayDialogOpen(true);
	};

	const handleBulkPay = (group: BillingRowData) => {
		setSelectedGroupForBulkPay(group);
		setIsBulkPayOpen(true);
	};

	const filteredStudents = useMemo(() => {
		if (!debouncedStudentSearch) return students;
		const term = debouncedStudentSearch.toLowerCase();
		return students.filter(
			(s) =>
				s.nama.toLowerCase().includes(term) ||
				s.nis.toLowerCase().includes(term),
		);
	}, [students, debouncedStudentSearch]);

	const columns: ColumnDef<BillingRowData>[] = useMemo(
		() => [
			{
				id: "expand",
				size: 40,
				header: "",
				cell: ({ row }) => {
					if (!row.original.isGroup && !row.original.children?.length) return null;
					return (
						<button
							onClick={(e) => {
								e.stopPropagation();
								row.toggleExpanded();
							}}
							className="p-1 hover:bg-gray-100 rounded"
						>
							<ChevronRight
								className={`h-4 w-4 transition-transform ${
									row.getIsExpanded() ? "rotate-90" : ""
								}`}
							/>
						</button>
					);
				},
			},
			{
				accessorKey: "student.nis",
				header: "NIS",
				cell: ({ row }) => (
					<span className="font-mono">{row.original.student.nis}</span>
				),
			},
			{
				accessorKey: "student.nama",
				header: "Nama Siswa",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.student.nama}</span>
				),
			},
			{
				accessorKey: "student.kelas",
				header: "Kelas",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.student.kelas}</Badge>
				),
			},
			{
				accessorKey: "jenisBiaya",
				header: "Jenis Biaya",
				cell: ({ row }) => {
					const b = row.original;
					if (b.isGroup) {
						return (
							<div>
								<span className="font-medium">{b.jenisBiaya}</span>
								<span className="ml-2 text-xs text-gray-500">{b.label}</span>
							</div>
						);
					}
					return (
						<div>
							<span>{b.jenisBiaya}</span>
							{b.keterangan && (
								<p className="text-xs text-gray-500 mt-0.5">{b.keterangan}</p>
							)}
						</div>
					);
				},
			},
			{
				accessorKey: "jumlah",
				header: "Jumlah",
				cell: ({ row }) => {
					const b = row.original;
					const amount = b.isGroup ? b.totalJumlah : b.jumlah;
					return (
						<span className="text-right font-semibold block">
							{formatRupiah(amount ?? 0)}
						</span>
					);
				},
			},
			{
				accessorKey: "statusBayar",
				header: "Status",
				cell: ({ row }) => {
					const status = row.original.statusBayar;
					if (status === "Lunas")
						return <StatusBadge label="Lunas" variant="success" />;
					if (status === "Sebagian")
						return <StatusBadge label="Sebagian" variant="info" />;
					return <StatusBadge label="Belum Lunas" variant="warning" />;
				},
			},
			{
				id: "actions",
				header: "Aksi",
				cell: ({ row }) => {
					const b = row.original;
					if (b.isGroup) {
						if (b.statusBayar === "Lunas" || !isAdmin) return null;
						return (
							<div className="flex gap-1">
								<Button size="sm" variant="outline" onClick={() => handleBulkPay(b)}>
									<CheckCircle className="h-3 w-3 mr-1" />
									Bayar
								</Button>
							</div>
						);
					}
					return (
						<div className="flex gap-1">
							{b.statusBayar !== "Lunas" && isAdmin && (
								<Button size="sm" variant="outline" onClick={() => handlePay(b as Billing)}>
									<CheckCircle className="h-3 w-3 mr-1" />
									Bayar
								</Button>
							)}
						</div>
					);
				},
			},
		],
		[isAdmin],
	);

	return (
		<div className="space-y-6">
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
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							className="text-xs md:text-sm"
							onClick={() => {
								setSppJumlah("");
								setSppTanggal("5");
								setIsGenerateSppOpen(true);
							}}
						>
							<Receipt className="h-4 w-4 md:mr-2" />
							<span className="hidden md:inline">Generate SPP</span>
							<span className="md:hidden">SPP</span>
						</Button>
						<Button
							size="sm"
							className="text-xs md:text-sm"
							onClick={() => {
								form.reset();
								setIsCreateOpen(true);
							}}
						>
							<Plus className="h-4 w-4 md:mr-2" />
							<span className="hidden md:inline">Tambah Tagihan</span>
							<span className="md:hidden">Tambah</span>
						</Button>
					</div>
				)}
			</div>

			<div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
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
								{formatRupiah(summary.totalTagihan)}
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
								{formatRupiah(summary.totalBelumLunas)}
							</p>
							<p className="text-[10px] text-gray-400 mt-0.5 md:mt-1 truncate">
								{summary.countBelumLunas} tagihan
							</p>
						</div>
					</CardContent>
				</Card>
				<Card className="bg-white shadow-sm">
					<CardContent className="flex items-center gap-3 p-3 md:p-5">
						<div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-red-50 shrink-0">
							<AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-red-600" />
						</div>
						<div className="min-w-0">
							<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
								Jatuh Tempo
							</p>
							<p className="text-sm md:text-xl font-bold text-red-600 truncate">
								{summary.countOverdue}
							</p>
							<p className="text-[10px] text-gray-400 mt-0.5 md:mt-1 truncate">
								tagihan terlambat
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
								{formatRupiah(summary.totalLunas)}
							</p>
							<p className="text-[10px] text-gray-400 mt-0.5 md:mt-1 truncate">
								{summary.countLunas} tagihan
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

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
						<div className="flex gap-2 overflow-x-auto pb-1">
							<Button
								variant={
									statusFilter === "" && !overdueFilter ? "default" : "outline"
								}
								size="sm"
								onClick={() => {
									setStatusFilter("");
									setOverdueFilter(false);
								}}
								className="whitespace-nowrap"
							>
								Semua
							</Button>
							<Button
								variant={
									statusFilter === "Lunas" && !overdueFilter
										? "default"
										: "outline"
								}
								size="sm"
								onClick={() => {
									setStatusFilter("Lunas");
									setOverdueFilter(false);
								}}
								className="whitespace-nowrap"
							>
								Lunas
							</Button>
							<Button
								variant={
									statusFilter === "Belum Lunas" && !overdueFilter
										? "default"
										: "outline"
								}
								size="sm"
								onClick={() => {
									setStatusFilter("Belum Lunas");
									setOverdueFilter(false);
								}}
								className="whitespace-nowrap"
							>
								Belum Lunas
							</Button>
							<Button
								variant={overdueFilter ? "default" : "outline"}
								size="sm"
								onClick={() => {
									setStatusFilter("");
									setOverdueFilter(true);
								}}
								className="whitespace-nowrap text-red-600 border-red-200 hover:bg-red-50"
							>
								<AlertCircle className="w-3 h-3 mr-1" /> Jatuh Tempo
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-0">
					<DataTable
						columns={columns}
						data={groupedBillings}
						loading={isLoading}
						emptyMessage="Tidak ada data tagihan"
						pageSize={50}
						renderSubComponent={({ row }) => {
							const b = row.original as BillingRowData;
							if (!b.children) return null;
							return (
								<div className="bg-gray-50 p-3 space-y-1">
									{b.children.map((child) => (
										<div
											key={child.id}
											className="flex items-center justify-between py-1.5 px-3 rounded bg-white text-sm"
										>
											<div className="flex items-center gap-3">
												<span className="text-gray-600 min-w-[200px]">
													{child.keterangan || child.jenisBiaya}
												</span>
												{child.tanggalJatuhTempo && (
													<span className="text-xs text-gray-400">
														JT: {formatShortDate(child.tanggalJatuhTempo)}
													</span>
												)}
											</div>
											<div className="flex items-center gap-3">
												<span className="font-medium">
													{formatRupiah(child.jumlah)}
												</span>
												{child.statusBayar === "Lunas" ? (
													<StatusBadge label="Lunas" variant="success" />
												) : (
													<StatusBadge label="Belum Lunas" variant="warning" />
												)}
												{child.statusBayar !== "Lunas" && isAdmin && (
													<Button
														size="sm"
														variant="outline"
														onClick={() => handlePay(child as Billing)}
													>
														Bayar
													</Button>
												)}
											</div>
										</div>
									))}
								</div>
							);
						}}
					/>
					{pagination.totalPages > 1 && (
						<div className="flex items-center justify-between px-4 py-3 border-t">
							<p className="text-sm text-gray-500">
								Menampilkan {(pagination.page - 1) * pagination.limit + 1} -{" "}
								{Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
								dari {pagination.total} tagihan
							</p>
							<Pagination>
								<PaginationContent>
									<PaginationItem>
										<PaginationPrevious
											text="Sebelumnya"
											onClick={(e) => {
												e.preventDefault();
												if (currentPage > 1) setCurrentPage(currentPage - 1);
											}}
											className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
										/>
									</PaginationItem>
									<PaginationItem>
										<PaginationLink size="default" isActive>{pagination.page}</PaginationLink>
									</PaginationItem>
									{pagination.totalPages > 1 && (
										<PaginationItem>
											<PaginationLink
												size="default"
												onClick={(e) => {
													e.preventDefault();
													setCurrentPage(2);
												}}
												className="cursor-pointer"
											>
												2
											</PaginationLink>
										</PaginationItem>
									)}
									<PaginationItem>
										<PaginationNext
											text="Selanjutnya"
											onClick={(e) => {
												e.preventDefault();
												if (currentPage < pagination.totalPages) setCurrentPage(currentPage + 1);
											}}
											className={currentPage >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
										/>
									</PaginationItem>
								</PaginationContent>
							</Pagination>
						</div>
					)}
				</CardContent>
			</Card>

			<FormDialog
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				title="Tambah Tagihan Baru"
				description="Buat tagihan baru untuk siswa"
				className="max-w-md"
			>
				<form
					onSubmit={form.handleSubmit(handleSubmit)}
					className="space-y-4"
				>
					{createMutation.isError && (
						<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
							{createMutation.error.message}
						</div>
					)}

					<Field data-invalid={!!form.formState.errors.studentId}>
						<FieldLabel>Pilih Siswa *</FieldLabel>
						<Controller
							control={form.control}
							name="studentId"
							render={({ field }) => (
								<SearchableSelect
									options={filteredStudents.map((s) => ({
										value: s.id,
										label: s.nis,
										subLabel: `${s.nama} (${s.kelas})`,
									}))}
									value={field.value}
									onChange={(val) => {
										field.onChange(val);
										setStudentSearch("");
									}}
									placeholder="Cari nama atau NIS siswa..."
								/>
							)}
						/>
						<FieldError
							errors={
								form.formState.errors.studentId
									? [{ message: form.formState.errors.studentId.message }]
									: []
							}
						/>
					</Field>

					<Field data-invalid={!!form.formState.errors.jenisBiaya}>
						<FieldLabel>Jenis Biaya *</FieldLabel>
						<Controller
							control={form.control}
							name="jenisBiaya"
							render={({ field }) => (
								<select
									{...field}
									className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
									aria-invalid={!!form.formState.errors.jenisBiaya}
								>
									<option value="">-- Pilih Jenis Biaya --</option>
									{BILLING_TYPES.map((j) => (
										<option key={j} value={j}>
											{j}
										</option>
									))}
								</select>
							)}
						/>
						<FieldError
							errors={
								form.formState.errors.jenisBiaya
									? [{ message: form.formState.errors.jenisBiaya.message }]
									: []
							}
						/>
					</Field>

					<Field data-invalid={!!form.formState.errors.jumlah}>
						<FieldLabel>Jumlah (Rp) *</FieldLabel>
						<Controller
							control={form.control}
							name="jumlah"
							render={({ field }) => (
								<CurrencyInput
									value={field.value}
									onChange={field.onChange}
									placeholder="500.000"
									aria-invalid={!!form.formState.errors.jumlah}
								/>
							)}
						/>
						<p className="text-xs text-slate-400">
							Contoh: 500.000 = lima ratus ribu rupiah
						</p>
						<FieldError
							errors={
								form.formState.errors.jumlah
									? [{ message: form.formState.errors.jumlah.message }]
									: []
							}
						/>
					</Field>

					<Field data-invalid={!!form.formState.errors.catatan}>
						<FieldLabel>Catatan (Opsional)</FieldLabel>
						<Controller
							control={form.control}
							name="catatan"
							render={({ field }) => (
								<Input {...field} placeholder="Catatan tambahan..." />
							)}
						/>
					</Field>

					<div className="border-t border-gray-100 pt-4">
						<label className="flex items-center gap-3 cursor-pointer">
							<Controller
								control={form.control}
								name="isCicilan"
								render={({ field }) => (
									<input
										type="checkbox"
										checked={field.value}
										onChange={(e) => field.onChange(e.target.checked)}
										className="h-4 w-4 rounded border-gray-300 text-[#059DEA] focus:ring-[#059DEA]"
									/>
								)}
							/>
							<div>
								<span className="text-sm font-medium text-gray-700">
									Bayar dengan Cicilan
								</span>
								<p className="text-xs text-gray-500">
									Bagi tagihan ini menjadi beberapa cicilan bulanan
								</p>
							</div>
						</label>
					</div>

					{watchIsCicilan && (
						<>
							<div className="grid grid-cols-2 gap-3">
								<Field data-invalid={!!form.formState.errors.tenor}>
									<FieldLabel>Tenor (Bulan) *</FieldLabel>
									<Controller
										control={form.control}
										name="tenor"
										render={({ field }) => (
											<Input
												type="number"
												min={1}
												max={12}
												{...field}
												placeholder="3"
												aria-invalid={!!form.formState.errors.tenor}
											/>
										)}
									/>
									<p className="text-xs text-slate-400">1-12 bulan</p>
									<FieldError
										errors={
											form.formState.errors.tenor
												? [{ message: form.formState.errors.tenor.message }]
												: []
										}
									/>
								</Field>
						</div>
						{watchJumlah && watchTenor && parseInt(watchTenor) > 0 && (
							<InstallmentPlanPreview
								jumlahTotal={parseFormattedNumber(watchJumlah)}
								tenor={parseInt(watchTenor)}
								jenisBiaya={form.watch("jenisBiaya")}
							/>
						)}
						</>
					)}

					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsCreateOpen(false)}
						>
							Batal
						</Button>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? "Menyimpan..." : "Simpan"}
						</Button>
					</div>
				</form>
			</FormDialog>

			<FormDialog
				open={isPayDialogOpen}
				onOpenChange={setIsPayDialogOpen}
				title="Konfirmasi Pembayaran"
				description={`Bayar tagihan ${selectedBillingForPay?.jenisBiaya ?? ""} untuk ${selectedBillingForPay?.student?.nama ?? ""}`}
				className="max-w-sm"
			>
				{selectedBillingForPay && (
					<div className="space-y-4">
						<div className="rounded-lg bg-slate-50 p-4 space-y-2">
							<p className="text-sm text-slate-600">
								<span className="font-medium">Jenis Biaya:</span>{" "}
								{selectedBillingForPay.jenisBiaya}
							</p>
						<p className="text-sm text-slate-600">
							<span className="font-medium">Jumlah:</span>{" "}
							{formatRupiah(selectedBillingForPay.jumlah)}
						</p>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-gray-700">
								Sumber Pembayaran
							</label>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={paymentSource === "kas" ? "default" : "outline"}
									size="sm"
									className="flex-1"
									onClick={() => setPaymentSource("kas")}
								>
									Kas
								</Button>
								<Button
									type="button"
									variant={paymentSource === "bank" ? "default" : "outline"}
									size="sm"
									className="flex-1"
									onClick={() => setPaymentSource("bank")}
								>
									Bank
								</Button>
							</div>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								variant="outline"
								onClick={() => {
									setIsPayDialogOpen(false);
									setSelectedBillingForPay(null);
								}}
							>
								Batal
							</Button>
							<Button
								onClick={() => {
									if (!selectedBillingForPay) return;
									payMutation.mutate({
										id: selectedBillingForPay.id,
										data: { statusBayar: "Lunas", source: paymentSource },
									});
								}}
								disabled={payMutation.isPending}
							>
								{payMutation.isPending ? "Memproses..." : "Konfirmasi Bayar"}
							</Button>
						</div>
					</div>
				)}
			</FormDialog>

			{/* Generate SPP Dialog */}
			<FormDialog
				open={isGenerateSppOpen}
				onOpenChange={setIsGenerateSppOpen}
				title="Generate SPP untuk Setahun"
			>
				<div className="space-y-4">
					<p className="text-sm text-gray-500">
						Buat tagihan SPP untuk semua siswa aktif selama 12 bulan
					</p>
					<Field>
						<FieldLabel>Jumlah SPP per Bulan *</FieldLabel>
						<CurrencyInput
							value={sppJumlah}
							onChange={setSppJumlah}
							placeholder="500.000"
						/>
					</Field>
					<Field>
						<FieldLabel>Tanggal Jatuh Tempo *</FieldLabel>
						<select
							value={sppTanggal}
							onChange={(e) => setSppTanggal(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							{Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
								<option key={day} value={day.toString()}>
									Tanggal {day}
								</option>
							))}
						</select>
					</Field>
					{sppJumlah && (
						<div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
							Akan membuat 12 tagihan SPP × {formatRupiah(parseFormattedNumber(sppJumlah))} untuk semua siswa aktif
						</div>
					)}
					<div className="flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => setIsGenerateSppOpen(false)}
						>
							Batal
						</Button>
						<Button
							onClick={() => {
								if (!sppJumlah || parseFormattedNumber(sppJumlah) <= 0) {
									toast.error("Jumlah SPP wajib diisi");
									return;
								}
								if (!selectedYear?.id) {
									toast.error("Tahun ajaran tidak ditemukan");
									return;
								}
								generateSppMutation.mutate({
									academicYearId: selectedYear.id,
									jumlahPerBulan: parseFormattedNumber(sppJumlah),
									tanggalJatuhTempo: parseInt(sppTanggal),
								});
							}}
							disabled={generateSppMutation.isPending}
						>
							{generateSppMutation.isPending
								? "Generating..."
								: "Generate SPP"}
						</Button>
					</div>
				</div>
			</FormDialog>

			{/* Bulk Pay Dialog */}
			<BulkPayDialog
				open={isBulkPayOpen}
				onOpenChange={setIsBulkPayOpen}
				title="Bayar Beberapa Tagihan"
				description={selectedGroupForBulkPay ? `${selectedGroupForBulkPay.student?.nama} - ${selectedGroupForBulkPay.label}` : ""}
				items={
					selectedGroupForBulkPay?.children?.map((child) => ({
						id: child.id,
						label: child.keterangan || `${child.jenisBiaya} Bulan ${child.bulan || ""}`,
						keterangan: child.keterangan || undefined,
						jumlah: child.jumlah,
						tanggalJatuhTempo: child.tanggalJatuhTempo,
						statusBayar: child.statusBayar,
					})) || []
				}
				isPending={bulkPayMutation.isPending}
				onConfirm={(selectedIds, source) => {
					bulkPayMutation.mutate({ billingIds: selectedIds, source });
				}}
			/>
		</div>
	);
}
