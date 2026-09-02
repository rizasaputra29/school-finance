"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, Download, Printer } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateFull } from "@/lib/utils/utils-date";
import { useAcademicYear } from "@/context/AcademicYearContext";
import type { AccountReportItem, ReportSummary } from "@/types/reports";

export default function ReportsPage() {
	return <ReportsInner key={useAcademicYear().selectedYear?.id} />;
}

function ReportsInner() {
	const { selectedYear } = useAcademicYear();
	const [isExporting, setIsExporting] = useState<string | null>(null);
	const initialReportDate = selectedYear?.tanggalSelesai?.split("T")[0] ?? new Date().toISOString().split("T")[0];
	const [reportDate, setReportDate] = useState(initialReportDate);

	// Derive year param from academic year (first part of "2025/2026")
	const yearParam = selectedYear?.tahunAjaran?.split("/")[0] || "";

	const { data: neracaData, isLoading: isNeracaLoading } = useQuery({
		queryKey: ["neraca", yearParam],
		queryFn: async () => {
			const params = yearParam ? `?tahun=${yearParam}` : "";
			const res = await fetch(`/api/reports/neraca${params}`);
			const result = await res.json();
			if (!result.success)
				throw new Error(
					result.error?.message || "Gagal memuat data neraca",
				);
			return {
				data: result.data as {
					aset: {
						aktivaLancar: AccountReportItem[];
						aktivaTetap: AccountReportItem[];
						totalAktivaLancar: number;
						totalAktivaTetap: number;
					};
					kewajiban: AccountReportItem[];
					ekuitas: AccountReportItem[];
				},
				summary: result.meta?.summary as ReportSummary,
			};
		},
	});

	const { data: labaRugiData, isLoading: isLabaRugiLoading } = useQuery({
		queryKey: ["laba-rugi", yearParam],
		queryFn: async () => {
			const params = yearParam ? `?tahun=${yearParam}` : "";
			const res = await fetch(`/api/reports/laba-rugi${params}`);
			const result = await res.json();
			if (!result.success)
				throw new Error(
					result.error?.message || "Gagal memuat data laba rugi",
				);
			return {
				data: result.data as AccountReportItem[],
				summary: result.meta?.summary as ReportSummary,
			};
		},
	});

	const { data: perubahanAsetNetoData, isLoading: isPerubahanAsetNetoLoading } =
		useQuery({
			queryKey: ["perubahan-aset-neto", yearParam],
			queryFn: async () => {
				const params = yearParam ? `?tahun=${yearParam}` : "";
				const res = await fetch(
					`/api/reports/perubahan-aset-neto${params}`,
				);
				const result = await res.json();
				if (!result.success)
					throw new Error(
						result.error?.message ||
							"Gagal memuat data perubahan aset neto",
					);
				return result.data as {
					saldoAwal: AccountReportItem[];
					pendapatan: AccountReportItem[];
					beban: AccountReportItem[];
					prive: AccountReportItem;
					saldoAkhir: number;
				};
			},
		});

	const { data: arusKasData, isLoading: isArusKasLoading } = useQuery({
		queryKey: ["arus-kas", yearParam],
		queryFn: async () => {
			const params = yearParam ? `?tahun=${yearParam}` : "";
			const res = await fetch(`/api/reports/cashflow-report${params}`);
			const result = await res.json();
			if (!result.success)
				throw new Error(
					result.error?.message || "Gagal memuat data arus kas",
				);
			return result.data as {
				operasi: { items: AccountReportItem[]; total: number };
				investasi: { items: AccountReportItem[]; total: number };
				pendanaan: { items: AccountReportItem[]; total: number };
				saldoKasAwal: number;
				saldoKasAkhir: number;
			};
		},
	});

	const { data: catkData, isLoading: isCatkLoading } = useQuery({
		queryKey: ["catk", yearParam],
		queryFn: async () => {
			const params = yearParam ? `?tahun=${yearParam}` : "";
			const res = await fetch(`/api/reports/catk${params}`);
			const result = await res.json();
			if (!result.success)
				throw new Error(
					result.error?.message ||
						"Gagal memuat data catatan atas laporan keuangan",
				);
			return result.data as {
				informasiUmum: {
					namaYayasan: string;
					alamat: string;
					dasarHukum: string;
				};
				kebijakanAkuntansi: {
					metodeAkuntansi: string;
					basisPencatatan: string;
					kebijakanDepresiasi: string;
				};
				aset: {
					lancar: AccountReportItem[];
					tetap: (AccountReportItem & { penyusutan: number })[];
					totalLancar: number;
					totalTetap: number;
					totalAset: number;
				};
				kewajiban: {
					items: AccountReportItem[];
					totalKewajiban: number;
				};
				asetNeto: {
					tidakTerikat: AccountReportItem[];
					totalAsetNeto: number;
				};
				pendapatan: {
					items: AccountReportItem[];
					totalPendapatan: number;
				};
				beban: {
					items: AccountReportItem[];
					totalBeban: number;
				};
			};
		},
	});

	const isLoading =
		isNeracaLoading ||
		isLabaRugiLoading ||
		isPerubahanAsetNetoLoading ||
		isArusKasLoading ||
		isCatkLoading;

	const handleExport = async (type: string, format: "excel" | "pdf") => {
		setIsExporting(`${type}-${format}`);
		try {
			const endpoint =
				format === "excel" ? "/api/export/excel" : "/api/export/pdf";
			const res = await fetch(`${endpoint}?type=${type}`);
			if (!res.ok) {
				const errorResult = await res.json().catch(() => null);
				toast.error(errorResult?.error?.message || "Gagal mengekspor laporan");
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
	const {
		revenues,
		expenses,
		totalRevenue,
		totalExpense,
		labaRugi,
		periodeBerjalan,
		periodeSebelumnya,
	} = useMemo(
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
			labaRugi: labaRugiData?.summary?.labaRugi || 0,
			periodeBerjalan: labaRugiData?.summary?.periodeBerjalan || 0,
			periodeSebelumnya: labaRugiData?.summary?.periodeSebelumnya || 0,
		}),
		[labaRugiData],
	);

	// Use dynamic neraca data from API - memoized for performance
	const {
		aktivaLancar,
		aktivaTetap,
		totalAktivaLancar,
		totalAktivaTetap,
		liabilities,
		equity,
		totalAssets,
		totalLiabilities,
		totalEquity,
	} = useMemo(
		() => ({
			aktivaLancar: neracaData?.data?.aset?.aktivaLancar || [],
			aktivaTetap: neracaData?.data?.aset?.aktivaTetap || [],
			totalAktivaLancar: neracaData?.data?.aset?.totalAktivaLancar || 0,
			totalAktivaTetap: neracaData?.data?.aset?.totalAktivaTetap || 0,
			liabilities: neracaData?.data?.kewajiban || [],
			equity: neracaData?.data?.ekuitas || [],
			totalAssets: neracaData?.summary?.totalAset || 0,
			totalLiabilities: neracaData?.summary?.totalKewajiban || 0,
			totalEquity: neracaData?.summary?.totalEkuitas || 0,
		}),
		[neracaData],
	);



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
							Laporan Laba Rugi, Neraca, Perubahan Aset Neto, Arus Kas, dan CaTK (ISAK 35)
						</p>
						{selectedYear && (
							<p className="text-xs md:text-sm text-gray-700 font-medium mt-1">
								Tahun Ajaran: {selectedYear.tahunAjaran}
							</p>
						)}
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
										Per {formatDateFull(reportDate)}
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

								{/* PERIODE BREAKDOWN */}
								<div className="border-t border-gray-300 pt-3 space-y-1">
									<div className="flex justify-between items-center text-sm">
										<span className="text-gray-700">Laba (Rugi) Berjalan</span>
										<span className="font-mono text-gray-700">
											{periodeBerjalan >= 0 ? "" : "("}
											{formatRupiah(Math.abs(periodeBerjalan))}
											{periodeBerjalan >= 0 ? "" : ")"}
										</span>
									</div>
									<div className="flex justify-between items-center text-sm">
										<span className="text-gray-700">Laba (Rugi) Sebelumnya</span>
										<span className="font-mono text-gray-700">
											{periodeSebelumnya >= 0 ? "" : "("}
											{formatRupiah(Math.abs(periodeSebelumnya))}
											{periodeSebelumnya >= 0 ? "" : ")"}
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
										Per {formatDateFull(reportDate)}
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

											{/* Aktiva Lancar */}
											<div>
												<h4 className="font-semibold text-gray-700 text-sm mb-1 pl-2">
													Aktiva Lancar
												</h4>
												<Table className="border-collapse">
													<TableBody>
														{aktivaLancar.map((a: AccountReportItem) => (
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
														{aktivaLancar.length === 0 && (
															<TableRow className="border-0">
																<TableCell
																	colSpan={3}
																	className="py-1 text-gray-400 italic text-sm pl-4"
																>
																	Tidak ada aktiva lancar
																</TableCell>
															</TableRow>
														)}
													</TableBody>
												</Table>
												<div className="border-t border-gray-300 pt-1 mt-1 flex justify-between items-center px-2">
													<span className="text-sm font-medium text-gray-700">
														Total Aktiva Lancar
													</span>
													<span className="font-mono text-sm">
														{formatRupiah(totalAktivaLancar)}
													</span>
												</div>
											</div>

											{/* Aktiva Tetap */}
											<div>
												<h4 className="font-semibold text-gray-700 text-sm mb-1 pl-2">
													Aktiva Tetap
												</h4>
												<Table className="border-collapse">
													<TableBody>
														{aktivaTetap.map((a: AccountReportItem) => (
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
														{aktivaTetap.length === 0 && (
															<TableRow className="border-0">
																<TableCell
																	colSpan={3}
																	className="py-1 text-gray-400 italic text-sm pl-4"
																>
																	Tidak ada aktiva tetap
																</TableCell>
															</TableRow>
														)}
													</TableBody>
												</Table>
												<div className="border-t border-gray-300 pt-1 mt-1 flex justify-between items-center px-2">
													<span className="text-sm font-medium text-gray-700">
														Total Aktiva Tetap
													</span>
													<span className="font-mono text-sm">
														{formatRupiah(totalAktivaTetap)}
													</span>
												</div>
											</div>

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
																{formatRupiah(a.jumlah || 0)}
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
															{formatRupiah(totalLiabilities)}
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
																{formatRupiah(a.jumlah || 0)}
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
															{formatRupiah(totalEquity)}
														</span>
											</div>
										</div>

										<div className="border-t-4 border-double border-gray-800 pt-4 flex justify-between items-center">
											<span className="text-lg font-bold text-gray-900">
												TOTAL PASIVA
											</span>
										<span className="text-lg font-bold font-mono text-gray-900">
											{formatRupiah(totalLiabilities + totalEquity)}
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

					{/* LAPORAN PERUBAHAN ASET NETO */}
					<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
						<Card className="border-2 border-gray-800 shadow-none print:border print:shadow-none min-w-[700px] md:min-w-0">
							<CardContent className="p-0">
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
										LAPORAN PERUBAHAN ASET NETO
									</h2>
									<p className="mt-2 text-sm text-gray-600">
										Per {formatDateFull(reportDate)}
									</p>
								</div>

								<div className="p-6 space-y-6">
									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											Aset Neto Tidak Terikat
										</h3>
										<Table className="border-collapse">
											<TableBody>
												<TableRow className="border-0">
													<TableCell
														className="py-1 text-gray-800"
														colSpan={2}
													>
														Saldo Awal
													</TableCell>
													<TableCell className="py-1 text-right font-mono w-40">
														{formatRupiah(
															perubahanAsetNetoData?.saldoAwal?.reduce(
																(sum, a) => sum + a.jumlah,
																0,
															) || 0,
														)}
													</TableCell>
												</TableRow>
												{(perubahanAsetNetoData?.saldoAwal || []).map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-8 w-16 text-gray-500 font-mono text-xs">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 pl-4 text-gray-600 text-sm">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono text-sm text-gray-500">
															{formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-semibold text-gray-700 text-sm border-b border-gray-300 pb-1 mb-2">
											Pendapatan
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(perubahanAsetNetoData?.pendapatan || []).map(
													(a) => (
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
													),
												)}
												<TableRow className="border-t border-gray-300 font-semibold">
													<TableCell className="py-1" colSpan={2}>
														Total Pendapatan
													</TableCell>
													<TableCell className="py-1 text-right font-mono">
														{formatRupiah(
															perubahanAsetNetoData?.pendapatan?.reduce(
																(sum, a) => sum + a.jumlah,
																0,
															) || 0,
														)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-semibold text-gray-700 text-sm border-b border-gray-300 pb-1 mb-2">
											Beban
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(perubahanAsetNetoData?.beban || []).map((a) => (
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
												<TableRow className="border-t border-gray-300 font-semibold">
													<TableCell className="py-1" colSpan={2}>
														Total Beban
													</TableCell>
													<TableCell className="py-1 text-right font-mono">
														{formatRupiah(
															perubahanAsetNetoData?.beban?.reduce(
																(sum, a) => sum + a.jumlah,
																0,
															) || 0,
														)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									{perubahanAsetNetoData?.prive &&
										perubahanAsetNetoData.prive.jumlah !== 0 && (
											<div>
												<Table className="border-collapse">
													<TableBody>
														<TableRow className="border-0">
															<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
																{perubahanAsetNetoData.prive.kodeAkun}
															</TableCell>
															<TableCell className="py-1 text-gray-800">
																Prive
															</TableCell>
															<TableCell className="py-1 text-right font-mono w-40">
																(
																{formatRupiah(
																	Math.abs(
																		perubahanAsetNetoData.prive.jumlah,
																	),
																)}
																)
															</TableCell>
														</TableRow>
													</TableBody>
												</Table>
											</div>
										)}

									<div className="border-t-4 border-double border-gray-800 pt-4">
										<div className="flex justify-between items-center">
											<span className="text-lg font-bold text-gray-900">
												SALDO AKHIR ASET NETO
											</span>
											<span className="text-lg font-bold font-mono text-gray-900">
												{formatRupiah(
													perubahanAsetNetoData?.saldoAkhir || 0,
												)}
											</span>
										</div>
									</div>
								</div>

								<div className="border-t border-gray-200 p-4 flex justify-end gap-2 no-print">
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											handleExport("perubahan-aset-neto", "excel")
										}
										disabled={
											isExporting === "perubahan-aset-neto-excel"
										}
									>
										<FileSpreadsheet className="mr-1 h-4 w-4" />
										Excel
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											handleExport("perubahan-aset-neto", "pdf")
										}
										disabled={
											isExporting === "perubahan-aset-neto-pdf"
										}
									>
										<FileText className="mr-1 h-4 w-4" />
										PDF
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* LAPORAN ARUS KAS */}
					<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
						<Card className="border-2 border-gray-800 shadow-none print:border print:shadow-none min-w-[700px] md:min-w-0">
							<CardContent className="p-0">
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
										LAPORAN ARUS KAS
									</h2>
									<p className="mt-2 text-sm text-gray-600">
										Per {formatDateFull(reportDate)}
									</p>
								</div>

								<div className="p-6 space-y-6">
									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											Arus Kas dari Kegiatan Operasi
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(arusKasData?.operasi?.items || []).map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 text-gray-800">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono w-40">
															{a.jumlah < 0
																? `(${formatRupiah(Math.abs(a.jumlah))})`
																: formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
												<TableRow className="border-t-2 border-gray-800 font-bold">
													<TableCell className="py-2" colSpan={2}>
														Kas Bersih dari Kegiatan Operasi
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{arusKasData?.operasi?.total !== undefined &&
														arusKasData.operasi.total < 0
															? `(${formatRupiah(Math.abs(arusKasData.operasi.total))})`
															: formatRupiah(
																	arusKasData?.operasi?.total || 0,
																)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											Arus Kas dari Kegiatan Investasi
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(arusKasData?.investasi?.items || []).map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 text-gray-800">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono w-40">
															{a.jumlah < 0
																? `(${formatRupiah(Math.abs(a.jumlah))})`
																: formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
												{(!arusKasData?.investasi?.items ||
													arusKasData.investasi.items.length === 0) && (
													<TableRow className="border-0">
														<TableCell
															colSpan={3}
															className="py-1 text-gray-400 italic text-sm pl-4"
														>
															Tidak ada transaksi investasi
														</TableCell>
													</TableRow>
												)}
												<TableRow className="border-t-2 border-gray-800 font-bold">
													<TableCell className="py-2" colSpan={2}>
														Kas Bersih dari Kegiatan Investasi
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{arusKasData?.investasi?.total !== undefined &&
														arusKasData.investasi.total < 0
															? `(${formatRupiah(Math.abs(arusKasData.investasi.total))})`
															: formatRupiah(
																	arusKasData?.investasi?.total || 0,
																)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-2">
											Arus Kas dari Kegiatan Pendanaan
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(arusKasData?.pendanaan?.items || []).map((a) => (
													<TableRow key={a.kodeAkun} className="border-0">
														<TableCell className="py-1 pl-4 w-16 text-gray-700 font-mono text-sm">
															{a.kodeAkun}
														</TableCell>
														<TableCell className="py-1 text-gray-800">
															{a.namaAkun}
														</TableCell>
														<TableCell className="py-1 text-right font-mono w-40">
															{a.jumlah < 0
																? `(${formatRupiah(Math.abs(a.jumlah))})`
																: formatRupiah(a.jumlah)}
														</TableCell>
													</TableRow>
												))}
												{(!arusKasData?.pendanaan?.items ||
													arusKasData.pendanaan.items.length === 0) && (
													<TableRow className="border-0">
														<TableCell
															colSpan={3}
															className="py-1 text-gray-400 italic text-sm pl-4"
														>
															Tidak ada transaksi pendanaan
														</TableCell>
													</TableRow>
												)}
												<TableRow className="border-t-2 border-gray-800 font-bold">
													<TableCell className="py-2" colSpan={2}>
														Kas Bersih dari Kegiatan Pendanaan
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{arusKasData?.pendanaan?.total !== undefined &&
														arusKasData.pendanaan.total < 0
															? `(${formatRupiah(Math.abs(arusKasData.pendanaan.total))})`
															: formatRupiah(
																	arusKasData?.pendanaan?.total || 0,
																)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div className="border-t-4 border-double border-gray-800 pt-4 space-y-2">
										<div className="flex justify-between items-center">
											<span className="font-bold text-gray-900">
												Kenaikan (Penurunan) Kas Bersih
											</span>
											<span className="font-bold font-mono text-gray-900">
												{(() => {
													const net =
														(arusKasData?.operasi?.total || 0) +
														(arusKasData?.investasi?.total || 0) +
														(arusKasData?.pendanaan?.total || 0);
													return net < 0
														? `(${formatRupiah(Math.abs(net))})`
														: formatRupiah(net);
												})()}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-700">Saldo Kas Awal</span>
											<span className="font-mono text-gray-700">
												{formatRupiah(arusKasData?.saldoKasAwal || 0)}
											</span>
										</div>
										<div className="flex justify-between items-center border-t-2 border-gray-800 pt-2">
											<span className="text-lg font-bold text-gray-900">
												Saldo Kas Akhir
											</span>
											<span className="text-lg font-bold font-mono text-gray-900">
												{formatRupiah(arusKasData?.saldoKasAkhir || 0)}
											</span>
										</div>
									</div>
								</div>

								<div className="border-t border-gray-200 p-4 flex justify-end gap-2 no-print">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("arus-kas", "excel")}
										disabled={isExporting === "arus-kas-excel"}
									>
										<FileSpreadsheet className="mr-1 h-4 w-4" />
										Excel
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("arus-kas", "pdf")}
										disabled={isExporting === "arus-kas-pdf"}
									>
										<FileText className="mr-1 h-4 w-4" />
										PDF
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* CATATAN ATAS LAPORAN KEUANGAN (CaTK) */}
					<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
						<Card className="border-2 border-gray-800 shadow-none print:border print:shadow-none min-w-[700px] md:min-w-0">
							<CardContent className="p-0">
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
										CATATAN ATAS LAPORAN KEUANGAN
									</h2>
									<p className="mt-2 text-sm text-gray-600">
										Per {formatDateFull(reportDate)}
									</p>
								</div>

								<div className="p-6 space-y-8">
									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											1. Informasi Umum
										</h3>
										<div className="pl-4 space-y-1 text-sm text-gray-700">
											<p>
												<strong>Nama Yayasan:</strong>{" "}
												{catkData?.informasiUmum?.namaYayasan || "-"}
											</p>
											<p>
												<strong>Alamat:</strong>{" "}
												{catkData?.informasiUmum?.alamat || "-"}
											</p>
											<p>
												<strong>Dasar Hukum:</strong>{" "}
												{catkData?.informasiUmum?.dasarHukum || "-"}
											</p>
										</div>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											2. Ringkasan Kebijakan Akuntansi
										</h3>
										<div className="pl-4 space-y-1 text-sm text-gray-700">
											<p>
												<strong>Metode Akuntansi:</strong>{" "}
												{catkData?.kebijakanAkuntansi?.metodeAkuntansi || "-"}
											</p>
											<p>
												<strong>Basis Pencatatan:</strong>{" "}
												{catkData?.kebijakanAkuntansi?.basisPencatatan || "-"}
											</p>
											<p>
												<strong>Kebijakan Depresiasi:</strong>{" "}
												{catkData?.kebijakanAkuntansi
													?.kebijakanDepresiasi || "-"}
											</p>
										</div>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											3. Aset
										</h3>
										<div className="space-y-4">
											<div>
												<h4 className="font-semibold text-gray-700 text-sm mb-2">
													Aktiva Lancar
												</h4>
												<Table className="border-collapse">
													<TableBody>
														{(catkData?.aset?.lancar || []).map((a) => (
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
														<TableRow className="border-t border-gray-300 font-semibold">
															<TableCell className="py-1" colSpan={2}>
																Total Aktiva Lancar
															</TableCell>
															<TableCell className="py-1 text-right font-mono">
																{formatRupiah(
																	catkData?.aset?.totalLancar || 0,
																)}
															</TableCell>
														</TableRow>
													</TableBody>
												</Table>
											</div>
											<div>
												<h4 className="font-semibold text-gray-700 text-sm mb-2">
													Aktiva Tetap
												</h4>
												<Table className="border-collapse">
													<TableBody>
														{(catkData?.aset?.tetap || []).map((a) => (
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
														<TableRow className="border-t border-gray-300 font-semibold">
															<TableCell className="py-1" colSpan={2}>
																Total Aktiva Tetap (Bersih)
															</TableCell>
															<TableCell className="py-1 text-right font-mono">
																{formatRupiah(
																	catkData?.aset?.totalTetap || 0,
																)}
															</TableCell>
														</TableRow>
													</TableBody>
												</Table>
											</div>
											<div className="border-t-2 border-gray-800 font-bold pt-2 flex justify-between items-center">
												<span>TOTAL ASET</span>
												<span className="font-mono">
													{formatRupiah(catkData?.aset?.totalAset || 0)}
												</span>
											</div>
										</div>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											4. Kewajiban
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(catkData?.kewajiban?.items || []).map((a) => (
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
														TOTAL KEWAJIBAN
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(
															catkData?.kewajiban?.totalKewajiban || 0,
														)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											5. Aset Neto
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(catkData?.asetNeto?.tidakTerikat || []).map((a) => (
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
														TOTAL ASET NETO
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(
															catkData?.asetNeto?.totalAsetNeto || 0,
														)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											6. Pendapatan
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(catkData?.pendapatan?.items || []).map((a) => (
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
														TOTAL PENDAPATAN
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(
															catkData?.pendapatan?.totalPendapatan || 0,
														)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>

									<div>
										<h3 className="font-bold text-gray-900 border-b border-gray-400 pb-1 mb-3">
											7. Beban
										</h3>
										<Table className="border-collapse">
											<TableBody>
												{(catkData?.beban?.items || []).map((a) => (
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
														TOTAL BEBAN
													</TableCell>
													<TableCell className="py-2 text-right font-mono">
														{formatRupiah(catkData?.beban?.totalBeban || 0)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>
								</div>

								<div className="border-t border-gray-200 p-4 flex justify-end gap-2 no-print">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("catk", "excel")}
										disabled={isExporting === "catk-excel"}
									>
										<FileSpreadsheet className="mr-1 h-4 w-4" />
										Excel
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleExport("catk", "pdf")}
										disabled={isExporting === "catk-pdf"}
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
								Download Laba Rugi, Neraca, Perubahan Aset Neto, Arus Kas, dan CaTK dalam satu file
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
