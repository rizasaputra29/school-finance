"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { BookOpen, CalendarDays } from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useAcademicYear } from "@/context/AcademicYearContext";
import type { AccountSimple as Account } from "@/types/account";
import type { JurnalLine } from "@/types/jurnal";
import type { ColumnDef } from "@tanstack/react-table";

export default function JurnalPage() {
	return <JurnalInner key={useAcademicYear().selectedYear?.id} />;
}

function JurnalInner() {
	const { selectedYear } = useAcademicYear();
	const [kodeAkun, setKodeAkun] = useState("");
	const initialStart = selectedYear?.tanggalMulai?.split("T")[0] ?? "";
	const initialEnd = selectedYear?.tanggalSelesai?.split("T")[0] ?? "";
	const [startDate, setStartDate] = useState(initialStart);
	const [endDate, setEndDate] = useState(initialEnd);
	const [keterangan, setKeterangan] = useState("");

	const { data: accounts = [] } = useQuery<Account[]>({
		queryKey: ["accounts"],
		queryFn: async () => {
			const res = await fetch("/api/accounts");
			const result = await res.json();
			if (!result.success) {
				throw new Error(result.error?.message || "Gagal memuat data akun");
			}
			return result.data || [];
		},
	});

	const fetchJournalData = async () => {
		const params = new URLSearchParams({
			startDate,
			endDate,
			limit: "100",
		});
		if (keterangan) params.append("search", keterangan);

		const res = await fetch(`/api/reports/jurnal?${params.toString()}`);
		const result = await res.json();
		if (!result.success) {
			throw new Error(result.error?.message || "Gagal memuat jurnal");
		}

		const journals = result.data || [];

		// Flatten journals to lines
		let flattenedLines: JurnalLine[] = [];
		for (const j of journals) {
			for (const [lineIndex, e] of j.entries.entries()) {
				flattenedLines.push({
					id: `${j.id}-${lineIndex}-${e.kodeAkun}`,
					tanggal: j.tanggal,
					kodeAkun: e.kodeAkun,
					namaAkun: e.namaAkun,
					debit: e.debit,
					kredit: e.kredit,
					keterangan: j.keterangan,
					reference: j.reference,
				});
			}
		}

		// Apply local filter for akun since backend journal search is by JournalEntry not line
		if (kodeAkun) {
			flattenedLines = flattenedLines.filter((l) => l.kodeAkun === kodeAkun);
		}

		// Sort by date ascending
		flattenedLines.sort(
			(a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime(),
		);

		return flattenedLines;
	};

	const { data: lines = [], isLoading } = useQuery<JurnalLine[]>({
		queryKey: ["jurnal", startDate, endDate, keterangan, kodeAkun],
		queryFn: fetchJournalData,
		enabled: !!startDate && !!endDate,
	});

	const columns: ColumnDef<JurnalLine>[] = useMemo(
		() => [
			{
				accessorKey: "tanggal",
				header: "Tanggal",
				cell: ({ row }) => (
					<span className="text-gray-600">{formatShortDate(row.original.tanggal)}</span>
				),
			},
			{
				accessorKey: "kodeAkun",
				header: "Kode Akun",
				cell: ({ row }) => (
					<span className="font-mono text-gray-800 text-[13px]">{row.original.kodeAkun}</span>
				),
			},
			{
				accessorKey: "namaAkun",
				header: "Nama Akun",
				cell: ({ row }) => (
					<span className="font-medium text-gray-800 text-[13px]">{row.original.namaAkun}</span>
				),
			},
			{
				accessorKey: "keterangan",
				header: "Keterangan",
				cell: ({ row }) => (
					<span className="text-gray-500 text-[13px] truncate">
						{row.original.keterangan}{" "}
						{row.original.reference ? `| RefID: ${row.original.reference}` : ""}
					</span>
				),
			},
			{
				accessorKey: "debit",
				header: "Debit",
				cell: ({ row }) => (
					<span className="text-gray-700 text-[13px]">
						{row.original.debit > 0 ? formatRupiah(row.original.debit) : "-"}
					</span>
				),
			},
			{
				accessorKey: "kredit",
				header: "Kredit",
				cell: ({ row }) => (
					<span className="text-gray-700 text-[13px]">
						{row.original.kredit > 0 ? formatRupiah(row.original.kredit) : "-"}
					</span>
				),
			},
		],
		[],
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<BookOpen className="h-6 w-6 text-gray-700" />
				<h1 className="text-xl md:text-2xl font-bold text-gray-900">
					Jurnal Umum
				</h1>
				{selectedYear && (
					<Badge variant="secondary" className="flex items-center gap-1.5 ml-2">
						<CalendarDays className="h-3.5 w-3.5" />
						{selectedYear.tahunAjaran}
					</Badge>
				)}
			</div>

			{/* Filter Card */}
			<Card>
				<CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
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
							<Label className="text-xs text-gray-500 mb-1 block">Posisi</Label>
							<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
								<option>Semua</option>
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
							<Label className="text-xs text-gray-500 mb-1 block">Akun</Label>
							<select
								value={kodeAkun}
								onChange={(e) => setKodeAkun(e.target.value)}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								<option value=""># Pilih Akun #</option>
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
								Tanggal Akhir
							</Label>
							<Input
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								className="h-10"
							/>
						</div>
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">
								Cari Berdasarkan Keterangan
							</Label>
							<Input
								type="text"
								placeholder="Masukan No. Nota atau Kata"
								value={keterangan}
								onChange={(e) => setKeterangan(e.target.value)}
								className="h-10"
							/>
						</div>
					</div>

					<div className="space-y-4">
						<div>
							<Label className="text-xs text-gray-500 mb-1 block">
								Cari Berdasarkan Keterangan
							</Label>
							<Input
								type="text"
								placeholder="Masukan No. Nota atau Kata"
								value={keterangan}
								onChange={(e) => setKeterangan(e.target.value)}
								className="h-10"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Report Output */}
			<Card>
				<div className="p-4">
					<DataTable
						columns={columns}
						data={lines}
						isLoading={isLoading}
						emptyMessage="Tidak ada transaksi pada periode ini"
					/>
				</div>
			</Card>
		</div>
	);
}
