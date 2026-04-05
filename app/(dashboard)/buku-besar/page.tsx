"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { BookOpen, Send } from "lucide-react";
import { formatShortDate } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";

interface Account {
	id: string;
	kodeAkun: string;
	namaAkun: string;
}

interface BukuBesarEntry {
	id: string;
	tanggal: string;
	keterangan: string;
	reference: string | null;
	debit: number;
	kredit: number;
	saldo: number;
}

interface ReportData {
	account: {
		kodeAkun: string;
		namaAkun: string;
		tipeAkun: string;
	};
	data: BukuBesarEntry[];
	summary: {
		openingBalance: number;
		totalDebit: number;
		totalKredit: number;
		endingBalance: number;
	};
}

export default function BukuBesarPage() {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [kodeAkun, setKodeAkun] = useState("");
	const [startDate, setStartDate] = useState(() => {
		const year = new Date().getFullYear();
		return `${year}-01-01`;
	});
	const [endDate, setEndDate] = useState(() => {
		const year = new Date().getFullYear();
		return `${year}-12-31`;
	});
	const [reportParam, setReportParam] = useState<{
		start: string;
		end: string;
	} | null>(null);

	const [isLoading, setIsLoading] = useState(false);
	const [reports, setReports] = useState<ReportData[]>([]);
	const [hasSearched, setHasSearched] = useState(false);

	useEffect(() => {
		fetch("/api/accounts")
			.then((r) => r.json())
			.then((result) => {
				if (!result.success) {
					toast.error(result.error?.message || "Gagal memuat data akun");
					return;
				}
				if (Array.isArray(result.data)) {
					setAccounts(result.data);
				} else {
					console.error("Expected accounts array, got:", result);
				}
			})
			.catch((e) => {
				console.error("Error fetching accounts:", e);
				toast.error("Terjadi kesalahan saat memuat data akun");
			});
	}, []);

	// Auto-fetch initially without forcing the first account to be selected
	// this achieves the "show all accounts by default" behavior
	useEffect(() => {
		if (startDate && endDate && !hasSearched) {
			handleTampilkanData();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [startDate, endDate]);

	const handleTampilkanData = async () => {
		setIsLoading(true);
		setHasSearched(true);
		try {
			const params = new URLSearchParams({
				startDate,
				endDate,
				limit: "1000",
			});
			if (kodeAkun) params.append("kodeAkun", kodeAkun);
			else params.append("kodeAkun", "Semua");

			const res = await fetch(`/api/reports/buku-besar?${params.toString()}`);
			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal memuat buku besar");
				return;
			}

			setReports(result.data.reports || []);
			setReportParam({
				start: startDate,
				end: endDate,
			});
		} catch (error) {
			console.error(error);
		} finally {
			setIsLoading(false);
		}
	};

	const formatDateTime = (dateStr: string) => {
		try {
			return formatShortDate(dateStr);
		} catch {
			return dateStr;
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<BookOpen className="h-6 w-6 text-gray-700" />
				<h1 className="text-xl md:text-2xl font-bold text-gray-900">
					Buku Besar
				</h1>
			</div>

			{/* Filter Card */}
			<Card>
				<CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">
								Cari Berdasarkan
							</Label>
							<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
								<option>Periode</option>
							</select>
						</div>
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">Akun</Label>
							<select
								value={kodeAkun}
								onChange={(e) => setKodeAkun(e.target.value)}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								<option value="">Semua Akun</option>
								{accounts.map((a) => (
									<option key={a.id} value={a.kodeAkun}>
										{a.kodeAkun} - {a.namaAkun}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">
								Tanggal Awal
							</Label>
							<Input
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								className="h-10"
							/>
						</div>
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">Posisi</Label>
							<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
								<option>Semua</option>
							</select>
						</div>
					</div>

					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">
								Tanggal Akhir
							</Label>
							<Input
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								className="h-10"
							/>
						</div>
						<div className="flex items-end h-[68px]">
							<Button
								onClick={handleTampilkanData}
								disabled={isLoading}
								className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white flex items-center justify-center gap-2 h-10"
							>
								<Send className="w-4 h-4" />
								{isLoading ? "Memuat..." : "Tampilkan Data"}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Report Output */}
			{hasSearched && reportParam && (
				<div className="space-y-8">
					{reports.map((report, index) => (
						<Card key={index}>
							<CardHeader className="text-center border-b pb-4">
								<CardTitle className="text-xl font-medium">
									{report.account.kodeAkun} - {report.account.namaAkun}
								</CardTitle>
								<p className="text-sm italic text-gray-500 mt-1">
									Periode {reportParam.start} s/d {reportParam.end}
								</p>
							</CardHeader>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow className="bg-gray-50/50">
											<TableHead className="font-semibold text-gray-700 w-32 border-r">
												Tanggal
											</TableHead>
											<TableHead className="font-semibold text-gray-700 border-r">
												Akun
											</TableHead>
											<TableHead className="font-semibold text-gray-700 text-right w-36 border-r">
												Debet
											</TableHead>
											<TableHead className="font-semibold text-gray-700 text-right w-36 border-r">
												Kredit
											</TableHead>
											<TableHead className="font-semibold text-gray-700 text-right w-40 border-r">
												Saldo
											</TableHead>
											<TableHead className="font-semibold text-gray-700 min-w-64">
												Keterangan
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<TableRow className="bg-amber-50/10 font-medium">
											<TableCell colSpan={2} className="border-r">
												Saldo Sebelumnya
											</TableCell>
											<TableCell className="border-r"></TableCell>
											<TableCell className="border-r"></TableCell>
											<TableCell className="text-right border-r">
												{formatRupiah(report.summary.openingBalance).replace(
													"Rp",
													"",
												)}
											</TableCell>
											<TableCell></TableCell>
										</TableRow>

										{report.data.map((entry, idx) => (
											<TableRow
												key={entry.id || idx}
												className="hover:bg-slate-50/50"
											>
												<TableCell className="text-gray-600 border-r py-3">
													{formatDateTime(entry.tanggal)}
												</TableCell>
												<TableCell className="text-gray-800 border-r">
													{report.account.namaAkun}
												</TableCell>
												<TableCell className="text-emerald-700 text-right border-r">
													{entry.debit > 0 ? entry.debit.toFixed(2) : "0.00"}
												</TableCell>
												<TableCell className="text-red-700 text-right border-r">
													{entry.kredit > 0 ? entry.kredit.toFixed(2) : "0.00"}
												</TableCell>
												<TableCell className="font-medium text-right border-r px-2">
													{entry.saldo.toFixed(0)}
												</TableCell>
												<TableCell className="text-gray-600 truncate">
													{entry.keterangan}
												</TableCell>
											</TableRow>
										))}

										{report.data.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={6}
													className="text-center py-8 text-gray-500 italic"
												>
													Tidak ada transaksi pada periode ini
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</div>
						</Card>
					))}

					{reports.length === 0 && !isLoading && (
						<Card>
							<CardContent className="py-12 text-center text-gray-500 italic">
								Tidak ada data untuk rentang waktu yang dipilih
							</CardContent>
						</Card>
					)}
				</div>
			)}

			{/* Loading State Output */}
			{isLoading && reports.length === 0 && (
				<Card>
					<CardContent className="py-24 text-center">
						<div className="flex flex-col items-center justify-center">
							<div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e40af] mb-4"></div>
							<p className="text-gray-500">Memuat Buku Besar...</p>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
