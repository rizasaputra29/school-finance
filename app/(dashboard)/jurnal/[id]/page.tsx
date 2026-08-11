"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
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
import { ArrowLeft, BookOpen, CheckCircle, Clock, Send } from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { useAuth } from "@/context/AuthContext";
import type { JournalEntryDetail } from "@/types/jurnal";

export default function JournalDetailPage() {
	const params = useParams();
	const router = useRouter();
	const { isAdmin } = useAuth();
	const queryClient = useQueryClient();

	const { data: journal, isLoading } = useQuery({
		queryKey: ["journal", params.id],
		queryFn: async () => {
			const res = await fetch(`/api/journal?id=${params.id}`);
			const result = await res.json();
			if (!result.success) {
				toast.error("Jurnal tidak ditemukan");
				router.push("/jurnal");
				return null;
			}
			return result.data as JournalEntryDetail;
		},
	});

	const approveMutation = useMutation({
		mutationFn: async () => {
			if (!journal) throw new Error("No journal");
			const res = await fetch("/api/journal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "approve", id: journal.id }),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menyetujui jurnal");
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["journal", params.id] });
			toast.success("Jurnal berhasil disetujui");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const postMutation = useMutation({
		mutationFn: async () => {
			if (!journal) throw new Error("No journal");
			const res = await fetch("/api/journal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "post", id: journal.id }),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memposting jurnal");
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["journal", params.id] });
			toast.success("Jurnal berhasil diposting");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const isApproving = approveMutation.isPending || postMutation.isPending;

	const handleApprove = () => approveMutation.mutate();
	const handlePost = () => postMutation.mutate();

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "posted":
				return (
					<Badge className="bg-green-100 text-green-800">
						<CheckCircle className="w-3 h-3 mr-1" />
						Posted
					</Badge>
				);
			case "approved":
				return (
					<Badge className="bg-blue-100 text-blue-800">
						<Send className="w-3 h-3 mr-1" />
						Approved
					</Badge>
				);
			default:
				return (
					<Badge className="bg-yellow-100 text-yellow-800">
						<Clock className="w-3 h-3 mr-1" />
						Draft
					</Badge>
				);
		}
	};

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
			</div>
		);
	}

	if (!journal) return null;

	const totalDebit = journal.entries?.reduce((sum: number, e: JournalEntryDetail["entries"][0]) => sum + (e.debit || 0), 0) || 0;
	const totalKredit = journal.entries?.reduce((sum: number, e: JournalEntryDetail["entries"][0]) => sum + (e.kredit || 0), 0) || 0;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Detail Jurnal</h1>
					<p className="text-sm text-gray-500 mt-1">
						{journal.keterangan || journal.reference || "Jurnal Entry"}
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<BookOpen className="h-5 w-5" />
							Informasi Jurnal
						</CardTitle>
						{getStatusBadge(journal.status)}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm text-gray-500">Tanggal</p>
							<p className="font-medium">{formatShortDate(journal.tanggal)}</p>
						</div>
						<div>
							<p className="text-sm text-gray-500">Reference</p>
							<p className="font-medium font-mono text-sm">{journal.reference || "-"}</p>
						</div>
						<div className="col-span-2">
							<p className="text-sm text-gray-500">Keterangan</p>
							<p className="font-medium">{journal.keterangan || "-"}</p>
						</div>
					</div>
					{journal.postedAt && (
						<div className="text-xs text-gray-400">
							Diposting pada {formatShortDate(journal.postedAt)} oleh {journal.postedBy || "system"}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Detail Jurnal Line</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Akun</TableHead>
									<TableHead className="text-right">Debit</TableHead>
									<TableHead className="text-right">Kredit</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{journal.entries?.map((entry: JournalEntryDetail["entries"][0]) => (
									<TableRow key={entry.id}>
										<TableCell>
											<div>
												<div className="font-medium text-sm">{entry.account?.namaAkun || entry.kodeAkun}</div>
												<div className="text-xs text-gray-500">{entry.kodeAkun}</div>
											</div>
										</TableCell>
										<TableCell className="text-right">
											{entry.debit > 0 ? formatRupiah(entry.debit) : "-"}
										</TableCell>
										<TableCell className="text-right">
											{entry.kredit > 0 ? formatRupiah(entry.kredit) : "-"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<div className="flex justify-end gap-8 mt-4 pt-4 border-t">
						<div>
							<span className="text-sm text-gray-500">Total Debit: </span>
							<span className="font-bold">{formatRupiah(totalDebit)}</span>
						</div>
						<div>
							<span className="text-sm text-gray-500">Total Kredit: </span>
							<span className="font-bold">{formatRupiah(totalKredit)}</span>
						</div>
						<div>
							<span className="text-sm text-gray-500">Saldo: </span>
							<span className={`font-bold ${totalDebit === totalKredit ? "text-green-600" : "text-red-600"}`}>
								{totalDebit === totalKredit ? "Seimbang" : "Tidak Seimbang"}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			{isAdmin && journal.status === "draft" && (
				<div className="flex justify-end gap-3">
					<Button
						onClick={handleApprove}
						disabled={isApproving}
						className="bg-blue-600 hover:bg-blue-700"
					>
						{isApproving ? "Memproses..." : "Setujui Jurnal"}
					</Button>
				</div>
			)}

			{isAdmin && journal.status === "approved" && (
				<div className="flex justify-end gap-3">
					<Button
						onClick={handlePost}
						disabled={isApproving}
						className="bg-green-600 hover:bg-green-700"
					>
						{isApproving ? "Memproses..." : "Posting Jurnal"}
					</Button>
				</div>
			)}
		</div>
	);
}
