"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Building2, ArrowRightLeft, BookOpen } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils-currency";
import { formatDateShort } from "@/lib/utils/utils-date";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "@/components/reusable/FormDialog";
import {
	Field,
	FieldLabel,
	FieldError,
} from "@/components/reusable/Field";
import { DataTable } from "@/components/reusable/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { Account } from "@/types/account";
import type { MutasiEntry } from "@/types/keuangan";

type TabType = "kas-bank" | "akun";

const transferFormSchema = z.object({
	dari: z.enum(["101", "102"]),
	ke: z.enum(["101", "102"]),
	jumlah: z.string().min(1, "Jumlah wajib diisi"),
	keterangan: z.string().optional(),
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

export default function KeuanganPage() {
	const { isAdmin } = useAuth();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<TabType>("kas-bank");

	const transferForm = useForm<TransferFormValues>({
		resolver: zodResolver(transferFormSchema),
		defaultValues: {
			dari: "102",
			ke: "101",
			jumlah: "",
			keterangan: "",
			tanggal: new Date().toISOString().split("T")[0],
		},
		mode: "onChange",
	});

	const [isTransferOpen, setIsTransferOpen] = useState(false);

	const { data: accounts = [] } = useQuery<Account[]>({
		queryKey: ["accounts"],
		queryFn: async () => {
			const res = await fetch("/api/accounts");
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data akun");
			return result.data;
		},
	});

	const { data: mutasiResult, isLoading: mutasiLoading } = useQuery({
		queryKey: ["mutasi"],
		queryFn: async () => {
			const res = await fetch("/api/keuangan/mutasi?limit=20");
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal memuat data mutasi");
			return result;
		},
	});

	const kasAccount = accounts.find((a) => a.kodeAkun === "101") ?? null;
	const bankAccount = accounts.find((a) => a.kodeAkun === "102") ?? null;
	const mutasiHistory: MutasiEntry[] = mutasiResult?.data ?? [];

	const transferMutation = useMutation({
		mutationFn: async (data: TransferFormValues) => {
			const res = await fetch("/api/keuangan/mutasi", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					jumlah: parseFloat(data.jumlah) || 0,
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal transfer");
			return result;
		},
		onSuccess: () => {
			setIsTransferOpen(false);
			transferForm.reset({
				dari: "102",
				ke: "101",
				jumlah: "",
				keterangan: "",
				tanggal: new Date().toISOString().split("T")[0],
			});
			queryClient.invalidateQueries({ queryKey: ["accounts"] });
			queryClient.invalidateQueries({ queryKey: ["mutasi"] });
			toast.success("Transfer berhasil");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const handleTransfer = transferForm.handleSubmit((data) => {
		transferMutation.mutate(data);
	});

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

	const mutasiColumns: ColumnDef<MutasiEntry>[] = [
		{
			accessorKey: "tanggal",
			header: "Tanggal",
			cell: ({ row }) => (
				<span className="text-sm">{formatDateShort(row.original.tanggal)}</span>
			),
		},
		{
			accessorKey: "keterangan",
			header: "Keterangan",
			cell: ({ row }) => {
				const debitEntry = row.original.entries.find((e) => e.debit > 0);
				const creditEntry = row.original.entries.find((e) => e.kredit > 0);
				return (
					<div>
						<div className="text-sm">{row.original.keterangan}</div>
						<div className="text-xs text-gray-500">
							{creditEntry?.account.namaAkun} → {debitEntry?.account.namaAkun}
						</div>
					</div>
				);
			},
		},
		{
			id: "jumlah",
			header: () => <div className="text-right">Jumlah</div>,
			cell: ({ row }) => {
				const debitEntry = row.original.entries.find((e) => e.debit > 0);
				const creditEntry = row.original.entries.find((e) => e.kredit > 0);
				const amount = debitEntry?.debit || creditEntry?.kredit || 0;
				return (
					<div className="text-right font-medium">{formatRupiah(amount)}</div>
				);
			},
		},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Keuangan</h1>
				<p className="text-sm text-gray-500 mt-1">
					Master data keuangan & manajemen Kas/Bank
				</p>
			</div>

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
									{kasAccount ? formatRupiah(kasAccount.saldo) : "Rp 0"}
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
									{bankAccount ? formatRupiah(bankAccount.saldo) : "Rp 0"}
								</span>
							</CardContent>
						</Card>
					</div>

					{/* Transfer Button */}
					{isAdmin && (
						<Button
							onClick={() => {
								transferForm.reset();
								setIsTransferOpen(true);
							}}
							className="bg-[#059DEA] hover:bg-[#0480c4] text-white gap-2"
						>
							<ArrowRightLeft className="h-4 w-4" /> Transfer Kas ↔ Bank
						</Button>
					)}

					{/* Transfer History */}
					<Card className="border-0 shadow-sm">
						<CardHeader>
							<CardTitle className="text-base font-semibold">
								Riwayat Transfer
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<DataTable
								columns={mutasiColumns}
								data={mutasiHistory}
								loading={mutasiLoading}
								emptyMessage="Belum ada riwayat transfer"
							/>
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
									<div className="divide-y divide-slate-100">
										{(accountsByType[type] || []).map((acc) => (
											<div
												key={acc.id}
												className="flex items-center justify-between px-4 py-3"
											>
												<div className="flex items-center gap-3">
													<span className="font-mono text-sm font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
														{acc.kodeAkun}
													</span>
													<span className="text-sm text-slate-700">
														{acc.namaAkun}
													</span>
												</div>
												<span className="font-medium text-sm text-slate-900">
													{formatRupiah(acc.saldo)}
												</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						),
					)}
				</>
			)}

			{/* Transfer Dialog */}
			<FormDialog
				title="Transfer Kas ↔ Bank"
				open={isTransferOpen}
				onOpenChange={setIsTransferOpen}
				form={transferForm}
			>
				<form onSubmit={handleTransfer} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<Controller
							control={transferForm.control}
							name="dari"
							render={({ field }) => (
								<Field>
									<FieldLabel htmlFor="dari">Dari</FieldLabel>
									<select
										{...field}
										id="dari"
										className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
										onChange={(e) => {
											const val = e.target.value;
											field.onChange(val);
											transferForm.setValue(
												"ke",
												val === "101" ? "102" : "101",
											);
										}}
									>
										<option value="101">Kas</option>
										<option value="102">Bank</option>
									</select>
								</Field>
							)}
						/>
						<Controller
							control={transferForm.control}
							name="ke"
							render={({ field }) => (
								<Field>
									<FieldLabel htmlFor="ke">Ke</FieldLabel>
									<select
										{...field}
										id="ke"
										className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm"
										onChange={(e) => {
											const val = e.target.value;
											field.onChange(val);
											transferForm.setValue(
												"dari",
												val === "101" ? "102" : "101",
											);
										}}
									>
										<option value="101">Kas</option>
										<option value="102">Bank</option>
									</select>
								</Field>
							)}
						/>
					</div>

					<Controller
						control={transferForm.control}
						name="tanggal"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="tanggal">Tanggal *</FieldLabel>
								<Input
									{...field}
									id="tanggal"
									type="date"
									aria-invalid={!!fieldState.error}
								/>
								<FieldError errors={fieldState.error ? [fieldState.error] : []} />
							</Field>
						)}
					/>

					<Controller
						control={transferForm.control}
						name="jumlah"
						render={({ field, fieldState }) => (
							<Field data-invalid={!!fieldState.error}>
								<FieldLabel htmlFor="jumlah">Jumlah (Rp) *</FieldLabel>
								<Input
									{...field}
									id="jumlah"
									type="number"
									min="1"
									placeholder="0"
									aria-invalid={!!fieldState.error}
								/>
								<FieldError errors={fieldState.error ? [fieldState.error] : []} />
							</Field>
						)}
					/>

					<Controller
						control={transferForm.control}
						name="keterangan"
						render={({ field }) => (
							<Field>
								<FieldLabel htmlFor="keterangan">Keterangan</FieldLabel>
								<Input {...field} id="keterangan" placeholder="Opsional" />
							</Field>
						)}
					/>

					<div className="flex justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsTransferOpen(false)}
						>
							Batal
						</Button>
						<Button
							type="submit"
							disabled={transferMutation.isPending || !transferForm.formState.isValid}
							className="bg-[#059DEA] hover:bg-[#0480c4] text-white"
						>
							{transferMutation.isPending ? "Memproses..." : "Transfer"}
						</Button>
					</div>
				</form>
			</FormDialog>
		</div>
	);
}
