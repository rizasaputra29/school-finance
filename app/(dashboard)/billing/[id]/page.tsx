"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Receipt, User, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";

interface BillingDetail {
	id: string;
	jenisBiaya: string;
	jumlah: number;
	statusBayar: string;
	tanggalBayar: string | null;
	tanggalJatuhTempo: string | null;
	catatan: string | null;
	createdAt: string;
	student: {
		id: string;
		nis: string;
		nama: string;
		kelas: string;
	};
}

export default function BillingDetailPage() {
	const params = useParams();
	const router = useRouter();

	const { data: billing, isLoading } = useQuery<BillingDetail>({
		queryKey: ["billing", params.id],
		queryFn: async () => {
			const res = await fetch(`/api/billing/${params.id}`);
			const result = await res.json();
			if (!result.success) {
				throw new Error(result.error?.message || "Tagihan tidak ditemukan");
			}
			return result.data;
		},
	});

	const isOverdue = (statusBayar: string, tanggalJatuhTempo: string | null) => {
		if (statusBayar === "Lunas") return false;
		if (!tanggalJatuhTempo) return false;
		return new Date() > new Date(tanggalJatuhTempo);
	};

	const getStatusBadge = (billing: BillingDetail) => {
		if (billing.statusBayar === "Lunas") {
			return (
				<Badge className="bg-green-100 text-green-800">
					<CheckCircle className="w-3 h-3 mr-1" />
					Lunas
				</Badge>
			);
		}
		if (isOverdue(billing.statusBayar, billing.tanggalJatuhTempo)) {
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

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
			</div>
		);
	}

	if (!billing) return null;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Detail Tagihan</h1>
					<p className="text-sm text-gray-500 mt-1">
						{billing.jenisBiaya} - {billing.student.nama}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							Informasi Siswa
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div>
							<p className="text-sm text-gray-500">NIS</p>
							<p className="font-mono font-medium">{billing.student.nis}</p>
						</div>
						<div>
							<p className="text-sm text-gray-500">Nama</p>
							<p className="font-medium">{billing.student.nama}</p>
						</div>
						<div>
							<p className="text-sm text-gray-500">Kelas</p>
							<Badge variant="secondary">{billing.student.kelas}</Badge>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Receipt className="h-5 w-5" />
							Detail Tagihan
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex justify-between">
							<div>
								<p className="text-sm text-gray-500">Jenis Biaya</p>
								<p className="font-medium">{billing.jenisBiaya}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Status</p>
								{getStatusBadge(billing)}
							</div>
						</div>
						<div>
							<p className="text-sm text-gray-500">Jumlah Tagihan</p>
							<p className="text-2xl font-bold text-gray-900">{formatRupiah(billing.jumlah)}</p>
						</div>
						{billing.tanggalBayar && (
							<div>
								<p className="text-sm text-gray-500">Tanggal Bayar</p>
								<p className="font-medium">{formatShortDate(billing.tanggalBayar)}</p>
							</div>
						)}
						{billing.catatan && (
							<div>
								<p className="text-sm text-gray-500">Catatan</p>
								<p className="font-medium">{billing.catatan}</p>
							</div>
						)}
						<div>
							<p className="text-sm text-gray-500">Dibuat</p>
							<p className="font-medium">{formatShortDate(billing.createdAt)}</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
