"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as Dialog from "@radix-ui/react-dialog";
import {
	TrendingUp,
	TrendingDown,
	Building2,
	CreditCard,
	Receipt,
	Calculator,
	PiggyBank,
	Check,
} from "lucide-react";
import {
	formatNumberInput,
	parseFormattedNumber,
} from "@/lib/utils/utils-core";
import { getSourceLabel } from "@/lib/utils/utils-cashflow";
import { WizardModal } from "@/components/reusable/WizardModal";
import {
	Field,
	FieldLabel,
	FieldError,
} from "@/components/reusable/Field";
import { CurrencyInput } from "@/components/reusable/CurrencyInput";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";

// Transaction type definitions
export type TransactionType =
	| "pemasukan"
	| "pengeluaran"
	| "aset"
	| "hutang"
	| "piutang"
	| "ekuitas";

export type AccountType =
	| "Asset"
	| "Liability"
	| "Equity"
	| "Revenue"
	| "Expense";

interface Account {
	id: string;
	kodeAkun: string;
	namaAkun: string;
	tipeAkun: string;
	kategori?: string;
	isContra?: boolean;
}

interface TransactionButtonsProps {
	accounts: Account[];
	onSuccess?: () => void;
}

const TRANSACTION_CONFIG: Record<
	TransactionType,
	{
		label: string;
		icon: React.ReactNode;
		color: string;
		accountTypes: AccountType[];
		description: string;
	}
> = {
	pemasukan: {
		label: "Pemasukan",
		icon: <TrendingUp className="h-5 w-5" />,
		color: "bg-emerald-500",
		accountTypes: ["Revenue", "Equity"],
		description: "Pencatatan pendapatan baru",
	},
	pengeluaran: {
		label: "Pengeluaran",
		icon: <TrendingDown className="h-5 w-5" />,
		color: "bg-red-500",
		accountTypes: ["Expense"],
		description: "Pencatatan biaya/beban",
	},
	aset: {
		label: "Aset",
		icon: <Building2 className="h-5 w-5" />,
		color: "bg-blue-500",
		accountTypes: ["Asset"],
		description: "Perolehan aset baru dengan penyusutan",
	},
	hutang: {
		label: "Hutang",
		icon: <CreditCard className="h-5 w-5" />,
		color: "bg-orange-500",
		accountTypes: ["Liability"],
		description: "Pencatatan hutang dengan tenor",
	},
	piutang: {
		label: "Piutang",
		icon: <Receipt className="h-5 w-5" />,
		color: "bg-purple-500",
		accountTypes: ["Asset"],
		description: "Pencatatan piutang siswa",
	},
	ekuitas: {
		label: "Ekuitas",
		icon: <PiggyBank className="h-5 w-5" />,
		color: "bg-yellow-500",
		accountTypes: ["Equity"],
		description: "Pencatatan modal/ekuitas",
	},
};

const WIZARD_STEPS = [
	{ id: "type", title: "Pilih Jenis Transaksi" },
	{ id: "basic", title: "Informasi Dasar" },
	{ id: "detail", title: "Detail Tambahan" },
	{ id: "review", title: "Review" },
];

const baseFormSchema = z.object({
	transactionType: z.enum([
		"pemasukan",
		"pengeluaran",
		"aset",
		"hutang",
		"piutang",
		"ekuitas",
	]),
	tanggal: z.string().min(1, "Tanggal wajib diisi"),
	keterangan: z.string().min(1, "Keterangan wajib diisi"),
	kodeAkun: z.string().min(1, "Akun wajib dipilih"),
	jumlah: z
		.string()
		.min(1, "Jumlah wajib diisi")
		.refine((val) => parseFormattedNumber(val) > 0, {
			message: "Jumlah harus lebih dari 0",
		}),
	kategori: z.string().optional(),
	source: z.enum(["101", "102"]).optional().default("101"),
	namaAset: z.string().optional(),
	kategoriAset: z.string().optional(),
	lokasiAset: z.string().optional(),
	umurTeknis: z.string().optional(),
	nilaiResidu: z.string().optional(),
	isTanah: z.boolean().optional().default(false),
	tenor: z.string().optional(),
	dueDate: z.string().optional(),
	kreditur: z.string().optional(),
	studentName: z.string().optional(),
	nis: z.string().optional(),
	jenisEkuitas: z.string().optional(),
});

type FormValues = z.infer<typeof baseFormSchema>;

const asetDetailSchema = z
	.object({
		namaAset: z.string().min(1, "Nama aset wajib diisi"),
		kategoriAset: z.string().min(1, "Kategori aset wajib dipilih"),
		lokasiAset: z.string().optional(),
		isTanah: z.boolean().default(false),
		umurTeknis: z.string().optional(),
		nilaiResidu: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (!data.isTanah) {
			if (!data.umurTeknis?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Umur teknis wajib diisi",
					path: ["umurTeknis"],
				});
			}
			if (data.nilaiResidu === undefined || data.nilaiResidu === "") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Nilai residu wajib diisi",
					path: ["nilaiResidu"],
				});
			}
		}
	});

const hutangDetailSchema = z.object({
	tenor: z.string().min(1, "Tenor wajib dipilih"),
	dueDate: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
	kreditur: z.string().min(1, "Kreditur wajib diisi"),
});

const piutangDetailSchema = z.object({
	studentName: z.string().min(1, "Nama siswa wajib diisi"),
	nis: z.string().min(1, "NIS wajib diisi"),
	dueDate: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
});

const ekuitasDetailSchema = z.object({
	jenisEkuitas: z.string().min(1, "Jenis ekuitas wajib dipilih"),
});

const kategoriDetailSchema = z.object({
	kategori: z.string().min(1, "Kategori wajib dipilih"),
});

const DEFAULT_VALUES: FormValues = {
	transactionType: "pemasukan",
	tanggal: new Date().toISOString().split("T")[0],
	keterangan: "",
	kodeAkun: "",
	jumlah: "",
	kategori: "",
	source: "101",
	namaAset: "",
	kategoriAset: "",
	lokasiAset: "",
	umurTeknis: "5",
	nilaiResidu: "0",
	isTanah: false,
	tenor: "",
	dueDate: "",
	kreditur: "",
	studentName: "",
	nis: "",
	jenisEkuitas: "",
};

export function TransactionButtons({
	accounts,
	onSuccess,
}: TransactionButtonsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");

	const {
		register,
		control,
		handleSubmit,
		watch,
		setValue,
		getValues,
		trigger,
		setError,
		formState: { errors },
		reset,
	} = useForm({
		resolver: zodResolver(baseFormSchema) as never,
		defaultValues: DEFAULT_VALUES,
		mode: "onChange",
	});

	const transactionType = watch("transactionType");

	// Group accounts by type
	const accountsByType = useMemo(() => {
		const grouped: Record<AccountType, Account[]> = {
			Asset: [],
			Liability: [],
			Equity: [],
			Revenue: [],
			Expense: [],
		};
		accounts.forEach((acc) => {
			const type = acc.tipeAkun as AccountType;
			if (grouped[type]) {
				grouped[type].push(acc);
			}
		});
		return grouped;
	}, [accounts]);

	const filteredAccounts = useMemo(() => {
		const config = TRANSACTION_CONFIG[transactionType];
		if (!config) return [];
		let filtered: Account[] = [];
		config.accountTypes.forEach((accountType) => {
			filtered = [...filtered, ...accountsByType[accountType]];
		});
		return filtered;
	}, [transactionType, accountsByType]);

	const accountOptions = useMemo(
		() =>
			filteredAccounts.map((acc) => ({
				value: acc.kodeAkun,
				label: `${acc.kodeAkun} - ${acc.namaAkun}`,
				subLabel: acc.tipeAkun,
			})),
		[filteredAccounts],
	);

	const accountCategories = useMemo(() => {
		const categories = [
			...new Set(filteredAccounts.map((a) => a.kategori).filter(Boolean)),
		];
		return categories as string[];
	}, [filteredAccounts]);

	const selectedAccount = useMemo(
		() => accounts.find((a) => a.kodeAkun === watch("kodeAkun")),
		[accounts, watch("kodeAkun")],
	);

	const resetWizard = () => {
		reset(DEFAULT_VALUES);
		setCurrentStep(0);
		setSubmitError("");
	};

	const buildDoubleEntryEntries = (
		type: TransactionType,
		accountCode: string,
		amount: number,
		notes: string,
		sourceCode: string,
	): Array<{
		kodeAkun: string;
		debit: number;
		kredit: number;
		keterangan: string;
	}> => {
		const cashCode = sourceCode;

		switch (type) {
			case "pemasukan":
				return [
					{
						kodeAkun: cashCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Kas`,
					},
					{
						kodeAkun: accountCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Pendapatan`,
					},
				];
			case "pengeluaran":
				return [
					{
						kodeAkun: accountCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Beban`,
					},
					{
						kodeAkun: cashCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Kas`,
					},
				];
			case "aset":
				return [
					{
						kodeAkun: accountCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Aset`,
					},
					{
						kodeAkun: cashCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Pembayaran`,
					},
				];
			case "hutang":
				return [
					{
						kodeAkun: cashCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Penerimaan`,
					},
					{
						kodeAkun: accountCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Kewajiban`,
					},
				];
			case "piutang": {
				const revenueCode = accountsByType.Revenue[0]?.kodeAkun || "4101";
				return [
					{
						kodeAkun: accountCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Piutang`,
					},
					{
						kodeAkun: revenueCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Pendapatan`,
					},
				];
			}
			case "ekuitas":
				return [
					{
						kodeAkun: cashCode,
						debit: amount,
						kredit: 0,
						keterangan: `${notes} - Kas`,
					},
					{
						kodeAkun: accountCode,
						debit: 0,
						kredit: amount,
						keterangan: `${notes} - Ekuitas`,
					},
				];
			default:
				return [];
		}
	};

	const onSubmit = async (data: FormValues) => {
		setSubmitError("");
		setIsSubmitting(true);

		try {
			const amount = parseFormattedNumber(data.jumlah);
			if (amount <= 0) {
				setSubmitError("Jumlah harus lebih dari 0");
				setIsSubmitting(false);
				return;
			}

			const entries = buildDoubleEntryEntries(
				data.transactionType,
				data.kodeAkun,
				amount,
				data.keterangan,
				data.source,
			);

			const res = await fetch("/api/cashflow", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tanggal: data.tanggal,
					keterangan: data.keterangan,
					entries,
					transactionType: data.transactionType,
					source: data.source,
					...(data.transactionType === "aset" && {
						namaAset: data.namaAset,
						kategoriAset: data.kategoriAset,
						lokasiAset: data.lokasiAset,
						umurTeknis: parseInt(data.umurTeknis || "5"),
						nilaiResidu: parseFormattedNumber(data.nilaiResidu || "0"),
						isTanah: data.isTanah || false,
					}),
					...(data.transactionType === "hutang" && {
						tenor: parseInt(data.tenor || "12"),
						dueDate: data.dueDate,
						kreditur: data.kreditur,
					}),
					...(data.transactionType === "ekuitas" && {
						jenisEkuitas: data.jenisEkuitas,
					}),
					...(data.transactionType === "piutang" && {
						studentName: data.studentName,
						nis: data.nis,
						dueDate: data.dueDate,
					}),
					...(data.transactionType === "pemasukan" && {
						kategori: data.kategori,
					}),
					...(data.transactionType === "pengeluaran" && {
						kategori: data.kategori,
					}),
				}),
			});

			const result = await res.json();

			if (result.success) {
				toast.success("Transaksi berhasil disimpan");
				setIsOpen(false);
				resetWizard();
				onSuccess?.();
			} else {
				setSubmitError(result.error?.message || "Gagal menyimpan transaksi");
			}
		} catch (err) {
			setSubmitError("Terjadi kesalahan saat menyimpan");
		} finally {
			setIsSubmitting(false);
		}
	};

	const validateCurrentStep = async (): Promise<boolean> => {
		if (currentStep === 0) {
			return trigger("transactionType");
		}
		if (currentStep === 1) {
			return trigger(["tanggal", "keterangan", "kodeAkun", "jumlah"]);
		}
		if (currentStep === 2) {
			const values = getValues();
			let result: z.SafeParseReturnType<unknown, unknown> | null = null;
			switch (values.transactionType) {
				case "aset":
					result = asetDetailSchema.safeParse(values);
					break;
				case "hutang":
					result = hutangDetailSchema.safeParse(values);
					break;
				case "piutang":
					result = piutangDetailSchema.safeParse(values);
					break;
				case "ekuitas":
					result = ekuitasDetailSchema.safeParse(values);
					break;
				case "pemasukan":
				case "pengeluaran":
					result = kategoriDetailSchema.safeParse(values);
					break;
				default:
					return true;
			}

			if (result && !result.success) {
				result.error.issues.forEach((issue) => {
					const path = issue.path[0] as keyof FormValues;
					setError(path, { type: "manual", message: issue.message });
				});
				return false;
			}
			return true;
		}
		return true;
	};

	const handleNext = async () => {
		if (currentStep === WIZARD_STEPS.length - 1) {
			await handleSubmit(onSubmit)();
			return;
		}

		const isValid = await validateCurrentStep();
		if (isValid) {
			setCurrentStep((prev) => prev + 1);
		}
	};

	const handleBack = () => {
		setCurrentStep((prev) => Math.max(0, prev - 1));
	};

	const formatCurrency = (value: string) => {
		const num = parseFormattedNumber(value);
		return `Rp ${num.toLocaleString("id-ID")}`;
	};

	const renderTypeStep = () => (
		<div className="space-y-4">
			<p className="text-sm text-slate-500 text-center">
				Pilih jenis transaksi yang ingin dicatat
			</p>
			<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
				{(Object.keys(TRANSACTION_CONFIG) as TransactionType[]).map(
					(type) => {
						const config = TRANSACTION_CONFIG[type];
						const isSelected = transactionType === type;
						return (
							<button
								key={type}
								type="button"
								onClick={() => setValue("transactionType", type)}
								className={`relative flex flex-col items-center justify-center gap-2 rounded-full px-4 py-4 border-2 transition-all ${
									isSelected
										? "border-[#059DEA] bg-[#059DEA]/10 text-[#059DEA]"
										: "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
								}`}
							>
								<div
									className={`p-2.5 rounded-full ${
										isSelected ? "bg-[#059DEA] text-white" : `${config.color} text-white`
									}`}
								>
									{config.icon}
								</div>
								<span className="font-medium text-sm">
									{config.label}
								</span>
								{isSelected && (
									<span className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-[#059DEA] text-white rounded-full p-0.5">
										<Check className="h-3 w-3" />
									</span>
								)}
							</button>
						);
					},
				)}
			</div>
			<FieldError
				errors={errors.transactionType ? [{ message: errors.transactionType.message }] : []}
				className="text-center"
			/>
		</div>
	);

	const renderBasicStep = () => (
		<div className="space-y-4">
			<Field data-invalid={!!errors.tanggal}>
				<FieldLabel>Tanggal</FieldLabel>
				<Input
					type="date"
					{...register("tanggal")}
				/>
				<FieldError
					errors={errors.tanggal ? [{ message: errors.tanggal.message }] : []}
				/>
			</Field>

			<Field data-invalid={!!errors.keterangan}>
				<FieldLabel>Keterangan</FieldLabel>
				<Input
					{...register("keterangan")}
					placeholder={`Contoh: Pembayaran ${TRANSACTION_CONFIG[transactionType].label}`}
				/>
				<FieldError
					errors={
						errors.keterangan ? [{ message: errors.keterangan.message }] : []
					}
				/>
			</Field>

			<Field data-invalid={!!errors.kodeAkun}>
				<FieldLabel>Sumber/Akun</FieldLabel>
				<Controller
					name="kodeAkun"
					control={control}
					render={({ field }) => (
						<SearchableSelect
							options={accountOptions}
							value={field.value}
							onChange={field.onChange}
							placeholder="Pilih akun"
							searchPlaceholder="Cari akun..."
							emptyMessage="Tidak ada akun tersedia"
						/>
					)}
				/>
				<FieldError
					errors={
						errors.kodeAkun ? [{ message: errors.kodeAkun.message }] : []
					}
				/>
			</Field>

			<Field data-invalid={!!errors.jumlah}>
				<FieldLabel>Jumlah (Rp)</FieldLabel>
				<Controller
					name="jumlah"
					control={control}
					render={({ field }) => (
						<CurrencyInput
							value={field.value}
							onChange={field.onChange}
							placeholder="0"
						/>
					)}
				/>
				<FieldError
					errors={errors.jumlah ? [{ message: errors.jumlah.message }] : []}
				/>
			</Field>

			<Field data-invalid={!!errors.source}>
				<FieldLabel>Sumber Dana</FieldLabel>
				<Controller
					name="source"
					control={control}
					render={({ field }) => (
						<select
							className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
							value={field.value}
							onChange={field.onChange}
						>
							<option value="101">101 - Kas</option>
							<option value="102">102 - Bank</option>
						</select>
					)}
				/>
				<FieldError
					errors={errors.source ? [{ message: errors.source.message }] : []}
				/>
			</Field>
		</div>
	);

	const renderDetailStep = () => {
		switch (transactionType) {
			case "aset":
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-blue-700">
							<Calculator className="h-4 w-4" />
							<span className="font-medium text-sm">Detail Aset</span>
						</div>

						<Field data-invalid={!!errors.namaAset}>
							<FieldLabel>Nama Aset</FieldLabel>
							<Input
								{...register("namaAset")}
								placeholder="Contoh: Laptop ASUS VivoBook"
							/>
							<FieldError
								errors={
									errors.namaAset
										? [{ message: errors.namaAset.message }]
										: []
								}
							/>
						</Field>

						<Field data-invalid={!!errors.kategoriAset}>
							<FieldLabel>Kategori Aset</FieldLabel>
							<select
								className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
								{...register("kategoriAset")}
							>
								<option value="">Pilih kategori</option>
								<option value="Peralatan">Peralatan</option>
								<option value="Kendaraan">Kendaraan</option>
								<option value="Bangunan">Bangunan</option>
								<option value="Tanah">Tanah</option>
								<option value="Inventaris">Inventaris</option>
							</select>
							<FieldError
								errors={
									errors.kategoriAset
										? [{ message: errors.kategoriAset.message }]
										: []
								}
							/>
						</Field>

						<Field>
							<FieldLabel>Lokasi</FieldLabel>
							<Input
								{...register("lokasiAset")}
								placeholder="Contoh: Ruang TK A"
							/>
						</Field>

						<Field orientation="horizontal">
							<FieldLabel className="font-normal">
								Tanah (Tidak Disusutkan)
							</FieldLabel>
							<input
								type="checkbox"
								{...register("isTanah")}
								className="h-4 w-4 rounded border-gray-300"
							/>
						</Field>

						{!watch("isTanah") && (
							<div className="grid grid-cols-2 gap-4">
								<Field data-invalid={!!errors.umurTeknis}>
									<FieldLabel>Umur Teknis (Tahun)</FieldLabel>
									<select
										className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
										{...register("umurTeknis")}
									>
										<option value="1">1 Tahun</option>
										<option value="2">2 Tahun</option>
										<option value="3">3 Tahun</option>
										<option value="4">4 Tahun</option>
										<option value="5">5 Tahun</option>
										<option value="10">10 Tahun</option>
										<option value="15">15 Tahun</option>
										<option value="20">20 Tahun</option>
									</select>
									<FieldError
										errors={
											errors.umurTeknis
												? [{ message: errors.umurTeknis.message }]
												: []
										}
									/>
								</Field>

								<Field data-invalid={!!errors.nilaiResidu}>
									<FieldLabel>Nilai Residu (Rp)</FieldLabel>
									<Controller
										name="nilaiResidu"
										control={control}
										render={({ field }) => (
											<CurrencyInput
												value={field.value || "0"}
												onChange={field.onChange}
												placeholder="0"
											/>
										)}
									/>
									<FieldError
										errors={
											errors.nilaiResidu
												? [{ message: errors.nilaiResidu.message }]
												: []
										}
									/>
								</Field>
							</div>
						)}

						{watch("jumlah") && watch("umurTeknis") && !watch("isTanah") && (
							<div className="bg-blue-50 p-3 rounded-lg text-sm">
								<p className="font-medium text-blue-700">
									Estimasi Penyusutan:
								</p>
								<p className="text-blue-600">
									{`Rp ${(
										(parseFormattedNumber(watch("jumlah")) -
											parseFormattedNumber(watch("nilaiResidu") || "0")) /
										parseInt(watch("umurTeknis") || "1")
									).toLocaleString("id-ID")} / tahun`}
								</p>
							</div>
						)}
					</div>
				);
			case "hutang":
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-orange-700">
							<CreditCard className="h-4 w-4" />
							<span className="font-medium text-sm">Detail Hutang</span>
						</div>

						<Field data-invalid={!!errors.kreditur}>
							<FieldLabel>Kreditur / Penyedia</FieldLabel>
							<Input
								{...register("kreditur")}
								placeholder="Contoh: Bank BCA, Supplier ABC"
							/>
							<FieldError
								errors={
									errors.kreditur
										? [{ message: errors.kreditur.message }]
										: []
								}
							/>
						</Field>

						<div className="grid grid-cols-2 gap-4">
							<Field data-invalid={!!errors.tenor}>
								<FieldLabel>Tenor (Bulan)</FieldLabel>
								<select
									className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
									{...register("tenor")}
								>
									<option value="">Pilih tenor</option>
									<option value="1">1 Bulan</option>
									<option value="3">3 Bulan</option>
									<option value="6">6 Bulan</option>
									<option value="12">12 Bulan</option>
									<option value="18">18 Bulan</option>
									<option value="24">24 Bulan</option>
									<option value="36">36 Bulan</option>
								</select>
								<FieldError
									errors={
										errors.tenor
											? [{ message: errors.tenor.message }]
											: []
									}
								/>
							</Field>

							<Field data-invalid={!!errors.dueDate}>
								<FieldLabel>Tanggal Jatuh Tempo</FieldLabel>
								<Input type="date" {...register("dueDate")} />
								<FieldError
									errors={
										errors.dueDate
											? [{ message: errors.dueDate.message }]
											: []
									}
								/>
							</Field>
						</div>

						{watch("jumlah") && watch("tenor") && (
							<div className="bg-orange-50 p-3 rounded-lg text-sm">
								<p className="font-medium text-orange-700">
									Rincian Kewajiban:
								</p>
								<p className="text-orange-600">
									{`Total: ${formatCurrency(watch("jumlah"))}`}
								</p>
								<p className="text-orange-600">
									{`Cicilan per bulan: Rp ${(
										parseFormattedNumber(watch("jumlah")) /
										parseInt(watch("tenor") || "1")
									).toLocaleString("id-ID")}`}
								</p>
							</div>
						)}
					</div>
				);
			case "piutang":
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-purple-700">
							<Receipt className="h-4 w-4" />
							<span className="font-medium text-sm">Detail Piutang</span>
						</div>

						<Field data-invalid={!!errors.studentName}>
							<FieldLabel>Nama Siswa</FieldLabel>
							<Input
								{...register("studentName")}
								placeholder="Nama siswa"
							/>
							<FieldError
								errors={
									errors.studentName
										? [{ message: errors.studentName.message }]
										: []
								}
							/>
						</Field>

						<Field data-invalid={!!errors.nis}>
							<FieldLabel>NIS Siswa</FieldLabel>
							<Input
								{...register("nis")}
								placeholder="Nomor Induk Siswa"
							/>
							<FieldError
								errors={
									errors.nis ? [{ message: errors.nis.message }] : []
								}
							/>
						</Field>

						<Field data-invalid={!!errors.dueDate}>
							<FieldLabel>Tanggal Jatuh Tempo</FieldLabel>
							<Input type="date" {...register("dueDate")} />
							<FieldError
								errors={
									errors.dueDate
										? [{ message: errors.dueDate.message }]
										: []
								}
							/>
						</Field>
					</div>
				);
			case "ekuitas":
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-yellow-700">
							<PiggyBank className="h-4 w-4" />
							<span className="font-medium text-sm">Detail Ekuitas</span>
						</div>

						<Field data-invalid={!!errors.jenisEkuitas}>
							<FieldLabel>Jenis Ekuitas</FieldLabel>
							<select
								className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
								{...register("jenisEkuitas")}
							>
								<option value="">Pilih jenis</option>
								<option value="Modal">Modal</option>
								<option value="Saldo Berjalan">Saldo Berjalan</option>
								<option value="Laba Tahun Berjalan">
									Laba Tahun Berjalan
								</option>
								<option value="Saldo Awal">Saldo Awal</option>
							</select>
							<FieldError
								errors={
									errors.jenisEkuitas
										? [{ message: errors.jenisEkuitas.message }]
										: []
								}
							/>
						</Field>
					</div>
				);
			case "pemasukan":
			case "pengeluaran":
				return (
					<div className="space-y-4">
						<Field data-invalid={!!errors.kategori}>
							<FieldLabel>Kategori</FieldLabel>
							<select
								className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
								{...register("kategori")}
							>
								<option value="">Pilih kategori</option>
								{accountCategories.map((cat) => (
									<option key={cat} value={cat}>
										{cat}
									</option>
								))}
							</select>
							<FieldError
								errors={
									errors.kategori
										? [{ message: errors.kategori.message }]
										: []
								}
							/>
						</Field>
					</div>
				);
			default:
				return null;
		}
	};

	const renderReviewStep = () => {
		const values = getValues();
		return (
			<div className="space-y-4">
				<h3 className="font-medium text-slate-900">Ringkasan Transaksi</h3>
				<div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
					<div className="flex justify-between">
						<span className="text-gray-500">Jenis</span>
						<span className="font-medium">
							{TRANSACTION_CONFIG[values.transactionType].label}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-500">Tanggal</span>
						<span className="font-medium">{values.tanggal}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-500">Keterangan</span>
						<span className="font-medium text-right max-w-[60%]">
							{values.keterangan}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-500">Akun</span>
						<span className="font-medium text-right max-w-[60%]">
							{selectedAccount
								? `${selectedAccount.kodeAkun} - ${selectedAccount.namaAkun}`
								: values.kodeAkun}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-500">Jumlah</span>
						<span className="font-medium">{formatCurrency(values.jumlah)}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-500">Sumber Dana</span>
						<span className="font-medium">
							{values.source} - {getSourceLabel(values.source)}
						</span>
					</div>

					{values.transactionType === "aset" && (
						<>
							<div className="border-t border-gray-200 pt-2 flex justify-between">
								<span className="text-gray-500">Nama Aset</span>
								<span className="font-medium">{values.namaAset}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">Kategori Aset</span>
								<span className="font-medium">{values.kategoriAset}</span>
							</div>
							{values.lokasiAset && (
								<div className="flex justify-between">
									<span className="text-gray-500">Lokasi</span>
									<span className="font-medium">{values.lokasiAset}</span>
								</div>
							)}
							<div className="flex justify-between">
								<span className="text-gray-500">Tanah</span>
								<span className="font-medium">
									{values.isTanah ? "Ya" : "Tidak"}
								</span>
							</div>
							{!values.isTanah && (
								<>
									<div className="flex justify-between">
										<span className="text-gray-500">Umur Teknis</span>
										<span className="font-medium">
											{values.umurTeknis} Tahun
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-500">Nilai Residu</span>
										<span className="font-medium">
											{formatCurrency(values.nilaiResidu || "0")}
										</span>
									</div>
								</>
							)}
						</>
					)}

					{values.transactionType === "hutang" && (
						<>
							<div className="border-t border-gray-200 pt-2 flex justify-between">
								<span className="text-gray-500">Kreditur</span>
								<span className="font-medium">{values.kreditur}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">Tenor</span>
								<span className="font-medium">{values.tenor} Bulan</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">Jatuh Tempo</span>
								<span className="font-medium">{values.dueDate}</span>
							</div>
						</>
					)}

					{values.transactionType === "piutang" && (
						<>
							<div className="border-t border-gray-200 pt-2 flex justify-between">
								<span className="text-gray-500">Nama Siswa</span>
								<span className="font-medium">{values.studentName}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">NIS</span>
								<span className="font-medium">{values.nis}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">Jatuh Tempo</span>
								<span className="font-medium">{values.dueDate}</span>
							</div>
						</>
					)}

					{values.transactionType === "ekuitas" && (
						<div className="border-t border-gray-200 pt-2 flex justify-between">
							<span className="text-gray-500">Jenis Ekuitas</span>
							<span className="font-medium">{values.jenisEkuitas}</span>
						</div>
					)}

					{(values.transactionType === "pemasukan" ||
						values.transactionType === "pengeluaran") && (
						<div className="border-t border-gray-200 pt-2 flex justify-between">
							<span className="text-gray-500">Kategori</span>
							<span className="font-medium">{values.kategori}</span>
						</div>
					)}
				</div>

				{submitError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{submitError}
					</div>
				)}
			</div>
		);
	};

	const renderStepContent = () => {
		switch (currentStep) {
			case 0:
				return renderTypeStep();
			case 1:
				return renderBasicStep();
			case 2:
				return renderDetailStep();
			case 3:
				return renderReviewStep();
			default:
				return null;
		}
	};

	return (
		<>
			<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
				<Dialog.Trigger asChild>
					<Button className="bg-[#059DEA] hover:bg-[#0480c4] text-white flex items-center gap-2">
						<span className="hidden sm:inline">Tambah Transaksi</span>
						<span className="sm:hidden">Tambah</span>
					</Button>
				</Dialog.Trigger>
			</Dialog.Root>

			<WizardModal
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) {
						resetWizard();
					}
					setIsOpen(open);
				}}
				title="Tambah Transaksi"
				description={TRANSACTION_CONFIG[transactionType].description}
				steps={WIZARD_STEPS}
				currentStep={currentStep}
				onNext={handleNext}
				onBack={handleBack}
				isBackDisabled={currentStep === 0}
				isSubmitting={isSubmitting}
			>
				<form id="transaction-wizard-form" onSubmit={handleSubmit(onSubmit)}>
					{renderStepContent()}
				</form>
			</WizardModal>
		</>
	);
}
