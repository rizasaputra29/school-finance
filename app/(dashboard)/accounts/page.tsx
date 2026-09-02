"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";
import {
	Wallet,
	CreditCard,
	PiggyBank,
	TrendingUp,
	TrendingDown,
	Plus,
	Pencil,
	Trash2,
	Search,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "@/components/reusable/FormDialog";
import {
	Field,
	FieldLabel,
	FieldDescription,
	FieldError,
} from "@/components/reusable/Field";
import * as Dialog from "@radix-ui/react-dialog";
import type { Account } from "@/types/account";

const accountTypeConfig: Record<
	string,
	{
		label: string;
		icon: React.ComponentType<{ className?: string }>;
		gradient: string;
	}
> = {
	Asset: {
		label: "Aset",
		icon: Wallet,
		gradient: "from-blue-500 to-blue-600",
	},
	Liability: {
		label: "Kewajiban",
		icon: CreditCard,
		gradient: "from-red-500 to-red-600",
	},
	Equity: {
		label: "Ekuitas",
		icon: PiggyBank,
		gradient: "from-purple-500 to-purple-600",
	},
	Revenue: {
		label: "Pendapatan",
		icon: TrendingUp,
		gradient: "from-emerald-500 to-emerald-600",
	},
	Expense: {
		label: "Beban",
		icon: TrendingDown,
		gradient: "from-amber-500 to-amber-600",
	},
};

const accountFormSchema = z.object({
	kodeAkun: z.string().min(1, "Kode akun wajib diisi"),
	namaAkun: z.string().min(1, "Nama akun wajib diisi"),
	tipeAkun: z.enum(["Asset", "Liability", "Equity", "Revenue", "Expense"]),
	saldo: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

export default function AccountsPage() {
	const { isAdmin } = useAuth();
	const { selectedYear } = useAcademicYear();
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState("");

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

	const createForm = useForm<AccountFormValues>({
		resolver: zodResolver(accountFormSchema),
		defaultValues: {
			kodeAkun: "",
			namaAkun: "",
			tipeAkun: "Asset",
			saldo: "",
		},
		mode: "onChange",
	});

	const editForm = useForm<AccountFormValues>({
		resolver: zodResolver(accountFormSchema),
		defaultValues: {
			kodeAkun: "",
			namaAkun: "",
			tipeAkun: "Asset",
			saldo: "",
		},
		mode: "onChange",
	});

	const { data: accounts = [], isLoading } = useQuery<Account[]>({
		queryKey: ["accounts", selectedYear?.id],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (selectedYear?.id) params.set("academicYearId", selectedYear.id);
			const res = await fetch(`/api/accounts${params.toString() ? `?${params}` : ""}`);
			const result = await res.json();
			if (!result.success) {
				throw new Error(result.error?.message || "Gagal memuat data akun");
			}
			return result.data.map((a: Record<string, unknown>) => ({
				...a,
				saldo: a.yearSaldo ?? a.saldo,
			}));
		},
	});

	// Silent catch-up: ensure full-year depreciation is posted for the selected
	// academic year whenever the COA page loads. Idempotent via force: false.
	useEffect(() => {
		if (!selectedYear?.id) return;

		(async () => {
			try {
				const response = await fetch("/api/assets/depreciation", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						academicYearId: selectedYear.id,
						capDate: selectedYear.tanggalSelesai,
					}),
				});
				const result = await response.json();
				if (!result.success) return;

				// If anything was actually posted, refresh the COA data
				if ((result.data?.assetsProcessed ?? 0) > 0) {
					queryClient.invalidateQueries({
						queryKey: ["accounts", selectedYear?.id],
					});
				}
			} catch (error) {
				console.error("Silent depreciation catch-up failed:", error);
			}
		})();
	}, [selectedYear?.id, selectedYear?.tanggalSelesai, queryClient]);

	const createMutation = useMutation({
		mutationFn: async (data: AccountFormValues) => {
			const res = await fetch("/api/accounts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					saldo: parseFormattedNumber(String(data.saldo || "0")),
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal membuat akun");
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["accounts"] });
			setIsCreateOpen(false);
			createForm.reset();
			toast.success("Akun berhasil dibuat");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const editMutation = useMutation({
		mutationFn: async (data: AccountFormValues) => {
			if (!selectedAccount) throw new Error("Akun tidak dipilih");
			const res = await fetch(`/api/accounts/${selectedAccount.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					saldo: parseFormattedNumber(String(data.saldo || "0")),
				}),
			});
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal mengupdate akun");
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["accounts"] });
			setIsEditOpen(false);
			setSelectedAccount(null);
			editForm.reset();
			toast.success("Akun berhasil diupdate");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			if (!selectedAccount) throw new Error("Akun tidak dipilih");
			const res = await fetch(`/api/accounts/${selectedAccount.id}`, {
				method: "DELETE",
			});
			if (res.status === 204) return { success: true };
			const result = await res.json();
			if (!result.success)
				throw new Error(result.error?.message || "Gagal menghapus akun");
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["accounts"] });
			setIsDeleteOpen(false);
			setSelectedAccount(null);
			toast.success("Akun berhasil dihapus");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const handleCreate = createForm.handleSubmit((data) => {
		createMutation.mutate(data);
	});

	const handleEdit = editForm.handleSubmit((data) => {
		editMutation.mutate(data);
	});

	const handleDelete = () => {
		if (!selectedAccount) return;
		deleteMutation.mutate();
	};

	const openEditDialog = (acc: Account) => {
		setSelectedAccount(acc);
		editForm.reset({
			kodeAkun: acc.kodeAkun,
			namaAkun: acc.namaAkun,
			tipeAkun: acc.tipeAkun as AccountFormValues["tipeAkun"],
			saldo: formatNumberInput(acc.saldo),
		});
		setIsEditOpen(true);
	};

	const filteredAccounts = useMemo(() => {
		if (!searchTerm.trim()) return accounts;
		const term = searchTerm.toLowerCase();
		return accounts.filter(
			(a) =>
				a.kodeAkun.toLowerCase().includes(term) ||
				a.namaAkun.toLowerCase().includes(term),
		);
	}, [accounts, searchTerm]);

	const groupedAccounts = filteredAccounts.reduce(
		(acc, account) => {
			if (!acc[account.tipeAkun]) {
				acc[account.tipeAkun] = [];
			}
			acc[account.tipeAkun].push(account);
			return acc;
		},
		{} as Record<string, Account[]>,
	);

	const accountTypes = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

	const renderAccountForm = (
		form: typeof createForm,
		onSubmit: (e: React.BaseSyntheticEvent) => Promise<void>,
		submitLabel: string,
		isEdit = false,
	) => (
		<form onSubmit={onSubmit} className="space-y-4">
			<Controller
				control={form.control}
				name="kodeAkun"
				render={({ field, fieldState }) => (
					<Field data-invalid={!!fieldState.error}>
						<FieldLabel htmlFor="kodeAkun">Kode Akun</FieldLabel>
						<Input
							{...field}
							id="kodeAkun"
							placeholder="Contoh: 101"
							disabled={isEdit}
							aria-invalid={!!fieldState.error}
						/>
						<FieldError errors={fieldState.error ? [fieldState.error] : []} />
					</Field>
				)}
			/>

			<Controller
				control={form.control}
				name="namaAkun"
				render={({ field, fieldState }) => (
					<Field data-invalid={!!fieldState.error}>
						<FieldLabel htmlFor="namaAkun">Nama Akun</FieldLabel>
						<Input
							{...field}
							id="namaAkun"
							placeholder="Contoh: Kas Utama"
							aria-invalid={!!fieldState.error}
						/>
						<FieldError errors={fieldState.error ? [fieldState.error] : []} />
					</Field>
				)}
			/>

			<Controller
				control={form.control}
				name="tipeAkun"
				render={({ field, fieldState }) => (
					<Field data-invalid={!!fieldState.error}>
						<FieldLabel htmlFor="tipeAkun">Tipe Akun</FieldLabel>
						<select
							{...field}
							id="tipeAkun"
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
						>
							{accountTypes.map((type) => (
								<option key={type} value={type}>
									{accountTypeConfig[type]?.label || type}
								</option>
							))}
						</select>
						<FieldError errors={fieldState.error ? [fieldState.error] : []} />
					</Field>
				)}
			/>

			<Controller
				control={form.control}
				name="saldo"
				render={({ field }) => (
					<Field>
						<FieldLabel htmlFor="saldo">Saldo Awal / Saat Ini</FieldLabel>
						<div className="relative">
							<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
								Rp
							</span>
							<Input
								{...field}
								id="saldo"
								value={field.value || ""}
								onChange={(e) =>
									field.onChange(formatNumberInput(e.target.value))
								}
								placeholder="0"
								className="pl-10"
							/>
						</div>
						<FieldDescription>
							{isEdit
								? "Mengubah saldo secara langsung akan mempengaruhi balance sheet."
								: "Saldo awal akun."}
						</FieldDescription>
					</Field>
				)}
			/>

			<div className="flex justify-end gap-3 pt-4">
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						if (isEdit) setIsEditOpen(false);
						else setIsCreateOpen(false);
					}}
				>
					Batal
				</Button>
				<Button type="submit" disabled={form.formState.isSubmitting}>
					{form.formState.isSubmitting ? "Menyimpan..." : submitLabel}
				</Button>
			</div>
		</form>
	);

	if (isLoading) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
					<p className="text-sm text-gray-500">Memuat daftar akun...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2 pb-6">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Daftar Akun
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						Bagan akun untuk laporan keuangan
						{selectedYear && (
							<span className="ml-2 text-[#059DEA] font-medium">
								• {selectedYear.tahunAjaran}
							</span>
						)}
					</p>
				</div>

				{isAdmin && (
					<Button
						onClick={() => {
							createForm.reset();
							setIsCreateOpen(true);
						}}
						size="sm"
						className="text-xs md:text-sm"
					>
						<Plus className="h-4 w-4 md:mr-2" />
						<span className="hidden md:inline">Tambah Akun</span>
						<span className="md:hidden">Tambah</span>
					</Button>
				)}
			</div>

			{/* Search */}
			{accounts.length > 0 && (
				<div className="relative max-w-sm">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
					<Input
						placeholder="Cari kode atau nama akun..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="pl-9"
					/>
				</div>
			)}

			{/* Account Groups */}
			{accountTypes.map((type) => {
				const typeAccounts = groupedAccounts[type] || [];
				const config = accountTypeConfig[type];
				const Icon = config?.icon || Wallet;
				const totalSaldo = typeAccounts.reduce((sum, a) => sum + a.saldo, 0);

				return (
					<Card key={type} className="shadow-sm overflow-hidden bg-white">
						<CardHeader className="border-b border-gray-100 bg-gray-50 py-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#059DEA]/20 text-gray-700">
										<Icon className="h-5 w-5" />
									</div>
									<div>
										<CardTitle className="text-base font-semibold text-slate-800">
											{config?.label || type}
										</CardTitle>
										<p className="text-xs text-slate-500">
											{typeAccounts.length} akun
										</p>
									</div>
								</div>
								<div className="text-right">
									<p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
										Total Saldo
									</p>
									<p className="text-lg font-bold text-slate-900 font-mono">
										{formatRupiah(totalSaldo)}
									</p>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-0">
							{typeAccounts.length > 0 ? (
								<div className="divide-y divide-slate-100">
									{typeAccounts.map((account) => (
										<div
											key={account.id}
											className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-colors hover:bg-slate-50"
										>
											<div className="flex items-center gap-3 sm:gap-4">
												<span className="font-mono text-xs sm:text-sm font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
													{account.kodeAkun}
												</span>
												<span className="font-medium text-sm sm:text-base text-slate-700">
													{account.namaAkun}
												</span>
											</div>
											<div className="flex items-center justify-between sm:justify-end gap-4 pl-11 sm:pl-0">
												<span className="font-semibold text-sm sm:text-base text-slate-900">
													{formatRupiah(account.saldo)}
												</span>
												{isAdmin && (
													<div className="flex gap-1">
														<Button
															size="sm"
															variant="ghost"
															onClick={() => openEditDialog(account)}
														>
															<Pencil className="h-4 w-4 text-slate-500" />
														</Button>
														<Button
															size="sm"
															variant="ghost"
															className="text-red-600 hover:text-red-700"
															onClick={() => {
																setSelectedAccount(account);
																setIsDeleteOpen(true);
															}}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex h-24 items-center justify-center text-slate-400">
									Belum ada akun{" "}
									{config?.label.toLowerCase() || type.toLowerCase()}
								</div>
							)}
						</CardContent>
					</Card>
				);
			})}

			{accounts.length === 0 && (
				<Card>
					<CardContent className="flex h-48 items-center justify-center text-slate-400">
						Belum ada data akun. Import dari Excel atau Tambah Akun.
					</CardContent>
				</Card>
			)}

			{accounts.length > 0 && filteredAccounts.length === 0 && (
				<Card>
					<CardContent className="flex h-48 items-center justify-center text-slate-400">
						Tidak ada akun yang cocok dengan pencarian
					</CardContent>
				</Card>
			)}

			{/* Create Dialog */}
			<FormDialog
				title="Tambah Akun Baru"
				open={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				form={createForm}
			>
				{renderAccountForm(createForm, handleCreate, "Simpan")}
			</FormDialog>

			{/* Edit Dialog */}
			<FormDialog
				title="Edit Akun"
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
				form={editForm}
			>
				{renderAccountForm(editForm, handleEdit, "Update", true)}
			</FormDialog>

			{/* Delete Dialog */}
			<Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<Dialog.Portal>
					<Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
					<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
						<Dialog.Title className="text-lg font-semibold text-slate-900">
							Hapus Akun
						</Dialog.Title>
						<p className="mt-2 text-sm text-slate-600">
							Apakah Anda yakin ingin menghapus akun ini? Tindakan ini tidak
							dapat dibatalkan.
						</p>
						<div className="mt-6 flex justify-end gap-3">
							<Dialog.Close asChild>
								<Button variant="outline">Batal</Button>
							</Dialog.Close>
							<Button variant="destructive" onClick={handleDelete}>
								Hapus
							</Button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}
