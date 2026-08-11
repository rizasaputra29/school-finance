"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { BookOpen, CalendarDays } from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useAcademicYear } from "@/context/AcademicYearContext";
import type { AccountSimple as Account } from "@/types/account";
import type { BukuBesarReportData as ReportData, BukuBesarEntry } from "@/types/buku-besar";
import type { ColumnDef } from "@tanstack/react-table";

export default function BukuBesarPage() {
	return <BukuBesarInner key={useAcademicYear().selectedYear?.id} />;
}

function BukuBesarInner() {
	const { selectedYear } = useAcademicYear();
	const [kodeAkun, setKodeAkun] = useState("");
	const initialStart = selectedYear?.tanggalMulai?.split("T")[0] ?? "";
	const initialEnd = selectedYear?.tanggalSelesai?.split("T")[0] ?? "";
	const [startDate, setStartDate] = useState(initialStart);
	const [endDate, setEndDate] = useState(initialEnd);

	const { data: accounts = [] } = useQuery<Account[]>({
		queryKey: ["accounts"],
		queryFn: async () => {
			const res = await fetch("/api/accounts");
			const result = await res.json();
			if (!result.success) throw new Error(result.error?.message || "Gagal memuat data akun");
			return result.data;
		},
	});

	const reportParams = new URLSearchParams({ startDate, endDate, limit: "1000" });
	if (kodeAkun) reportParams.append("kodeAkun", kodeAkun);
	else reportParams.append("kodeAkun", "Semua");

	const { data: reportResult, isLoading } = useQuery({
		queryKey: ["buku-besar", startDate, endDate, kodeAkun],
		queryFn: () =>
			fetch(`/api/reports/buku-besar?${reportParams.toString()}`).then((r) => r.json()),
		enabled: !!startDate && !!endDate,
	});

	const reports: ReportData[] = reportResult?.data ?? [];

	const formatDate = (dateStr: string) => {
		try { return formatShortDate(dateStr); } catch { return dateStr; }
	};

	const getColumns = (accountName: string): ColumnDef<BukuBesarEntry>[] => [
		{
			accessorKey: "tanggal",
			header: "Tanggal",
			cell: ({ row }) => <span className="text-gray-600">{formatDate(row.original.tanggal)}</span>,
		},
		{
			id: "namaAkun",
			header: "Akun",
			cell: () => <span className="font-medium text-gray-800 text-[13px]">{accountName}</span>,
		},
		{
			accessorKey: "debit",
			header: "Debet",
			cell: ({ row }) => (
				<span className="text-emerald-700 text-[13px]">
					{row.original.debit > 0 ? formatRupiah(row.original.debit) : "0.00"}
				</span>
			),
		},
		{
			accessorKey: "kredit",
			header: "Kredit",
			cell: ({ row }) => (
				<span className="text-red-700 text-[13px]">
					{row.original.kredit > 0 ? formatRupiah(row.original.kredit) : "0.00"}
				</span>
			),
		},
		{
			accessorKey: "saldo",
			header: "Saldo",
			cell: ({ row }) => (
				<span className="font-medium text-right text-[13px]">
					{formatRupiah(row.original.saldo).replace("Rp", "")}
				</span>
			),
		},
		{
			accessorKey: "keterangan",
			header: "Keterangan",
			cell: ({ row }) => (
				<span className="text-gray-500 text-[13px] truncate">{row.original.keterangan}</span>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<BookOpen className="h-6 w-6 text-gray-700" />
				<h1 className="text-xl md:text-2xl font-bold text-gray-900">Buku Besar</h1>
				{selectedYear && (
					<Badge variant="secondary" className="ml-2 gap-1.5 font-normal">
						<CalendarDays className="h-3.5 w-3.5" />
						{selectedYear.tahunAjaran}
					</Badge>
				)}
			</div>

			{/* Filter Card */}
			<Card>
				<CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">Akun</Label>
							<select
								value={kodeAkun}
								onChange={(e) => setKodeAkun(e.target.value)}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
							<Label className="text-xs text-gray-500 mb-1 block">Tanggal Awal</Label>
							<Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" />
						</div>
					</div>

					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">Tanggal Akhir</Label>
							<Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10" />
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Report Output */}
			<div className="space-y-8">
				{reports.map((report, index) => (
					<Card key={index}>
						<CardHeader className="border-b pb-4">
							<CardTitle className="text-xl font-medium text-center">
								{report.account.kodeAkun} - {report.account.namaAkun}
							</CardTitle>
							<p className="text-sm italic text-gray-500 text-center mt-1">
								Periode {startDate} s/d {endDate}
							</p>
							<div className="flex justify-between items-center mt-3 pt-3 border-t bg-amber-50/50 rounded-md px-4 py-2">
								<span className="text-sm font-medium text-gray-600">Saldo Sebelumnya</span>
								<span className="text-sm font-semibold text-gray-800">{formatRupiah(report.summary.openingBalance)}</span>
							</div>
						</CardHeader>
						<div className="p-4">
							<DataTable
								columns={getColumns(`${report.account.kodeAkun} - ${report.account.namaAkun}`)}
								data={report.data}
								isLoading={isLoading}
								emptyMessage="Tidak ada transaksi pada periode ini"
								onRowClick={() => {}}
							/>
						</div>
					</Card>
				))}

				{!isLoading && reports.length === 0 && startDate && endDate && (
					<Card>
						<CardContent className="py-12 text-center text-gray-500 italic">
							Tidak ada data untuk rentang waktu yang dipilih
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
