"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, Download, Printer } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";

interface AccountReportItem {
	kodeAkun: string;
	namaAkun: string;
	tipeAkun?: string;
	jumlah: number;
	kategori?: string;
}

interface ReportSummary {
	totalAset?: number;
	totalKewajiban?: number;
	totalEkuitas?: number;
	totalPendapatan?: number;
	totalBeban?: number;
	labaRugi?: number;
	isPositive?: boolean;
}

export default function ReportsPage() {
	const [neracaData, setNeracaData] = useState<{
		data: {
			aset: AccountReportItem[];
			kewajiban: AccountReportItem[];
			ekuitas: AccountReportItem[];
		};
		summary: ReportSummary;
	} | null>(null);
	const [labaRugiData, setLabaRugiData] = useState<{
		data: AccountReportItem[];
		summary: ReportSummary;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isExporting, setIsExporting] = useState<string | null>(null);
	const [reportDate, setReportDate] = useState(
		new Date().toISOString().split("T")[0],
	);

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Fetch neraca data - always shows current state (no date filter needed)
				const neracaRes = await fetch("/api/reports/neraca");
				const neracaResult = await neracaRes.json();
				if (!neracaResult.success) {
					toast.error(
						neracaResult.error?.message || "Gagal memuat data neraca",
					);
				} else {
					setNeracaData({
						data: neracaResult.data,
						summary: neracaResult.meta?.summary,
					});
				}

				// Fetch laba rugi data - shows ALL historical data by default (no date filter)
				// This allows seeing complete revenue/expense breakdown from all periods
				const labaRugiRes = await fetch("/api/reports/laba-rugi");
				const labaRugiResult = await labaRugiRes.json();
				if (!labaRugiResult.success) {
					toast.error(
						labaRugiResult.error?.message || "Gagal memuat data laba rugi",
					);
				} else {
					setLabaRugiData({
						data: labaRugiResult.data,
						summary: labaRugiResult.meta?.summary,
					});
				}
			} catch (error) {
				console.error("Failed to fetch data:", error);
				toast.error("Terjadi kesalahan saat memuat laporan");
			} finally {
				setIsLoading(false);
			}
		};
		fetchData();
	}, [reportDate]);

	const handleExport = async (type: string, format: "excel" | "pdf") => {
		setIsExporting(`${type}-${format}`);
		try {
			const endpoint =
				format === "excel" ? "/api/export/excel" : "/api/export/pdf";
			const res = await fetch(`${endpoint}?type=${type}`);
			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal mengekspor laporan");
				setIsExporting(null);
				return;
			}
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `laporan-${type}-${new Date().toISOString().split("T")[0]}.${format === "excel" ? "xlsx" : "pdf"}`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			a.remove();
			toast.success("Laporan berhasil diekspor");
		} catch (error) {
			console.error("Export error:", error);
			toast.error("Terjadi kesalahan saat mengekspor laporan");
		} finally {
			setIsExporting(null);
		}
	};

	const handlePrint = () => {
		window.print();
	};

	// Use dynamic Laba Rugi data from API - memoized for performance
	const { revenues, expenses, totalRevenue, totalExpense, labaRugi } = useMemo(
		() => ({
			revenues:
				labaRugiData?.data?.filter(
					(a: AccountReportItem) => a.kategori === "PENDAPATAN",
				) || [],
			expenses:
				labaRugiData?.data?.filter(
					(a: AccountReportItem) => a.kategori === "BEBAN",
				) || [],
			totalRevenue: labaRugiData?.summary?.totalPendapatan || 0,
			totalExpense: labaRugiData?.summary?.totalBeban || 0,
			labaRugi:
				(labaRugiData?.summary?.isPositive ? 1 : -1) *
				(labaRugiData?.summary?.labaRugi || 0),
		}),
		[labaRugiData],
	);

	// Use dynamic neraca data from API - memoized for performance
	const {
		assets,
		liabilities,
		equity,
		totalAssets,
		totalLiabilities,
		totalEquity,
	} = useMemo(
		() => ({
			assets: neracaData?.data?.aset || [],
			liabilities: neracaData?.data?.kewajiban || [],
			equity: neracaData?.data?.ekuitas || [],
			totalAssets: neracaData?.summary?.totalAset || 0,
			totalLiabilities: neracaData?.summary?.totalKewajiban || 0,
			totalEquity: neracaData?.summary?.totalEkuitas || 0,
		}),
		[neracaData],
	);

	const formatReportDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString("id-ID", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	};

	if (isLoading) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
					<p className="text-sm text-gray-500">Memuat laporan...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<style jsx global>{`
				@media print {
					body * {
						visibility: hidden;
					}
					.print-area,
					.print-area * {
						visibility: visible;
					}
					.print-area {
						position: absolute;
						left: 0;
						top: 0;
						width: 100%;
					}
					.no-print {
						display: none !important;
					}
				}
			`}</style>

			<div className="space-y-6">
				{/* Header with Controls */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print">
					<div>
						<h1 className="text-xl md:text-2xl font-bold text-gray-900">
							Laporan Keuangan
						</h1>
						<p className="text-xs md:text-sm text-gray-500">
							Laporan Laba Rugi dan Neraca
						</p>
					</div>
					<div className="flex flex-col sm:flex-row items-end gap-3">
						<div className="w-full sm:w-auto">
							<Label htmlFor="reportDate" className="text-xs">
								Tanggal Laporan
							</Label>
							<Input
								id="reportDate"
								type="date"
								value={reportDate}
								onChange={(e) => setReportDate(e.target.value)}
								className="w-full sm:w-40 text-xs"
							/>
						</div>
						<Button
							variant="outline"
							onClick={handlePrint}
							size="sm"
							className="w-full sm:w-auto text-xs md:text-sm"
						>
							<Printer className="mr-2 h-4 w-4" />
							Cetak
						</Button>
					</div>
				</div>

				{/* Print Area */}
				<div className="print-area space-y-8">
					{/* LAPORAN LABA RUGI */}
					<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
						<Card className="border-2 border-gray-800 shadow-none print:border print:shadow-none min-w-[700px] md:min-w-0">
							<CardContent className="p-0">
								{/* Report Header */}
								<div className="border-b-2 border-gray-800 bg-white rounded-2xl p-3 md:p-6 text-center">
									<div className="flex justify-center mb-3">
										<Image
											src="/logo.svg"
											alt="Al Madeena Islamic School"
											width={80}
											height={80}
											className="object-contain"
										/>
									</div>
									<h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">
										YAYASAN AL MADEENA
									</h1>
									<h2 className="mt-1 text-lg font-bold uppercase text-gray-800">
										LAPORAN LABA RUGI
									</h2>
									<p className="mt-2 text-sm text-gray-600">
										Per {formatReportDate(reportDate)}
									</p>
								</div>

								{/* Report Body */}
								<div className="p-6 space-y-6">
									{/* PENDAPATAN */}
									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											I. PENDAPATAN
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{revenues.map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 text-gray-800">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono w-40">
															{formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
												<TableRow className="border-t-2 border-gray-800 font-bold">
													<TableCell className="py-2" colSpan={2}>
														Total Pendapatan
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(totalRevenue)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									{/* BEBAN */}
									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											II. BEBAN
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{expenses.map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 text-gray-800">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono w-40">
															{formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
												<TableRow className="border-t-2 border-gray-800 font-bold">
													<TableCell className="py-2" colSpan={2}>
														Total Beban
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(totalExpense)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									{/* LABA/RUGI BERSIH */}
									<div className="border-t-4 border-double border-gray-800 pt-4">
										<div className="flex justify-between items-center">
											<span className="text-lg font-bold text-gray-900">
												{labaRugi >= 0 ? "LABA BERSIH" : "RUGI BERSIH"}
											</span>
											<span className="text-lg font-bold font-mono text-gray-900">
												{labaRugi >= 0 ? "" : "("}
												{formatRupiah(Math.abs(labaRugi))}
												{labaRugi >= 0 ? "" : ")"}
											</span>
										</div>
									</div>
								</div>

								{/* Export Buttons */}
								<div className="border-t border-gray-200 p-4 flex justify-end gap-2 no-print">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("laba-rugi", "excel")}
										disabled={isExporting === "laba-rugi-excel"}
									>
										<FileSpreadsheet className="mr-1 h-4 w-4" />
										Excel
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("laba-rugi", "pdf")}
										disabled={isExporting === "laba-rugi-pdf"}
									>
										<FileText className="mr-1 h-4 w-4" />
										PDF
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* NERACA */}
					<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
						<Card className="border-2 border-gray-800 shadow-none print:border print:shadow-none min-w-[700px] md:min-w-0">
							<CardContent className="p-0">
								{/* Report Header */}
								<div className="flex justify-center mt-4">
									<Image
										src="/logo.svg"
										alt="Al Madeena Islamic School"
										width={80}
										height={80}
										className="object-contain"
									/>
								</div>
								<div className="border-b-2 border-gray-800 bg-white rounded-2xl p-3 md:p-6 text-center">
									<h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">
										YAYASAN AL MADEENA
									</h1>
									<h2 className="mt-1 text-lg font-bold uppercase text-gray-800">
										NERACA
									</h2>
									<p className="mt-2 text-sm text-gray-600">
										Per {formatReportDate(reportDate)}
									</p>
								</div>

								{/* Report Body */}
								<div className="p-6 space-y-6">
									<div>
										{/* Left Column - AKTIVA */}
										<div className="space-y-4">
											<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
												AKTIVA
											</h3>

											<Table className="border-collapse">
												<TableBody>
													{assets.map((a: AccountReportItem) => (
														<TableRow key={a.kodeAkun} className="border-0">
															<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
																{a.kodeAkun}
															</TableCell>
															<TableCell className="py-1 text-gray-800">
																{a.namaAkun}
															</TableCell>
															<TableCell className="py-1 text-right font-mono w-40">
																{formatRupiah(Math.abs(a.jumlah || 0))}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>

											<div className="border-t-2 border-gray-800 font-bold pt-2 flex justify-between items-center">
												<span>TOTAL AKTIVA</span>
												<span className="font-mono">
													{formatRupiah(totalAssets)}
												</span>
											</div>
										</div>
									</div>

									{/* Right Column - PASIVA */}
									<div className="space-y-6">
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											PASIVA
										</h3>

										{/* Kewajiban */}
										<div>
											<h4 className="font-semibold text-gray-700 text-sm mb-2 pl-2">
												Kewajiban
											</h4>
											<Table className="border-collapse">
												<TableBody>
													{liabilities.map((a: AccountReportItem) => (
														<TableRow key={a.kodeAkun} className="border-0">
															<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
																{a.kodeAkun}
															</TableCell>
															<TableCell className="py-1 text-gray-800">
																{a.namaAkun}
															</TableCell>
															<TableCell className="py-1 text-right font-mono w-40">
																{formatRupiah(Math.abs(a.jumlah || 0))}
															</TableCell>
														</TableRow>
													))}
													{liabilities.length === 0 && (
														<TableRow className="border-0">
															<TableCell
																colSpan={3}
																className="py-1 text-gray-400 italic text-sm pl-4"
															>
																Tidak ada kewajiban
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
											<div className="border-t border-gray-300 pt-1 mt-1 flex justify-between items-center px-2">
												<span className="font-semibold text-sm">
													Total Kewajiban
												</span>
												<span className="font-semibold font-mono text-sm">
													{formatRupiah(Math.abs(totalLiabilities))}
												</span>
											</div>
										</div>

										{/* Ekuitas */}
										<div>
											<h4 className="font-semibold text-gray-700 text-sm mb-2 pl-2">
												Ekuitas
											</h4>
											<Table className="border-collapse">
												<TableBody>
													{equity.map((a: AccountReportItem) => (
														<TableRow key={a.kodeAkun} className="border-0">
															<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
																{a.kodeAkun}
															</TableCell>
															<TableCell className="py-1 text-gray-800">
																{a.namaAkun}
															</TableCell>
															<TableCell className="py-1 text-right font-mono w-40">
																{formatRupiah(Math.abs(a.jumlah || 0))}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
											<div className="border-t border-gray-300 pt-1 mt-1 flex justify-between items-center px-2">
												<span className="font-semibold text-sm">
													Total Ekuitas
												</span>
												<span className="font-semibold font-mono text-sm">
													{formatRupiah(Math.abs(totalEquity))}
												</span>
											</div>
										</div>

										<div className="border-t-4 border-double border-gray-800 pt-4 flex justify-between items-center">
											<span className="text-lg font-bold text-gray-900">
												TOTAL PASIVA
											</span>
											<span className="text-lg font-bold font-mono text-gray-900">
												{formatRupiah(
													Math.abs(totalLiabilities + totalEquity),
												)}
											</span>
										</div>
									</div>
								</div>

								{/* Export Buttons */}
								<div className="border-t border-gray-200 p-4 flex justify-end gap-2 no-print">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("neraca", "excel")}
										disabled={isExporting === "neraca-excel"}
									>
										<FileSpreadsheet className="mr-1 h-4 w-4" />
										Excel
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("neraca", "pdf")}
										disabled={isExporting === "neraca-pdf"}
									>
										<FileText className="mr-1 h-4 w-4" />
										PDF
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Export All */}
				<Card className="no-print">
					<CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
						<div>
							<h3 className="font-semibold text-gray-900">
								Export Semua Laporan
							</h3>
							<p className="text-sm text-gray-500">
								Download Laba Rugi, Neraca, dan Cashflow dalam satu file
							</p>
						</div>
						<Button
							onClick={() => handleExport("all", "excel")}
							disabled={isExporting === "all-excel"}
						>
							<Download className="mr-2 h-4 w-4" />
							Export Semua (Excel)
						</Button>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
