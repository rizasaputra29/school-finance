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
import { Wallet, Building2, ArrowRightLeft, BookOpen } from "lucide-react";
import { formatCurrency } from "@/lib/utils/utils-core";
import * as Dialog from "@radix-ui/react-dialog";

interface Account {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	saldo: number;
}

interface MutasiEntry {
	id: string;
	tanggal: string;
	keterangan: string;
	entries: Array<{
		kodeAkun: string;
		debit: number;
		kredit: number;
		account: { namaAkun: string; kodeAkun: string };
	}>;
}

type TabType = "kas-bank" | "akun";

export default function KeuanganPage() {
	const { isAdmin } = useAuth();
	const [tab, setTab] = useState<TabType>("kas-bank");
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [kasAccount, setKasAccount] = useState<Account | null>(null);
	const [bankAccount, setBankAccount] = useState<Account | null>(null);
	const [mutasiHistory, setMutasiHistory] = useState<MutasiEntry[]>([]);
	const [loading, setLoading] = useState(true);

	// Transfer dialog
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [transferForm, setTransferForm] = useState({
		dari: "102", // Bank to Kas default
		ke: "101",
		jumlah: "",
		keterangan: "",
		tanggal: new Date().toISOString().split("T")[0],
	});
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			const [accRes, mutasiRes] = await Promise.all([
				fetch("/api/accounts"),
				fetch("/api/keuangan/mutasi?limit=20"),
			]);
			const accResult = await accRes.json();
			const mutasiResult = await mutasiRes.json();

			if (!accResult.success) {
				toast.error(accResult.error?.message || "Gagal memuat data akun");
			} else {
				const accs = accResult.data || [];
				setAccounts(Array.isArray(accs) ? accs : []);
				setKasAccount(
					Array.isArray(accs)
						? accs.find((a: Account) => a.kodeAkun === "101") || null
						: null,
				);
				setBankAccount(
					Array.isArray(accs)
						? accs.find((a: Account) => a.kodeAkun === "102") || null
						: null,
				);
			}

			if (!mutasiResult.success) {
				toast.error(mutasiResult.error?.message || "Gagal memuat data mutasi");
			} else {
				setMutasiHistory(mutasiResult.data || []);
			}
		} catch {
			toast.error("Terjadi kesalahan saat memuat data");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleTransfer = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSuccess("");
		try {
			const res = await fetch("/api/keuangan/mutasi", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...transferForm,
					jumlah: parseFloat(transferForm.jumlah) || 0,
				}),
			});
			const result = await res.json();
			if (!result.success) {
				setError(result.error?.message || "Gagal transfer");
				return;
			}
			setSuccess(result.message || "Transfer berhasil");
			setIsTransferOpen(false);
			setTransferForm((f) => ({ ...f, jumlah: "", keterangan: "" }));
			fetchData();
			toast.success("Transfer berhasil");
		} catch {
			setError("Terjadi kesalahan");
		}
	};

	// Group accounts by type for COA tab
	const accountsByType = accounts.reduce<Record<string, Account[]>>(
		(acc, a) => {
			if (!acc[a.tipeAkun]) acc[a.tipeAkun] = [];
			acc[a.tipeAkun].push(a);
			return acc;
		},
		{},
	);

	const typeLabels: Record<string, string> = {
		Asset: "Aset",
		Liability: "Kewajiban",
		Equity: "Modal",
		Revenue: "Pendapatan",
		Expense: "Beban",
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Keuangan</h1>
				<p className="text-sm text-gray-500 mt-1">
					Master data keuangan & manajemen Kas/Bank
				</p>
			</div>

			{success && (
				<div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">
					{success}
				</div>
			)}

			{/* Tabs */}
			<div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
				<button
					onClick={() => setTab("kas-bank")}
					className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === "kas-bank" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
				>
					<span className="flex items-center gap-2">
						<Wallet className="h-4 w-4" /> Kas & Bank
					</span>
				</button>
				<button
					onClick={() => setTab("akun")}
					className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === "akun" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
				>
					<span className="flex items-center gap-2">
						<BookOpen className="h-4 w-4" /> Chart of Accounts
					</span>
				</button>
			</div>

			{tab === "kas-bank" && (
				<>
					{/* Kas & Bank Cards */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Card className="border-0 shadow-sm bg-linear-to-br from-emerald-50 to-white">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
									<Wallet className="h-4 w-4 text-emerald-500" /> Kas (101)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<span className="text-2xl font-bold text-gray-900">
									{kasAccount ? formatCurrency(kasAccount.saldo) : "Rp 0"}
								</span>
							</CardContent>
						</Card>
						<Card className="border-0 shadow-sm bg-linear-to-br from-blue-50 to-white">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
									<Building2 className="h-4 w-4 text-blue-500" /> Bank (102)
								</CardTitle>
							</CardHeader>
							<CardContent>
								<span className="text-2xl font-bold text-gray-900">
									{bankAccount ? formatCurrency(bankAccount.saldo) : "Rp 0"}
								</span>
							</CardContent>
						</Card>
					</div>

					{/* Transfer Button */}
					{isAdmin && (
						<Dialog.Root
							open={isTransferOpen}
							onOpenChange={(o) => {
								setIsTransferOpen(o);
								if (o) {
									setError("");
									setSuccess("");
								}
							}}
						>
							<Dialog.Trigger asChild>
								<Button className="bg-[#059DEA] hover:bg-[#0480c4] text-white gap-2">
									<ArrowRightLeft className="h-4 w-4" /> Transfer Kas ↔ Bank
								</Button>
							</Dialog.Trigger>
							<Dialog.Portal>
								<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
								<Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-6 w-full max-w-md z-50">
									<Dialog.Title className="text-lg font-semibold mb-4">
										Transfer Kas ↔ Bank
									</Dialog.Title>
									<form onSubmit={handleTransfer} className="space-y-4">
										{error && (
											<div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
												{error}
											</div>
										)}
										<div className="grid grid-cols-2 gap-3">
											<div>
												<label className="text-sm font-medium text-gray-700 mb-1 block">
													Dari
												</label>
												<select
													className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
													value={transferForm.dari}
													onChange={(e) =>
														setTransferForm({
															...transferForm,
															dari: e.target.value,
															ke: e.target.value === "101" ? "102" : "101",
														})
													}
												>
													<option value="101">Kas</option>
													<option value="102">Bank</option>
												</select>
											</div>
											<div>
												<label className="text-sm font-medium text-gray-700 mb-1 block">
													Ke
												</label>
												<select
													className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
													value={transferForm.ke}
													onChange={(e) =>
														setTransferForm({
															...transferForm,
															ke: e.target.value,
															dari: e.target.value === "101" ? "102" : "101",
														})
													}
												>
													<option value="101">Kas</option>
													<option value="102">Bank</option>
												</select>
											</div>
										</div>
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Tanggal *
											</label>
											<Input
												type="date"
												value={transferForm.tanggal}
												onChange={(e) =>
													setTransferForm({
														...transferForm,
														tanggal: e.target.value,
													})
												}
												required
											/>
										</div>
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Jumlah (Rp) *
											</label>
											<Input
												type="number"
												value={transferForm.jumlah}
												onChange={(e) =>
													setTransferForm({
														...transferForm,
														jumlah: e.target.value,
													})
												}
												required
												min="1"
												placeholder="0"
											/>
										</div>
										<div>
											<label className="text-sm font-medium text-gray-700 mb-1 block">
												Keterangan
											</label>
											<Input
												value={transferForm.keterangan}
												onChange={(e) =>
													setTransferForm({
														...transferForm,
														keterangan: e.target.value,
													})
												}
												placeholder="Opsional"
											/>
										</div>
										<div className="flex justify-end gap-2 pt-2">
											<Button
												type="submit"
												className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
											>
												Transfer
											</Button>
										</div>
									</form>
								</Dialog.Content>
							</Dialog.Portal>
						</Dialog.Root>
					)}

					{/* Transfer History */}
					<Card className="border-0 shadow-sm">
						<CardHeader>
							<CardTitle className="text-base font-semibold">
								Riwayat Transfer
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow className="bg-gray-50">
											<TableHead className="font-semibold">Tanggal</TableHead>
											<TableHead className="font-semibold">
												Keterangan
											</TableHead>
											<TableHead className="font-semibold text-right">
												Jumlah
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{loading ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-center py-8 text-gray-500"
												>
													Memuat...
												</TableCell>
											</TableRow>
										) : mutasiHistory.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-center py-8 text-gray-500"
												>
													Belum ada riwayat transfer
												</TableCell>
											</TableRow>
										) : (
											mutasiHistory.map((m) => {
												const debitEntry = m.entries.find((e) => e.debit > 0);
												const creditEntry = m.entries.find((e) => e.kredit > 0);
												const amount =
													debitEntry?.debit || creditEntry?.kredit || 0;
												return (
													<TableRow key={m.id} className="hover:bg-gray-50">
														<TableCell className="text-sm">
															{new Date(m.tanggal).toLocaleDateString("id-ID")}
														</TableCell>
														<TableCell>
															<div className="text-sm">{m.keterangan}</div>
															<div className="text-xs text-gray-500">
																{creditEntry?.account.namaAkun} →{" "}
																{debitEntry?.account.namaAkun}
															</div>
														</TableCell>
														<TableCell className="text-right font-medium">
															{formatCurrency(amount)}
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>
				</>
			)}

			{tab === "akun" && (
				<>
					<div className="flex items-center justify-between">
						<p className="text-sm text-gray-500">
							Daftar akun keuangan (Chart of Accounts)
						</p>
						<Link href="/accounts">
							<Button variant="outline" size="sm" className="gap-2">
								<BookOpen className="h-4 w-4" /> Kelola Akun
							</Button>
						</Link>
					</div>
					{["Asset", "Liability", "Equity", "Revenue", "Expense"].map(
						(type) => (
							<Card key={type} className="border-0 shadow-sm">
								<CardHeader className="pb-2">
									<CardTitle className="text-base font-semibold">
										{typeLabels[type] || type}
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									<Table>
										<TableHeader>
											<TableRow className="bg-gray-50">
												<TableHead className="font-semibold w-24">
													Kode
												</TableHead>
												<TableHead className="font-semibold">
													Nama Akun
												</TableHead>
												<TableHead className="font-semibold text-right">
													Saldo
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(accountsByType[type] || []).map((acc) => (
												<TableRow key={acc.id}>
													<TableCell className="font-mono text-sm">
														{acc.kodeAkun}
													</TableCell>
													<TableCell>{acc.namaAkun}</TableCell>
													<TableCell className="text-right font-medium">
														{formatCurrency(acc.saldo)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						),
					)}
				</>
			)}
		</div>
	);
}
