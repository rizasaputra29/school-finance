"use client";

import { useQuery } from "@tanstack/react-query";
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
import { ArrowLeft, User, Receipt, Calendar, CheckCircle, Clock } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateShort as formatShortDate } from "@/lib/utils/utils-date";

interface StudentDetail {
	id: string;
	nis: string;
	nama: string;
	jenisKelamin: string | null;
	kelas: string;
	tahunMasuk: number;
	tahunAjaran: string | null;
	namaOrtu: string | null;
	noTelp: string | null;
	statusBayar: string;
	totalTagihan: number;
	totalBayar: number;
	status: string;
	createdAt: string;
		billings: Array<{
		id: string;
		jenisBiaya: string;
		jumlah: number;
		statusBayar: string;
		tanggalBayar: string | null;
	}>;
}

export default function StudentDetailPage() {
	const params = useParams();
	const router = useRouter();

	const { data: student, isLoading } = useQuery<StudentDetail>({
		queryKey: ["student", params.id],
		queryFn: async () => {
			const res = await fetch(`/api/students/${params.id}`);
			const result = await res.json();
			if (!result.success) {
				throw new Error(result.error?.message || "Siswa tidak ditemukan");
			}
			return result.data;
		},
		enabled: !!params.id,
	});

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
			</div>
		);
	}

	if (!student) return null;

	const lunasCount = student.billings?.filter((b) => b.statusBayar === "Lunas").length || 0;
	const belumLunasCount = student.billings?.filter((b) => b.statusBayar === "Belum Lunas").length || 0;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div>
					<h1 className="text-2xl font-bold text-gray-900">{student.nama}</h1>
					<p className="text-sm text-gray-500 mt-1">
						NIS: {student.nis} | Kelas: {student.kelas}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							Informasi Siswa
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-sm text-gray-500">NIS</p>
								<p className="font-mono font-medium">{student.nis}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Nama Lengkap</p>
								<p className="font-medium">{student.nama}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Jenis Kelamin</p>
								<p className="font-medium">
									{student.jenisKelamin === "L" ? "Laki-laki" : student.jenisKelamin === "P" ? "Perempuan" : "-"}
								</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Kelas</p>
								<Badge variant="secondary">{student.kelas}</Badge>
							</div>
							<div>
								<p className="text-sm text-gray-500">Tahun Masuk</p>
								<p className="font-medium">{student.tahunMasuk}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Tahun Ajaran</p>
								<p className="font-medium">{student.tahunAjaran || "-"}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Nama Orang Tua</p>
								<p className="font-medium">{student.namaOrtu || "-"}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">No. Telepon</p>
								<p className="font-medium">{student.noTelp || "-"}</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Status</p>
								<Badge variant={student.status === "Active" ? "default" : "secondary"}>
									{student.status}
								</Badge>
							</div>
							<div>
								<p className="text-sm text-gray-500">Status Pembayaran</p>
								<Badge variant={student.statusBayar === "Lunas" ? "success" : "warning"}>
									{student.statusBayar}
								</Badge>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Receipt className="h-5 w-5" />
							Rekap Pembayaran
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="text-center p-4 bg-blue-50 rounded-lg">
							<p className="text-sm text-gray-500">Total Tagihan</p>
							<p className="text-xl font-bold text-blue-600">{formatRupiah(student.totalTagihan)}</p>
						</div>
						<div className="text-center p-4 bg-green-50 rounded-lg">
							<p className="text-sm text-gray-500">Total Dibayar</p>
							<p className="text-xl font-bold text-green-600">{formatRupiah(student.totalBayar)}</p>
						</div>
						<div className="text-center p-4 bg-gray-50 rounded-lg">
							<p className="text-sm text-gray-500">Sisa Tagihan</p>
							<p className="text-xl font-bold text-gray-900">
								{formatRupiah(student.totalTagihan - student.totalBayar)}
							</p>
						</div>
						<div className="flex justify-between text-sm">
							<span className="flex items-center gap-1 text-green-600">
								<CheckCircle className="w-4 h-4" /> {lunasCount} Lunas
							</span>
							<span className="flex items-center gap-1 text-amber-600">
								<Clock className="w-4 h-4" /> {belumLunasCount} Belum Lunas
							</span>
						</div>
					</CardContent>
				</Card>
			</div>

			{student.billings && student.billings.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Calendar className="h-5 w-5" />
							Riwayat Tagihan
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
								<TableHead>Jenis Biaya</TableHead>
									<TableHead className="text-right">Jumlah</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Tanggal Bayar</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{student.billings.map((billing) => (
								<TableRow key={billing.id}>
										<TableCell className="font-medium">{billing.jenisBiaya}</TableCell>
										<TableCell className="text-right">{formatRupiah(billing.jumlah)}</TableCell>
											<TableCell>
												<Badge variant={billing.statusBayar === "Lunas" ? "success" : "warning"}>
													{billing.statusBayar}
												</Badge>
											</TableCell>
											<TableCell>
												{billing.tanggalBayar ? formatShortDate(billing.tanggalBayar) : "-"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
