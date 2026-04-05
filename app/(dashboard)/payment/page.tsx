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
	AlertCircle,
	CheckCircle,
	Clock,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatMonthYear } from "@/lib/utils/utils-date";
import { useDebounce } from "@/hooks/use-debounce";
import * as Dialog from "@radix-ui/react-dialog";

interface Student {
	id: string;
	nis: string;
	nama: string;
	kelas: string;
	totalTagihan: number;
	totalBayar: number;
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
	isOverdue: boolean;
	createdAt: string;
}

interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

interface Summary {
	totalUnpaid: number;
	totalOverdue: number;
}

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
	const [isLoading, setIsLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "Belum Lunas" | "Lunas"
	>("Belum Lunas");
	const [overdueFilter, setOverdueFilter] = useState(false);

	// Dialog States
	const [isPaymentOpen, setIsPaymentOpen] = useState(false);
	const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
	const [paymentForm, setPaymentForm] = useState({
		jumlahBayar: "",
		tanggalBayar: new Date().toISOString().split("T")[0],
		catatan: "",
	});
	const [paymentError, setPaymentError] = useState("");
	const [isProcessingPayment, setIsProcessingPayment] = useState(false);

	// Debounce search
	const debouncedSearchTerm = useDebounce(searchTerm, 300);

	// Fetch billings
	const fetchBillings = useCallback(async () => {
		setIsLoading(true);
		try {
			const params = new URLSearchParams();
			params.append("page", pagination.page.toString());
			params.append("limit", pagination.limit.toString());
			params.append("statusBayar", statusFilter);
			if (overdueFilter) params.append("overdue", "true");
			if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);

			const res = await fetch(`/api/payment/manual?${params.toString()}`);
			const result = await res.json();

			if (!result.success) {
				toast.error(result.error?.message || "Gagal memuat data tagihan");
				setIsLoading(false);
				return;
			}

			setBillings(result.data);
			setSummary(result.meta.summary || { totalUnpaid: 0, totalOverdue: 0 });
			if (result.meta.pagination) {
				setPagination((prev) => ({ ...prev, ...result.meta.pagination }));
			}
		} catch (error) {
			console.error("Error fetching billings:", error);
			toast.error("Terjadi kesalahan saat memuat data tagihan");
		} finally {
			setIsLoading(false);
		}
	}, [
		pagination.page,
		pagination.limit,
		statusFilter,
		overdueFilter,
		debouncedSearchTerm,
	]);

	useEffect(() => {
		if (isAdmin) {
			fetchBillings();
		}
	}, [fetchBillings, isAdmin]);

	// Handle payment
	const handlePayment = async () => {
		if (!selectedBilling) return;

		setPaymentError("");
		setIsProcessingPayment(true);

		try {
			const amount = parseFloat(paymentForm.jumlahBayar.replace(/[^0-9]/g, ""));

			if (isNaN(amount) || amount <= 0) {
				setPaymentError("Jumlah pembayaran harus lebih dari 0");
				return;
			}

			if (amount > selectedBilling.jumlah) {
				setPaymentError("Jumlah pembayaran tidak boleh melebihi tagihan");
				return;
			}

			const res = await fetch("/api/payment/manual", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					billingId: selectedBilling.id,
					jumlahBayar: amount,
					tanggalBayar: paymentForm.tanggalBayar,
					catatan: paymentForm.catatan || undefined,
				}),
			});

			const result = await res.json();

			if (!result.success) {
				setPaymentError(result.error?.message || "Terjadi kesalahan");
				return;
			}

			// Close dialog and refresh
			setIsPaymentOpen(false);
			setSelectedBilling(null);
			setPaymentForm({
				jumlahBayar: "",
				tanggalBayar: new Date().toISOString().split("T")[0],
				catatan: "",
			});
			fetchBillings();

			// Show success message
			toast.success(result.message || "Pembayaran berhasil!");
		} catch (error) {
			console.error("Payment error:", error);
			setPaymentError("Terjadi kesalahan saat memproses pembayaran");
		} finally {
			setIsProcessingPayment(false);
		}
	};

	// Open payment dialog with selected billing
	const openPaymentDialog = (billing: Billing) => {
		setSelectedBilling(billing);
		setPaymentForm({
			jumlahBayar: billing.jumlah.toString(),
			tanggalBayar: new Date().toISOString().split("T")[0],
			catatan: "",
		});
		setPaymentError("");
		setIsPaymentOpen(true);
	};

	// Calculate average billing amount - memoized for performance
	const averageBilling = useMemo(
		() =>
			billings.length > 0
				? billings.reduce((sum, b) => sum + b.jumlah, 0) / billings.length
				: 0,
		[billings],
	);

	// Get status badge color
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
				<CardContent>
					{isLoading ? (
						<div className="text-center py-8 text-gray-500">Memuat data...</div>
					) : billings.length === 0 ? (
						<div className="text-center py-8 text-gray-500">
							Tidak ada tagihan
						</div>
					) : (
						<>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Siswa</TableHead>
											<TableHead>Jenis Biaya</TableHead>
											<TableHead>Periode</TableHead>
											<TableHead className="text-right">Jumlah</TableHead>
											<TableHead>Status</TableHead>
											<TableHead className="text-center">Aksi</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{billings.map((billing) => (
											<TableRow key={billing.id}>
												<TableCell>
													<div>
														<div className="font-medium">
															{billing.student.nama}
														</div>
														<div className="text-sm text-gray-500">
															NIS: {billing.student.nis}
														</div>
														<div className="text-xs text-gray-400">
															{billing.student.kelas}
														</div>
													</div>
												</TableCell>
												<TableCell>{billing.jenisBiaya}</TableCell>
												<TableCell>
{billing.periodeBulan
												? formatMonthYear(new Date(billing.periodeBulan + "-01"))
												: "-"}
												</TableCell>
												<TableCell className="text-right">
													{formatRupiah(billing.jumlah)}
												</TableCell>
												<TableCell>{getStatusBadge(billing)}</TableCell>
												<TableCell className="text-center">
													{billing.statusBayar !== "Lunas" && (
														<Button
															size="sm"
															onClick={() => openPaymentDialog(billing)}
															className="bg-green-600 hover:bg-green-700"
														>
															<Plus className="w-4 h-4 mr-1" />
															Bayar
														</Button>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between mt-4">
								<div className="text-sm text-gray-500">
									Halaman {pagination.page} dari {pagination.totalPages} (
									{pagination.total} total)
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											setPagination((prev) => ({
												...prev,
												page: prev.page - 1,
											}))
										}
										disabled={pagination.page <= 1}
									>
										<ChevronLeft className="w-4 h-4" />
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											setPagination((prev) => ({
												...prev,
												page: prev.page + 1,
											}))
										}
										disabled={pagination.page >= pagination.totalPages}
									>
										<ChevronRight className="w-4 h-4" />
									</Button>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* Payment Dialog */}
			<Dialog.Root open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 bg-black/50" />
					<Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
						<Dialog.Title className="text-lg font-semibold mb-4">
							Input Pembayaran Manual
						</Dialog.Title>

						{selectedBilling && (
							<div className="space-y-4">
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
								<div>
									<Label htmlFor="jumlahBayar">Jumlah Pembayaran</Label>
									<Input
										id="jumlahBayar"
										type="text"
										value={paymentForm.jumlahBayar}
										onChange={(e) => {
											const value = e.target.value.replace(/[^0-9]/g, "");
											setPaymentForm((prev) => ({
												...prev,
												jumlahBayar: value
													? formatRupiah(parseInt(value))
													: "",
											}));
										}}
										placeholder="0"
									/>
								</div>

								<div>
									<Label htmlFor="tanggalBayar">Tanggal Pembayaran</Label>
									<Input
										id="tanggalBayar"
										type="date"
										value={paymentForm.tanggalBayar}
										onChange={(e) =>
											setPaymentForm((prev) => ({
												...prev,
												tanggalBayar: e.target.value,
											}))
										}
									/>
								</div>

								<div>
									<Label htmlFor="catatan">Catatan (Opsional)</Label>
									<Input
										id="catatan"
										value={paymentForm.catatan}
										onChange={(e) =>
											setPaymentForm((prev) => ({
												...prev,
												catatan: e.target.value,
											}))
										}
										placeholder="Catatan pembayaran..."
									/>
								</div>

								{paymentError && (
									<div className="text-red-500 text-sm">{paymentError}</div>
								)}

								<div className="flex gap-2 justify-end">
									<Button
										variant="outline"
										onClick={() => setIsPaymentOpen(false)}
									>
										Batal
									</Button>
									<Button
										onClick={handlePayment}
										disabled={isProcessingPayment || !paymentForm.jumlahBayar}
										className="bg-green-600 hover:bg-green-700"
									>
										{isProcessingPayment ? "Memproses..." : "Simpan Pembayaran"}
									</Button>
								</div>
							</div>
						)}
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
