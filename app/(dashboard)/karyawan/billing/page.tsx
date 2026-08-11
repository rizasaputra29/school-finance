"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
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
	ArrowLeft,
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
import { useAcademicYear } from "@/context/AcademicYearContext";
import { groupEmployeeBillings, type EmployeeBillingRowData } from "@/lib/services/billing";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

interface EmployeeBilling {
	id: string;
	employeeId: string;
	employee: {
		id: string;
		nip: string;
		nama: string;
		jabatan: string;
	};
	jenisBiaya: string;
	tipe: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
	tanggalJatuhTempo: string | null;
	keterangan: string | null;
	catatan: string | null;
}

interface EmployeeSummary {
	totalTagihan: number;
	totalBelumLunas: number;
	totalLunas: number;
	countBelumLunas: number;
	countLunas: number;
	countOverdue: number;
}

const EMPLOYEE_FEE_TYPES = [
	"Gaji",
	"Tunjangan",
	"Bonus",
	"Lembur",
	"Transport",
	"Makan",
	"Lainnya",
];

const createBillingSchema = z.object({
	employeeId: z.string().min(1, "Karyawan wajib dipilih"),
	jenisBiaya: z.string().min(1, "Jenis biaya wajib diisi"),
	jumlah: z.string().min(1, "Jumlah wajib diisi"),
	tanggalJatuhTempo: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
	keterangan: z.string().optional(),
	catatan: z.string().optional(),
});

type CreateBillingForm = z.infer<typeof createBillingSchema>;

export default function EmployeeBillingPage() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState("");
	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
	const [statusFilter, setStatusFilter] = useState("");
	const [overdueFilter, setOverdueFilter] = useState(false);
	const [tipeFilter, setTipeFilter] = useState("");
	const [paymentSource, setPaymentSource] = useState<"kas" | "bank">("kas");
	const [currentPage, setCurrentPage] = useState(1);

	const [isCreateOpen, setIsCreateOpen] = useState(false);

	const [employeeSearch, setEmployeeSearch] = useState("");
	const [debouncedEmployeeSearch] = useDebounce(employeeSearch, 200);
	const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
	const [selectedBillingForPay, setSelectedBillingForPay] = useState<EmployeeBilling | null>(null);
	const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);
	const [selectedGroupForBulkPay, setSelectedGroupForBulkPay] = useState<EmployeeBillingRowData | null>(null);

	const form = useForm<CreateBillingForm>({
		resolver: zodResolver(createBillingSchema),
		mode: "onChange",
		defaultValues: {
			employeeId: "",
			jenisBiaya: "",
			jumlah: "",
			tanggalJatuhTempo: "",
			keterangan: "",
			catatan: "",
		},
	});

	const { data: employeesData } = useQuery({
		queryKey: ["employees", "billing"],
		queryFn: () =>
			fetch("/api/karyawan?limit=1000&status=Active").then((r) => r.json()),
	});

	const employees = employeesData?.data ?? [];

	const fetchData = useCallback(() => {
		let url = `/api/karyawan/billing?page=1&limit=1000`;
		if (statusFilter) url += `&statusBayar=${statusFilter}`;
		if (overdueFilter) url += `&overdue=true`;
		if (tipeFilter) url += `&tipe=${tipeFilter}`;
		if (selectedYear?.id) url += `&academicYearId=${selectedYear.id}`;
		if (debouncedSearchTerm)
			url += `&search=${encodeURIComponent(debouncedSearchTerm)}`;
		return fetch(url).then((r) => r.json());
	}, [statusFilter, overdueFilter, tipeFilter, selectedYear?.id, debouncedSearchTerm]);

	const { data, isLoading } = useQuery({
		queryKey: [
			"employeeBillings",
			statusFilter,
			overdueFilter,
			tipeFilter,
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

	const billings: EmployeeBilling[] = data?.data ?? [];
	const pagination = data?.meta?.pagination ?? {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	};
	const summary: EmployeeSummary = data?.meta?.summary ?? {
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
		return groupEmployeeBillings(billings as EmployeeBillingRowData[]);
	}, [billings]);

	const createMutation = useMutation({
		mutationFn: (payload: Record<string, unknown>) =>
			fetch("/api/karyawan/billing", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(result.error?.message || "Gagal membuat tagihan");
				return result;
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["employeeBillings"] });
			queryClient.invalidateQueries({ queryKey: ["employees", "billing"] });
			setIsCreateOpen(false);
			form.reset();
			toast.success("Tagihan karyawan berhasil dibuat");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const payMutation = useMutation({
		mutationFn: ({ id, data: payload }: { id: string; data: Record<string, unknown> }) =>
			fetch(`/api/karyawan/billing/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}).then(async (r) => {
				const result = await r.json();
				if (!result.success)
					throw new Error(result.error?.message || "Gagal memproses pembayaran");
				return result;
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["employeeBillings"] });
			queryClient.invalidateQueries({ queryKey: ["employees", "billing"] });
			setIsPayDialogOpen(false);
			setSelectedBillingForPay(null);
			toast.success("Pembayaran berhasil diproses");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const bulkPayMutation = useMutation({
		mutationFn: ({ billingIds, source }: { billingIds: string[]; source: "kas" | "bank" }) =>
			fetch("/api/karyawan/billing/bulk-pay", {
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
			queryClient.invalidateQueries({ queryKey: ["employeeBillings"] });
			queryClient.invalidateQueries({ queryKey: ["employees", "billing"] });
			setIsBulkPayOpen(false);
			setSelectedGroupForBulkPay(null);
			toast.success(result.message || "Pembayaran berhasil diproses");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const handleSubmit = (formData: CreateBillingForm) => {
		createMutation.mutate({
			employeeId: formData.employeeId,
			jenisBiaya: formData.jenisBiaya,
			jumlah: parseFormattedNumber(formData.jumlah),
			tanggalJatuhTempo: formData.tanggalJatuhTempo,
			keterangan: formData.keterangan || undefined,
			catatan: formData.catatan || undefined,
		});
	};

	const filteredEmployees = useMemo(() => {
		if (!debouncedEmployeeSearch) return employees;
		const term = debouncedEmployeeSearch.toLowerCase();
		return employees.filter(
			(e: { nama: string; nip: string }) =>
				e.nama.toLowerCase().includes(term) ||
				e.nip.toLowerCase().includes(term),
		);
	}, [employees, debouncedEmployeeSearch]);

	const columns: ColumnDef<EmployeeBillingRowData>[] = useMemo(
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
				accessorKey: "employee.nip",
				header: "NIP",
				cell: ({ row }) => (
					<span className="font-mono">{row.original.employee.nip}</span>
				),
			},
			{
				accessorKey: "employee.nama",
				header: "Nama Karyawan",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.employee.nama}</span>
				),
			},
			{
				accessorKey: "employee.jabatan",
				header: "Jabatan",
				cell: ({ row }) => (
					<Badge variant="secondary">{row.original.employee.jabatan}</Badge>
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
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setSelectedGroupForBulkPay(b);
										setIsBulkPayOpen(true);
									}}
								>
									<CheckCircle className="h-3 w-3 mr-1" />
									Bayar
								</Button>
							</div>
						);
					}
					return (
						<div className="flex gap-1">
							{b.statusBayar !== "Lunas" && isAdmin && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setSelectedBillingForPay(b as EmployeeBilling);
										setPaymentSource("kas");
										setIsPayDialogOpen(true);
									}}
								>
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
				<div className="flex items-center gap-3">
					<Link href="/karyawan">
						<button className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-gray-50">
							<ArrowLeft className="h-4 w-4" />
						</button>
					</Link>
					<div>
						<h1 className="text-xl md:text-2xl font-bold text-gray-900">
							Biaya Karyawan
						</h1>
						<p className="text-xs md:text-sm text-gray-500">
							Kelola tagihan dan pembayaran karyawan
						</p>
					</div>
				</div>
				{isAdmin && (
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
								placeholder="Cari nama karyawan, NIP, atau jenis biaya..."
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
							<div className="w-px h-6 bg-gray-200 mx-1" />
							<Button
								variant={tipeFilter === "Tagihan" ? "default" : "outline"}
								size="sm"
								onClick={() => setTipeFilter(tipeFilter === "Tagihan" ? "" : "Tagihan")}
								className="whitespace-nowrap"
							>
								Tagihan
							</Button>
							<Button
								variant={tipeFilter === "Pembayaran" ? "default" : "outline"}
								size="sm"
								onClick={() => setTipeFilter(tipeFilter === "Pembayaran" ? "" : "Pembayaran")}
								className="whitespace-nowrap"
							>
								Pembayaran
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
						emptyMessage="Tidak ada data tagihan karyawan"
						pageSize={50}
						renderSubComponent={({ row }) => {
							const b = row.original as EmployeeBillingRowData;
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
														onClick={() => {
															setSelectedBillingForPay(child as EmployeeBilling);
															setPaymentSource("kas");
															setIsPayDialogOpen(true);
														}}
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
											size="default"
											href="#"
											onClick={(e) => {
												e.preventDefault();
												if (currentPage > 1) setCurrentPage(currentPage - 1);
											}}
											className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
										/>
									</PaginationItem>
									<PaginationItem>
										<PaginationLink isActive size="default" href="#">{pagination.page}</PaginationLink>
									</PaginationItem>
									{pagination.totalPages > 1 && (
										<PaginationItem>
											<PaginationLink
												size="default"
												href="#"
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
											size="default"
											href="#"
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
				title="Tambah Tagihan Karyawan"
				description="Buat tagihan baru untuk karyawan"
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

					<Field data-invalid={!!form.formState.errors.employeeId}>
						<FieldLabel>Pilih Karyawan *</FieldLabel>
						<Controller
							control={form.control}
							name="employeeId"
							render={({ field }) => (
								<SearchableSelect
									options={filteredEmployees.map(
										(e: { id: string; nip: string; nama: string; jabatan: string }) => ({
											value: e.id,
											label: e.nip,
											subLabel: `${e.nama} (${e.jabatan})`,
										}),
									)}
									value={field.value}
									onChange={(val) => {
										field.onChange(val);
										setEmployeeSearch("");
									}}
									placeholder="Cari nama atau NIP karyawan..."
								/>
							)}
						/>
						<FieldError
							errors={
								form.formState.errors.employeeId
									? [{ message: form.formState.errors.employeeId.message }]
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
									{EMPLOYEE_FEE_TYPES.map((j) => (
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

					<Field data-invalid={!!form.formState.errors.tanggalJatuhTempo}>
						<FieldLabel>Tanggal Jatuh Tempo *</FieldLabel>
						<Controller
							control={form.control}
							name="tanggalJatuhTempo"
							render={({ field }) => (
								<Input
									type="date"
									{...field}
									aria-invalid={!!form.formState.errors.tanggalJatuhTempo}
								/>
							)}
						/>
						<FieldError
							errors={
								form.formState.errors.tanggalJatuhTempo
									? [{ message: form.formState.errors.tanggalJatuhTempo.message }]
									: []
							}
						/>
					</Field>

					<Field data-invalid={!!form.formState.errors.keterangan}>
						<FieldLabel>Keterangan (Opsional)</FieldLabel>
						<Controller
							control={form.control}
							name="keterangan"
							render={({ field }) => (
								<Input {...field} placeholder="Contoh: Gaji Bulan Maret" />
							)}
						/>
					</Field>

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
				description={`Bayar tagihan ${selectedBillingForPay?.jenisBiaya ?? ""} untuk ${selectedBillingForPay?.employee?.nama ?? ""}`}
				className="max-w-sm"
			>
				{selectedBillingForPay && (
					<div className="space-y-4">
						<div className="rounded-lg bg-slate-50 p-4 space-y-2">
							<p className="text-sm text-slate-600">
								<span className="font-medium">Karyawan:</span>{" "}
								{selectedBillingForPay.employee.nama}
							</p>
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

			{/* Bulk Pay Dialog */}
			<BulkPayDialog
				open={isBulkPayOpen}
				onOpenChange={setIsBulkPayOpen}
				title="Bayar Beberapa Tagihan"
				description={selectedGroupForBulkPay ? `${selectedGroupForBulkPay.employee?.nama} - ${selectedGroupForBulkPay.label}` : ""}
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
