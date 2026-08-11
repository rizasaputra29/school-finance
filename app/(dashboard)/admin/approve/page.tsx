"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
	CheckCircle,
	XCircle,
	Eye,
	Clock,
	TrendingUp,
	TrendingDown,
} from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";
import type { Cashflow } from "@/types/cashflow";
import type { AccountMinimal as Account } from "@/types/account";

export default function ApprovePage() {
	const { isAdmin } = useAuth();
	const [selectedCashflow, setSelectedCashflow] = useState<Cashflow | null>(
		null,
	);
	const [isViewOpen, setIsViewOpen] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const queryClient = useQueryClient();

	const { data: cashflowData, isLoading: cashflowLoading } = useQuery({
		queryKey: ["draft-cashflows"],
		queryFn: async () => {
			const res = await fetch("/api/cashflow?status=draft");
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data transaksi");
			return result.data as Cashflow[];
		},
	});

	const { data: accountsData, isLoading: accountsLoading } = useQuery({
		queryKey: ["accounts"],
		queryFn: async () => {
			const res = await fetch("/api/accounts");
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data akun");
			return result.data as Account[];
		},
	});

	const cashflows = cashflowData ?? [];
	const isLoading = cashflowLoading || accountsLoading;
	const accounts = useMemo(() => {
		const accMap: Record<string, string> = {};
		if (accountsData) {
			accountsData.forEach((acc) => {
				accMap[acc.kodeAkun] = acc.namaAkun;
			});
		}
		return accMap;
	}, [accountsData]);

	const handleApprove = async (id: string) => {
		try {
			const res = await fetch(`/api/cashflow/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "posted" }),
			});

			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal menyetujui transaksi");
				return;
			}

			toast.success("Transaksi berhasil disetujui!");
			queryClient.invalidateQueries({ queryKey: ["draft-cashflows"] });
		} catch (error) {
			console.error("Failed to approve:", error);
			toast.error("Terjadi kesalahan");
		}
	};

	const handleReject = async (id: string) => {
		if (!confirm("Apakah Anda yakin ingin menolak transaksi ini?")) return;

		try {
			const res = await fetch(`/api/cashflow/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "rejected" }),
			});

			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal menolak transaksi");
				return;
			}

			toast.success("Transaksi berhasil ditolak!");
			queryClient.invalidateQueries({ queryKey: ["draft-cashflows"] });
		} catch (error) {
			console.error("Failed to reject:", error);
			toast.error("Terjadi kesalahan");
		}
	};

	const viewDetails = (cf: Cashflow) => {
		setSelectedCashflow(cf);
		setIsViewOpen(true);
	};

	const toggleSelect = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleSelectAll = () => {
		if (selectedIds.size === cashflows.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(cashflows.map((cf) => cf.id)));
		}
	};

	const handleBatchApprove = async () => {
		if (selectedIds.size === 0) return;
		const ids = Array.from(selectedIds);
		try {
			const results = await Promise.allSettled(
				ids.map((id) =>
					fetch(`/api/cashflow/${id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ status: "posted" }),
					}).then((res) => res.json()),
				),
			);
			const succeeded = results.filter(
				(r) => r.status === "fulfilled" && r.value.success,
			).length;
			const failed = ids.length - succeeded;
			if (succeeded > 0)
				toast.success(`${succeeded} transaksi berhasil disetujui`);
			if (failed > 0) toast.error(`${failed} transaksi gagal disetujui`);
			setSelectedIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["draft-cashflows"] });
		} catch {
			toast.error("Terjadi kesalahan");
		}
	};

	const handleBatchReject = async () => {
		if (selectedIds.size === 0) return;
		if (!confirm(`Tolak ${selectedIds.size} transaksi yang dipilih?`)) return;
		const ids = Array.from(selectedIds);
		try {
			const results = await Promise.allSettled(
				ids.map((id) =>
					fetch(`/api/cashflow/${id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ status: "rejected" }),
					}).then((res) => res.json()),
				),
			);
			const succeeded = results.filter(
				(r) => r.status === "fulfilled" && r.value.success,
			).length;
			const failed = ids.length - succeeded;
			if (succeeded > 0)
				toast.success(`${succeeded} transaksi berhasil ditolak`);
			if (failed > 0) toast.error(`${failed} transaksi gagal ditolak`);
			setSelectedIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["draft-cashflows"] });
		} catch {
			toast.error("Terjadi kesalahan");
		}
	};

	// Compute derived values before conditional returns
	const { totalDebit, totalKredit } = useMemo(
		() => ({
			totalDebit: cashflows.reduce((sum, cf) => sum + cf.debit, 0),
			totalKredit: cashflows.reduce((sum, cf) => sum + cf.kredit, 0),
		}),
		[cashflows],
	);

	if (!isAdmin) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-gray-900">Akses Ditolak</h2>
					<p className="text-gray-500 mt-2">Halaman ini hanya untuk admin.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Clock className="h-6 w-6 text-gray-700" />
				<h1 className="text-xl md:text-2xl font-bold text-gray-900">
					Persetujuan Transaksi
				</h1>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card className="bg-blue-50 border-blue-200">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
								<Clock className="h-5 w-5 text-blue-600" />
							</div>
							<div>
								<p className="text-sm text-blue-600 font-medium">
									Menunggu Persetujuan
								</p>
								<p className="text-2xl font-bold text-blue-900">
									{cashflows.length}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-emerald-50 border-emerald-200">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
								<TrendingUp className="h-5 w-5 text-emerald-600" />
							</div>
							<div>
								<p className="text-sm text-emerald-600 font-medium">
									Total Pemasukan
								</p>
								<p className="text-2xl font-bold text-emerald-900">
									{formatRupiah(totalDebit)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="bg-red-50 border-red-200">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
								<TrendingDown className="h-5 w-5 text-red-600" />
							</div>
							<div>
								<p className="text-sm text-red-600 font-medium">
									Total Pengeluaran
								</p>
								<p className="text-2xl font-bold text-red-900">
									{formatRupiah(totalKredit)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Pending Transactions List */}
			<Card>
				<CardHeader className="border-b">
					<CardTitle className="text-lg">
						Daftar Transaksi Menunggu Persetujuan
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="flex h-48 items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
						</div>
					) : cashflows.length === 0 ? (
						<div className="flex h-48 flex-col items-center justify-center text-gray-500">
							<CheckCircle className="h-12 w-12 text-green-500 mb-2" />
							<p>Tidak ada transaksi yang menunggu persetujuan</p>
						</div>
					) : (
						<>
							{/* Batch Actions Bar */}
							{selectedIds.size > 0 && (
								<div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b">
									<span className="text-sm text-blue-700 font-medium">
										{selectedIds.size} dipilih
									</span>
									<Button
										size="sm"
										onClick={handleBatchApprove}
										className="bg-green-600 hover:bg-green-700 text-white"
									>
										<CheckCircle className="h-4 w-4 mr-1" />
										Setujui Semua
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={handleBatchReject}
										className="text-red-600 border-red-300 hover:bg-red-50"
									>
										<XCircle className="h-4 w-4 mr-1" />
										Tolak Semua
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setSelectedIds(new Set())}
									>
										Batal
									</Button>
								</div>
							)}
							<Table>
								<TableHeader>
									<TableRow className="bg-gray-50/50">
										<TableHead className="w-10">
											<input
												type="checkbox"
												checked={selectedIds.size === cashflows.length}
												onChange={toggleSelectAll}
												className="h-4 w-4 rounded border-gray-300"
											/>
										</TableHead>
										<TableHead className="font-semibold">Tanggal</TableHead>
									<TableHead className="font-semibold">Keterangan</TableHead>
									<TableHead className="font-semibold">Akun</TableHead>
									<TableHead className="font-semibold text-right">
										Debet
									</TableHead>
									<TableHead className="font-semibold text-right">
										Kredit
									</TableHead>
									<TableHead className="font-semibold text-center">
										Aksi
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{cashflows.map((cf) => (
									<TableRow key={cf.id} className="hover:bg-slate-50/50">
										<TableCell>
											<input
												type="checkbox"
												checked={selectedIds.has(cf.id)}
												onChange={() => toggleSelect(cf.id)}
												className="h-4 w-4 rounded border-gray-300"
											/>
										</TableCell>
										<TableCell className="text-gray-600">
											{formatShortDate(cf.tanggal)}
										</TableCell>
										<TableCell className="text-gray-800 font-medium max-w-xs truncate">
											{cf.keterangan}
										</TableCell>
										<TableCell className="text-gray-600">
											<span className="font-mono text-sm">{cf.kodeAkun}</span>
											<span className="text-gray-400 ml-1">
												- {accounts[cf.kodeAkun] || ""}
											</span>
										</TableCell>
										<TableCell className="text-emerald-600 text-right font-mono">
											{cf.debit > 0 ? formatRupiah(cf.debit) : "-"}
										</TableCell>
										<TableCell className="text-red-600 text-right font-mono">
											{cf.kredit > 0 ? formatRupiah(cf.kredit) : "-"}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-center gap-2">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => viewDetails(cf)}
													title="Lihat Detail"
												>
													<Eye className="h-4 w-4 text-gray-500" />
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => handleApprove(cf.id)}
													title="Setuju"
													className="text-green-600 hover:text-green-700"
												>
													<CheckCircle className="h-4 w-4" />
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => handleReject(cf.id)}
													title="Tolak"
													className="text-red-600 hover:text-red-700"
												>
													<XCircle className="h-4 w-4" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						</>
					)}
				</CardContent>
			</Card>

			{/* Detail Dialog */}
			{isViewOpen && selectedCashflow && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-semibold">Detail Transaksi</h3>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsViewOpen(false)}
							>
								<XCircle className="h-5 w-5" />
							</Button>
						</div>

						<div className="space-y-4">
							<div>
								<p className="text-sm text-gray-500">Tanggal</p>
								<p className="font-medium">
									{formatShortDate(selectedCashflow.tanggal)}
								</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Keterangan</p>
								<p className="font-medium">{selectedCashflow.keterangan}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Akun</p>
								<p className="font-medium font-mono">
									{selectedCashflow.kodeAkun} -{" "}
									{accounts[selectedCashflow.kodeAkun] || ""}
								</p>
							</div>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm text-gray-500">Debet</p>
									<p className="font-medium text-emerald-600">
										{selectedCashflow.debit > 0
											? formatRupiah(selectedCashflow.debit)
											: "-"}
									</p>
								</div>
								<div>
									<p className="text-sm text-gray-500">Kredit</p>
									<p className="font-medium text-red-600">
										{selectedCashflow.kredit > 0
											? formatRupiah(selectedCashflow.kredit)
											: "-"}
									</p>
								</div>
							</div>
							<div>
								<p className="text-sm text-gray-500">Status</p>
								<Badge variant="secondary" className="mt-1">
									{selectedCashflow.status === "draft"
										? "Menunggu"
										: selectedCashflow.status}
								</Badge>
							</div>
						</div>

						<div className="flex gap-3 mt-6">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => handleReject(selectedCashflow.id)}
							>
								<XCircle className="mr-2 h-4 w-4" />
								Tolak
							</Button>
							<Button
								className="flex-1 bg-green-600 hover:bg-green-700"
								onClick={() => handleApprove(selectedCashflow.id)}
							>
								<CheckCircle className="mr-2 h-4 w-4" />
								Setuju
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
