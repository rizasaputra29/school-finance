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
	ChevronLeft,
	ChevronRight,
	Wallet,
	ArrowLeft,
	CheckCircle,
	Clock,
	Plus,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import * as Dialog from "@radix-ui/react-dialog";
import type { EmployeeMinimal as Employee, PayrollRecord } from "@/types/employee";
import type { Pagination } from "@/types/pagination";

const JENIS_OPTIONS = ["Gaji", "Tunjangan", "Bonus"];

export default function PayrollPage() {
	const { isAdmin } = useAuth();
	const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [summary, setSummary] = useState({
		totalJumlah: 0,
		belumBayar: 0,
		lunas: 0,
	});
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
	});
	const [loading, setLoading] = useState(true);
	const [periodeFilter, setPeriodeFilter] = useState(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	});

	// Dialog
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [form, setForm] = useState({
		employeeId: "",
		periode: periodeFilter,
		jenisPembayaran: "Gaji",
		jumlah: "",
		keterangan: "",
		source: "kas" as "kas" | "bank",
	});
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			// Fetch payrolls and employees in parallel
			const params = new URLSearchParams({
				page: String(pagination.page),
				limit: "10",
				...(periodeFilter && { periode: periodeFilter }),
			});

			const [payrollRes, employeesRes] = await Promise.all([
				fetch(`/api/karyawan/payroll?${params}`),
				fetch("/api/karyawan?limit=100&status=Active"),
			]);

			const payrollResult = await payrollRes.json();
			if (!payrollResult.success) {
				toast.error(
					payrollResult.error?.message || "Gagal memuat data payroll",
				);
			} else {
				setPayrolls(payrollResult.data);
				setSummary(payrollResult.meta.summary);
				setPagination(payrollResult.meta.pagination);
			}

			const employeesResult = await employeesRes.json();
			if (!employeesResult.success) {
				toast.error(
					employeesResult.error?.message || "Gagal memuat data karyawan",
				);
			} else {
				setEmployees(employeesResult.data);
			}
		} catch {
			toast.error("Terjadi kesalahan saat memuat data");
		} finally {
			setLoading(false);
		}
	}, [pagination.page, periodeFilter]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Helper to get default jumlah based on employee and payment type
	const getDefaultJumlah = useCallback(
		(employeeId: string, jenisPembayaran: string) => {
			if (jenisPembayaran === "Gaji" && employeeId) {
				const emp = employees.find((e) => e.id === employeeId);
				if (emp && (emp.gajiPokok ?? 0) > 0) {
					return String(emp.gajiPokok);
				}
			}
			return "";
		},
		[employees],
	);

	// Auto-fill jumlah when employee selected for Gaji - using derived state pattern
	const handleEmployeeChange = (employeeId: string) => {
		const defaultJumlah = getDefaultJumlah(employeeId, form.jenisPembayaran);
		setForm((f) => ({
			...f,
			employeeId,
			jumlah: defaultJumlah || f.jumlah,
		}));
	};

	const handleJenisPembayaranChange = (jenisPembayaran: string) => {
		const defaultJumlah = getDefaultJumlah(form.employeeId, jenisPembayaran);
		setForm((f) => ({
			...f,
			jenisPembayaran,
			jumlah: defaultJumlah || f.jumlah,
		}));
	};

	const handlePayment = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSuccess("");
		try {
			const res = await fetch("/api/karyawan/payroll", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					jumlah: parseFloat(form.jumlah) || 0,
				}),
			});
			const result = await res.json();
			if (!result.success) {
				setError(result.error?.message || "Gagal menyimpan");
				return;
			}
			setSuccess(result.message || "Pembayaran berhasil");
			setIsCreateOpen(false);
			setForm((f) => ({ ...f, employeeId: "", jumlah: "", keterangan: "" }));
			fetchData();
			toast.success("Pembayaran gaji berhasil");
		} catch {
			setError("Terjadi kesalahan");
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div className="flex items-center gap-3">
					<Link href="/karyawan">
						<button className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-gray-50">
							<ArrowLeft className="h-4 w-4" />
						</button>
					</Link>
					<div>
						<h1 className="text-2xl font-bold text-gray-900">
							Gaji & Tunjangan
						</h1>
						<p className="text-sm text-gray-500 mt-1">
							Pembayaran gaji, tunjangan, dan bonus karyawan
						</p>
					</div>
				</div>
				{isAdmin && (
					<Dialog.Root
						open={isCreateOpen}
						onOpenChange={(o) => {
							setIsCreateOpen(o);
							if (o) {
								setError("");
								setSuccess("");
								setForm((f) => ({
									...f,
									employeeId: "",
									jumlah: "",
									keterangan: "",
									periode: periodeFilter,
								}));
							}
						}}
					>
						<Dialog.Trigger asChild>
							<Button className="bg-[#059DEA] hover:bg-[#0480c4] text-white gap-2">
								<Plus className="h-4 w-4" /> Bayar Gaji
							</Button>
						</Dialog.Trigger>
						<Dialog.Portal>
							<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
							<Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-6 w-full max-w-md z-50">
								<Dialog.Title className="text-lg font-semibold mb-4">
									Pembayaran Gaji/Tunjangan
								</Dialog.Title>
								<form onSubmit={handlePayment} className="space-y-4">
									{error && (
										<div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
											{error}
										</div>
									)}
									<div>
										<label className="text-sm font-medium text-gray-700 mb-1 block">
											Karyawan *
										</label>
										<select
											className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
											value={form.employeeId}
											onChange={(e) => handleEmployeeChange(e.target.value)}
											required
										>
											<option value="">Pilih Karyawan</option>
											{employees.map((emp) => (
												<option key={emp.id} value={emp.id}>
													{emp.nama} ({emp.nip}) - {emp.jabatan}
												</option>
											))}
										</select>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Periode *
											</label>
											<Input
												type="month"
												value={form.periode}
												onChange={(e) =>
													setForm({ ...form, periode: e.target.value })
												}
												required
											/>
										</div>
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Jenis *
											</label>
											<select
												className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
												value={form.jenisPembayaran}
												onChange={(e) =>
													handleJenisPembayaranChange(e.target.value)
												}
											>
												{JENIS_OPTIONS.map((j) => (
													<option key={j} value={j}>
														{j}
													</option>
												))}
											</select>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Jumlah (Rp) *
											</label>
											<Input
												type="number"
												value={form.jumlah}
												onChange={(e) =>
													setForm({ ...form, jumlah: e.target.value })
												}
												required
												min="1"
											/>
										</div>
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Sumber Dana
											</label>
											<select
												className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
												value={form.source}
												onChange={(e) =>
													setForm({
														...form,
														source: e.target.value as "kas" | "bank",
													})
												}
											>
												<option value="kas">Kas</option>
												<option value="bank">Bank</option>
											</select>
										</div>
									</div>
									<div>
										<label className="text-sm font-medium text-gray-700 mb-1 block">
											Keterangan
										</label>
										<Input
											value={form.keterangan}
											onChange={(e) =>
												setForm({ ...form, keterangan: e.target.value })
											}
											placeholder="Opsional"
										/>
									</div>
									<div className="flex justify-end gap-2 pt-2">
										<Button
											type="submit"
											className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
										>
											Bayar
										</Button>
									</div>
								</form>
							</Dialog.Content>
						</Dialog.Portal>
					</Dialog.Root>
				)}
			</div>

			{success && (
				<div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">
					{success}
				</div>
			)}

			{/* Summary */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<Card className="border-0 shadow-sm bg-linear-to-br from-blue-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Total Pengeluaran
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Wallet className="h-5 w-5 text-blue-500" />
							<span className="text-xl font-bold text-gray-900">
								{formatRupiah(summary.totalJumlah)}
							</span>
						</div>
					</CardContent>
				</Card>
				<Card className="border-0 shadow-sm bg-linear-to-br from-green-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Lunas
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<CheckCircle className="h-5 w-5 text-green-500" />
							<span className="text-2xl font-bold text-gray-900">
								{summary.lunas}
							</span>
						</div>
					</CardContent>
				</Card>
				<Card className="border-0 shadow-sm bg-linear-to-br from-amber-50 to-white">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-gray-600">
							Belum Bayar
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<Clock className="h-5 w-5 text-amber-500" />
							<span className="text-2xl font-bold text-gray-900">
								{summary.belumBayar}
							</span>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filter */}
			<div className="flex items-center gap-3">
				<label className="text-sm font-medium text-gray-600">Periode:</label>
				<Input
					type="month"
					value={periodeFilter}
					onChange={(e) => setPeriodeFilter(e.target.value)}
					className="max-w-[180px]"
				/>
			</div>

			{/* Table */}
			<Card className="border-0 shadow-sm">
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="bg-gray-50">
									<TableHead className="font-semibold">Karyawan</TableHead>
									<TableHead className="font-semibold">Jabatan</TableHead>
									<TableHead className="font-semibold">Jenis</TableHead>
									<TableHead className="font-semibold">Periode</TableHead>
									<TableHead className="font-semibold text-right">
										Jumlah
									</TableHead>
									<TableHead className="font-semibold">Status</TableHead>
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
								) : payrolls.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center py-8 text-gray-500"
										>
											Belum ada data pembayaran
										</TableCell>
									</TableRow>
								) : (
									payrolls.map((p) => (
										<TableRow key={p.id} className="hover:bg-gray-50">
											<TableCell>
												<div>
													<div className="font-medium">{p.employee.nama}</div>
													<div className="text-xs text-gray-500">
														{p.employee.nip}
													</div>
												</div>
											</TableCell>
											<TableCell>{p.employee.jabatan}</TableCell>
											<TableCell>
												<span
													className={`px-2 py-1 text-xs font-medium rounded-full ${
														p.jenisPembayaran === "Gaji"
															? "bg-blue-100 text-blue-700"
															: p.jenisPembayaran === "Tunjangan"
																? "bg-purple-100 text-purple-700"
																: "bg-amber-100 text-amber-700"
													}`}
												>
													{p.jenisPembayaran}
												</span>
											</TableCell>
											<TableCell>{p.periode}</TableCell>
											<TableCell className="text-right font-medium">
												{formatRupiah(p.jumlah ?? 0)}
											</TableCell>
											<TableCell>
												<span
													className={`px-2 py-1 text-xs font-medium rounded-full ${p.status === "Lunas" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
												>
													{p.status}
												</span>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{pagination.totalPages > 1 && (
						<div className="flex items-center justify-between px-4 py-3 border-t">
							<span className="text-sm text-gray-500">
								Halaman {pagination.page} dari {pagination.totalPages}
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
		</div>
	);
}
