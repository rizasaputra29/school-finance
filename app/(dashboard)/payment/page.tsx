"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Search,
	AlertCircle,
	CheckCircle,
	Clock,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useDebounce } from "use-debounce";
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
import type { Billing } from "@/types/billing";
import type { Pagination } from "@/types/pagination";
import type { PaymentSummary as Summary } from "@/types/summary";

const paymentFormSchema = z.object({
	jumlahBayar: z
		.string()
		.min(1, "Jumlah pembayaran wajib diisi"),
	tanggalBayar: z.string().min(1, "Tanggal pembayaran wajib diisi"),
	catatan: z.string().optional(),
	metodeBayar: z.enum(["Cash", "Bank", "Transfer"]),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export default function PaymentPage() {
	const { isAdmin } = useAuth();
	const [billings, setBillings] = useState<Billing[]>([]);

	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	});
	const [summary, setSummary] = useState<Summary>({
		totalUnpaid: 0,
		totalOverdue: 0,
	});
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "Belum Lunas" | "Lunas"
	>("Belum Lunas");
	const [overdueFilter, setOverdueFilter] = useState(false);

	const [isPaymentOpen, setIsPaymentOpen] = useState(false);
	const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);

	const [debouncedSearchTerm] = useDebounce(searchTerm, 300);

	const queryClient = useQueryClient();

	const paymentForm = useForm<PaymentFormValues>({
		resolver: zodResolver(paymentFormSchema),
		defaultValues: {
			jumlahBayar: "",
			tanggalBayar: new Date().toISOString().split("T")[0],
			catatan: "",
			metodeBayar: "Cash",
		},
		mode: "onChange",
	});

	const { isLoading } = useQuery<Billing[]>({
		queryKey: ["payments", pagination.page, pagination.limit, statusFilter, overdueFilter, debouncedSearchTerm],
		queryFn: async () => {
			const params = new URLSearchParams();
			params.append("page", pagination.page.toString());
			params.append("limit", pagination.limit.toString());
			params.append("statusBayar", statusFilter);
			if (overdueFilter) params.append("overdue", "true");
			if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);

			const res = await fetch(`/api/payment/manual?${params.toString()}`);
			const result = await res.json();

			if (!result.success) {
				throw new Error(result.error?.message || "Gagal memuat data tagihan");
			}

			setBillings(result.data);
			setSummary(result.meta.summary || { totalUnpaid: 0, totalOverdue: 0 });
			if (result.meta.pagination) {
				setPagination((prev) => ({ ...prev, ...result.meta.pagination }));
			}
			return result.data;
		},
		enabled: isAdmin,
	});

	const paymentMutation = useMutation({
		mutationFn: async (data: { billingId: string; jumlahBayar: number; tanggalBayar: string; catatan?: string; metodeBayar: string }) => {
			const res = await fetch("/api/payment/manual", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			const result = await res.json();
			if (!result.success) {
				throw new Error(result.error?.message || "Terjadi kesalahan");
			}
			return result;
		},
		onSuccess: (result) => {
			setIsPaymentOpen(false);
			setSelectedBilling(null);
			paymentForm.reset();
			queryClient.invalidateQueries({ queryKey: ["payments"] });
			toast.success(result.message || "Pembayaran berhasil!");
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const openPaymentDialog = (billing: Billing) => {
		setSelectedBilling(billing);
		paymentForm.reset({
			jumlahBayar: billing.jumlah.toString(),
			tanggalBayar: new Date().toISOString().split("T")[0],
			catatan: "",
			metodeBayar: "Cash",
		});
		setIsPaymentOpen(true);
	};

	const handlePayment = paymentForm.handleSubmit((data) => {
		if (!selectedBilling) return;

		const amount = parseFloat(data.jumlahBayar.replace(/[^0-9]/g, ""));

		if (isNaN(amount) || amount <= 0) {
			paymentForm.setError("jumlahBayar", {
				message: "Jumlah pembayaran harus lebih dari 0",
			});
			return;
		}

		if (amount > selectedBilling.jumlah) {
			paymentForm.setError("jumlahBayar", {
				message: "Jumlah pembayaran tidak boleh melebihi tagihan",
			});
			return;
		}

		paymentMutation.mutate({
			billingId: selectedBilling.id,
			jumlahBayar: amount,
			tanggalBayar: data.tanggalBayar,
			catatan: data.catatan || undefined,
			metodeBayar: data.metodeBayar,
		});
	});

	const averageBilling = useMemo(
		() =>
			billings.length > 0
				? billings.reduce((sum, b) => sum + b.jumlah, 0) / billings.length
				: 0,
		[billings],
	);

	const getStatusBadge = (billing: Billing) => {
		if (billing.statusBayar === "Lunas") {
			return (
				<Badge className="bg-green-100 text-green-800">
					<CheckCircle className="w-3 h-3 mr-1" />
					Lunas
				</Badge>
			);
		}
		if (billing.isOverdue) {
			return (
				<Badge className="bg-red-100 text-red-800">
					<AlertCircle className="w-3 h-3 mr-1" />
					Jatuh Tempo
				</Badge>
			);
		}
		return (
			<Badge className="bg-yellow-100 text-yellow-800">
				<Clock className="w-3 h-3 mr-1" />
				Belum Lunas
			</Badge>
		);
	};

	const columns: ColumnDef<Billing>[] = [
		{
			accessorKey: "student",
			header: "Siswa",
			cell: ({ row }) => (
				<div>
					<div className="font-medium">{row.original.student.nama}</div>
					<div className="text-sm text-gray-500">
						NIS: {row.original.student.nis}
					</div>
					<div className="text-xs text-gray-400">
						{row.original.student.kelas}
					</div>
				</div>
			),
		},
		{
			accessorKey: "jenisBiaya",
			header: "Jenis Biaya",
		},
		{
			accessorKey: "jumlah",
			header: () => <div className="text-right">Jumlah</div>,
			cell: ({ row }) => (
				<div className="text-right">{formatRupiah(row.original.jumlah)}</div>
			),
		},
		{
			accessorKey: "statusBayar",
			header: "Status",
			cell: ({ row }) => getStatusBadge(row.original),
		},
		{
			id: "actions",
			header: () => <div className="text-center">Aksi</div>,
			cell: ({ row }) => (
				<div className="text-center">
					{row.original.statusBayar !== "Lunas" && (
						<Button
							size="sm"
							onClick={() => openPaymentDialog(row.original)}
							className="bg-green-600 hover:bg-green-700"
						>
							<Plus className="w-4 h-4 mr-1" />
							Bayar
						</Button>
					)}
				</div>
			),
		},
	];

	if (!isAdmin) {
		return (
			<div className="container mx-auto p-4">
				<Card>
					<CardContent className="pt-6">
						<p className="text-center text-gray-500">
							Akses terbatas untuk admin
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto p-4">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-2xl font-bold">Pembayaran Siswa</h1>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<Card>
					<CardContent className="pt-4">
						<div className="text-sm text-gray-500">
							Total Tagihan Belum Lunas
						</div>
						<div className="text-2xl font-bold">{summary.totalUnpaid}</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<div className="text-sm text-gray-500">
							Total Jatuh Tempo (Piutang)
						</div>
						<div className="text-2xl font-bold text-red-600">
							{summary.totalOverdue}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<div className="text-sm text-gray-500">Rata-rata per Tagihan</div>
						<div className="text-2xl font-bold">
							{billings.length > 0 ? formatRupiah(averageBilling) : "-"}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filters */}
			<Card className="mb-6">
				<CardContent className="pt-4">
					<div className="flex flex-wrap gap-4">
						<div className="flex-1 min-w-[200px]">
							<Label htmlFor="search">Cari Siswa</Label>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
								<Input
									id="search"
									placeholder="Nama siswa, NIS, atau jenis biaya..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-10"
								/>
							</div>
						</div>
						<div className="w-[150px]">
							<Label htmlFor="status">Status</Label>
							<select
								id="status"
								value={statusFilter}
								onChange={(e) =>
									setStatusFilter(e.target.value as typeof statusFilter)
								}
								className="w-full p-2 border rounded-md"
							>
								<option value="all">Semua</option>
								<option value="Belum Lunas">Belum Lunas</option>
								<option value="Lunas">Lunas</option>
							</select>
						</div>
						<div className="flex items-end">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={overdueFilter}
									onChange={(e) => setOverdueFilter(e.target.checked)}
									className="w-4 h-4"
								/>
								<span className="text-sm">Hanya Jatuh Tempo</span>
							</label>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Billings Table */}
			<Card>
				<CardHeader>
					<CardTitle>Daftar Tagihan Siswa</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<DataTable
						columns={columns}
						data={billings}
						loading={isLoading}
						emptyMessage="Tidak ada tagihan"
						serverPagination={{
							pageIndex: pagination.page - 1,
							pageSize: pagination.limit,
							total: pagination.total,
							onPaginationChange: (newPagination) => {
								setPagination((prev) => ({
									...prev,
									page: newPagination.pageIndex + 1,
								}));
							},
						}}
					/>
				</CardContent>
			</Card>

			{/* Payment Dialog */}
			<FormDialog
				title="Input Pembayaran Manual"
				open={isPaymentOpen}
				onOpenChange={setIsPaymentOpen}
				form={paymentForm}
			>
				{selectedBilling && (
					<form onSubmit={handlePayment} className="space-y-4">
						{/* Billing Info */}
						<div className="bg-gray-50 p-3 rounded-lg">
							<div className="text-sm text-gray-500">Tagihan</div>
							<div className="font-medium">
								{selectedBilling.jenisBiaya}
							</div>
							<div className="text-sm">
								{selectedBilling.student.nama} -{" "}
								{selectedBilling.student.nis}
							</div>
							<div className="text-lg font-bold mt-2">
								Total Tagihan: {formatRupiah(selectedBilling.jumlah)}
							</div>
							{selectedBilling.isOverdue && (
								<div className="text-sm text-red-600 mt-1 flex items-center">
									<AlertCircle className="w-4 h-4 mr-1" />
									Tagihan Jatuh Tempo
								</div>
							)}
						</div>

						{/* Payment Form */}
						<Controller
							control={paymentForm.control}
							name="metodeBayar"
							render={({ field }) => (
								<Field>
									<FieldLabel htmlFor="metodeBayar">Metode Pembayaran</FieldLabel>
									<select
										{...field}
										id="metodeBayar"
										className="w-full p-2 border rounded-md"
									>
										<option value="Cash">Kas Tunai</option>
										<option value="Bank">Bank</option>
										<option value="Transfer">Transfer</option>
									</select>
								</Field>
							)}
						/>

						<Controller
							control={paymentForm.control}
							name="jumlahBayar"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="jumlahBayar">Jumlah Pembayaran</FieldLabel>
									<Input
										{...field}
										id="jumlahBayar"
										type="text"
										placeholder="0"
										onChange={(e) => {
											const value = e.target.value.replace(/[^0-9]/g, "");
											field.onChange(
												value ? formatRupiah(parseInt(value)) : ""
											);
										}}
										aria-invalid={!!fieldState.error}
									/>
									<FieldError errors={fieldState.error ? [fieldState.error] : []} />
								</Field>
							)}
						/>

						<Controller
							control={paymentForm.control}
							name="tanggalBayar"
							render={({ field, fieldState }) => (
								<Field data-invalid={!!fieldState.error}>
									<FieldLabel htmlFor="tanggalBayar">Tanggal Pembayaran</FieldLabel>
									<Input
										{...field}
										id="tanggalBayar"
										type="date"
										aria-invalid={!!fieldState.error}
									/>
									<FieldError errors={fieldState.error ? [fieldState.error] : []} />
								</Field>
							)}
						/>

						<Controller
							control={paymentForm.control}
							name="catatan"
							render={({ field }) => (
								<Field>
									<FieldLabel htmlFor="catatan">Catatan (Opsional)</FieldLabel>
									<Input
										{...field}
										id="catatan"
										placeholder="Catatan pembayaran..."
									/>
								</Field>
							)}
						/>

						<div className="flex gap-2 justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsPaymentOpen(false)}
							>
								Batal
							</Button>
							<Button
								type="submit"
								disabled={paymentMutation.isPending || !paymentForm.formState.isValid}
								className="bg-green-600 hover:bg-green-700"
							>
								{paymentMutation.isPending ? "Memproses..." : "Simpan Pembayaran"}
							</Button>
						</div>
					</form>
				)}
			</FormDialog>
		</div>
	);
}
