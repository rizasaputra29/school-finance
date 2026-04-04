"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Building2,
  CreditCard,
  Receipt,
  Calculator,
  PiggyBank,
} from "lucide-react";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils";

// Transaction type definitions
export type TransactionType =
  | "pemasukan"
  | "pengeluaran"
  | "aset"
  | "hutang"
  | "piutang"
  | "ekuitas";

export type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

interface Account {
  id: string;
  kodeAkun: string;
  namaAkun: string;
  tipeAkun: string;
  kategori?: string;
  isContra?: boolean;
}

interface TransactionFormData {
  tanggal: string;
  keterangan: string;
  kodeAkun: string;
  jumlah: string;
  // Asset specific
  namaAset?: string;
  kategoriAset?: string;
  lokasiAset?: string;
  umurTeknis?: string;
  nilaiResidu?: string;
  isTanah?: boolean;
  // Debt specific
  tenor?: string;
  dueDate?: string;
  kreditur?: string;
  // Equity specific
  jenisEkuitas?: string;
  // Piutang specific
  studentName?: string;
  nis?: string;
}

const INITIAL_FORM: TransactionFormData = {
  tanggal: new Date().toISOString().split("T")[0],
  keterangan: "",
  kodeAkun: "",
  jumlah: "",
  umurTeknis: "5",
  nilaiResidu: "0",
};

// Transaction type configuration
const TRANSACTION_CONFIG: Record<
  TransactionType,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    accountTypes: AccountType[];
    description: string;
    hasSpecialOptions: boolean;
  }
> = {
  pemasukan: {
    label: "Pendapatan",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "bg-emerald-500",
    accountTypes: ["Revenue", "Equity"],
    description: "Pencatatan pendapatan baru",
    hasSpecialOptions: false,
  },
  pengeluaran: {
    label: "Beban",
    icon: <TrendingDown className="h-5 w-5" />,
    color: "bg-red-500",
    accountTypes: ["Expense"],
    description: "Pencatatan biaya/beban",
    hasSpecialOptions: false,
  },
  aset: {
    label: "Aset",
    icon: <Building2 className="h-5 w-5" />,
    color: "bg-blue-500",
    accountTypes: ["Asset"],
    description: "Perolehan aset baru dengan penyusutan",
    hasSpecialOptions: true,
  },
  hutang: {
    label: "Kewajiban",
    icon: <CreditCard className="h-5 w-5" />,
    color: "bg-orange-500",
    accountTypes: ["Liability"],
    description: "Pencatatan hutang dengan tenor",
    hasSpecialOptions: true,
  },
  piutang: {
    label: "Piutang",
    icon: <Receipt className="h-5 w-5" />,
    color: "bg-purple-500",
    accountTypes: ["Asset"],
    description: "Pencatatan piutang siswa",
    hasSpecialOptions: true,
  },
  ekuitas: {
    label: "Ekuitas",
    icon: <PiggyBank className="h-5 w-5" />,
    color: "bg-yellow-500",
    accountTypes: ["Equity"],
    description: "Pencatatan modal/ekuitas",
    hasSpecialOptions: true,
  },
};

interface TransactionButtonsProps {
  accounts: Account[];
  onSuccess?: () => void;
}

export function TransactionButtons({ accounts, onSuccess }: TransactionButtonsProps) {
  const [openType, setOpenType] = useState<TransactionType | null>(null);
  const [isMainModalOpen, setIsMainModalOpen] = useState(false);
  const [formData, setFormData] = useState<TransactionFormData>(INITIAL_FORM);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

  const getFilteredAccounts = (type: TransactionType): Account[] => {
    const config = TRANSACTION_CONFIG[type];
    let filtered: Account[] = [];
    
    config.accountTypes.forEach((accountType) => {
      filtered = [...filtered, ...accountsByType[accountType]];
    });
    
    if (selectedCategory) {
      filtered = filtered.filter((acc) => acc.kategori === selectedCategory);
    }
    
    return filtered;
  };

  const getCategories = (type: TransactionType): string[] => {
    const accounts = getFilteredAccounts(type);
    const categories = [...new Set(accounts.map((a) => a.kategori).filter(Boolean))];
    return categories as string[];
  };

  const handleSubmit = async (type: TransactionType) => {
    setError("");
    setIsLoading(true);

    try {
      const amount = parseFormattedNumber(formData.jumlah);
      if (amount <= 0) {
        setError("Jumlah harus lebih dari 0");
        setIsLoading(false);
        return;
      }

      const entries = buildDoubleEntryEntries(type, formData.kodeAkun, amount);

      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal: formData.tanggal,
          keterangan: formData.keterangan,
          entries,
          transactionType: type,
          ...(type === "aset" && {
            namaAset: formData.namaAset,
            kategoriAset: formData.kategoriAset,
            lokasiAset: formData.lokasiAset,
            umurTeknis: parseInt(formData.umurTeknis || "5"),
            nilaiResidu: parseFormattedNumber(formData.nilaiResidu || "0"),
            isTanah: formData.isTanah || false,
          }),
          ...(type === "hutang" && {
            tenor: parseInt(formData.tenor || "12"),
            dueDate: formData.dueDate,
            kreditur: formData.kreditur,
          }),
          ...(type === "ekuitas" && {
            jenisEkuitas: formData.jenisEkuitas,
          }),
          ...(type === "piutang" && {
            studentName: formData.studentName,
            nis: formData.nis,
            dueDate: formData.dueDate,
          }),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          setIsMainModalOpen(false);
          setOpenType(null);
          setFormData(INITIAL_FORM);
          setSelectedCategory("");
          setSuccess(false);
          onSuccess?.();
        }, 1500);
      } else {
        setError(data.error || "Gagal menyimpan transaksi");
      }
    } catch (err) {
      console.error("Transaction error:", err);
      setError("Terjadi kesalahan saat menyimpan");
    } finally {
      setIsLoading(false);
    }
  };

  const buildDoubleEntryEntries = (
    type: TransactionType,
    accountCode: string,
    amount: number
  ): Array<{ kodeAkun: string; debit: number; kredit: number; keterangan: string }> => {
    const cashAccount = accounts.find(
      (a) => a.tipeAkun === "Asset" && a.kategori?.toLowerCase().includes("kas")
    );
    const cashCode = cashAccount?.kodeAkun || "101";

    switch (type) {
      case "pemasukan":
        return [
          { kodeAkun: cashCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Kas` },
          { kodeAkun: accountCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Pendapatan` },
        ];
      case "pengeluaran":
        return [
          { kodeAkun: accountCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Beban` },
          { kodeAkun: cashCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Kas` },
        ];
      case "aset":
        return [
          { kodeAkun: accountCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Aset` },
          { kodeAkun: cashCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Pembayaran` },
        ];
      case "hutang":
        return [
          { kodeAkun: cashCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Penerimaan` },
          { kodeAkun: accountCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Kewajiban` },
        ];
      case "piutang":
        const revenueCode = accountsByType.Revenue[0]?.kodeAkun || "4101";
        return [
          { kodeAkun: accountCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Piutang` },
          { kodeAkun: revenueCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Pendapatan` },
        ];
      case "ekuitas":
        return [
          { kodeAkun: cashCode, debit: amount, kredit: 0, keterangan: `${formData.keterangan} - Kas` },
          { kodeAkun: accountCode, debit: 0, kredit: amount, keterangan: `${formData.keterangan} - Ekuitas` },
        ];
      default:
        return [];
    }
  };

  const renderForm = (type: TransactionType) => {
    const config = TRANSACTION_CONFIG[type];
    const filteredAccounts = getFilteredAccounts(type);
    const categories = getCategories(type);
    const selectedAccount = accounts.find((a) => a.kodeAkun === formData.kodeAkun);

    return (
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600">Transaksi berhasil disimpan!</div>}

        <div className="space-y-2">
          <Label htmlFor="tanggal">Tanggal</Label>
          <Input id="tanggal" type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="keterangan">Keterangan</Label>
          <Input id="keterangan" value={formData.keterangan} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} placeholder={`Contoh: Pembayaran ${config.label}`} required />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <Label>Kategori</Label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat} value={cat!}>{cat}</option>
              ))}
            </select>
          </div>
        )}

        {/* Account Selection */}
        <div className="space-y-2">
          <Label>Pilih Akun {config.accountTypes.join(", ")}</Label>
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-lg p-2">
            {filteredAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setFormData({ ...formData, kodeAkun: acc.kodeAkun })}
                className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                  formData.kodeAkun === acc.kodeAkun ? "bg-blue-100 border-blue-300 border" : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div>
                  <span className="font-mono font-medium">{acc.kodeAkun}</span>
                  <span className="ml-2 text-sm">{acc.namaAkun}</span>
                </div>
                <Badge variant="outline" className="text-xs">{acc.tipeAkun}</Badge>
              </button>
            ))}
            {filteredAccounts.length === 0 && <p className="text-center text-gray-500 py-4">Tidak ada akun tersedia</p>}
          </div>
          {formData.kodeAkun && selectedAccount && (
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-blue-100 text-blue-700">{selectedAccount.kodeAkun} - {selectedAccount.namaAkun}</Badge>
              <button type="button" onClick={() => setFormData({ ...formData, kodeAkun: "" })} className="text-xs text-red-500 hover:text-red-700">✕</button>
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="jumlah">Jumlah (Rp)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
            <Input id="jumlah" value={formData.jumlah} onChange={(e) => setFormData({ ...formData, jumlah: formatNumberInput(e.target.value) })} placeholder="0" className="pl-10" required />
          </div>
        </div>

        {/* ========== ASET OPTIONS - PENYUSUTAN ========== */}
        {type === "aset" && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Calculator className="h-4 w-4" />
              <span className="font-medium text-sm">Option Penyusutan</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="namaAset">Nama Aset</Label>
              <Input id="namaAset" value={formData.namaAset || ""} onChange={(e) => setFormData({ ...formData, namaAset: e.target.value })} placeholder="Contoh: Laptop ASUS VivoBook" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kategoriAset">Kategori Aset</Label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={formData.kategoriAset || ""}
                onChange={(e) => setFormData({ ...formData, kategoriAset: e.target.value })}
              >
                <option value="">Pilih kategori</option>
                <option value="Peralatan">Peralatan</option>
                <option value="Kendaraan">Kendaraan</option>
                <option value="Bangunan">Bangunan</option>
                <option value="Tanah">Tanah</option>
                <option value="Inventaris">Inventaris</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lokasiAset">Lokasi</Label>
              <Input id="lokasiAset" value={formData.lokasiAset || ""} onChange={(e) => setFormData({ ...formData, lokasiAset: e.target.value })} placeholder="Contoh: Ruang TK A" />
            </div>

            {/* Tanah Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isTanah"
                checked={formData.isTanah || false}
                onChange={(e) => setFormData({ ...formData, isTanah: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isTanah" className="text-sm font-normal">Tanah (Tidak_DISUSUTKAN)</Label>
            </div>

            {!formData.isTanah && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="umurTeknis">Umur Teknis (Tahun)</Label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={formData.umurTeknis}
                    onChange={(e) => setFormData({ ...formData, umurTeknis: e.target.value })}
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
                  <p className="text-xs text-gray-500">Penyusutan per tahun</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nilaiResidu">Nilai Residu (Rp)</Label>
                  <Input id="nilaiResidu" value={formData.nilaiResidu || "0"} onChange={(e) => setFormData({ ...formData, nilaiResidu: formatNumberInput(e.target.value) })} placeholder="0" />
                  <p className="text-xs text-gray-500">Nilai akhir setelah penyusutan</p>
                </div>
              </div>
            )}

            {formData.jumlah && formData.umurTeknis && !formData.isTanah && (
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-blue-700">Estimasi Penyusutan:</p>
                <p className="text-blue-600">
                  Rp {((parseFormattedNumber(formData.jumlah) - parseFormattedNumber(formData.nilaiResidu || "0")) / parseInt(formData.umurTeknis)).toLocaleString("id-ID")} / tahun
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========== KEWAJIBAN OPTIONS - TENOR & JATUH TEMPO ========== */}
        {type === "hutang" && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-orange-700">
              <CreditCard className="h-4 w-4" />
              <span className="font-medium text-sm">Option Kewajiban (Hutang)</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kreditur">Kreditur / Penyedia</Label>
              <Input id="kreditur" value={formData.kreditur || ""} onChange={(e) => setFormData({ ...formData, kreditur: e.target.value })} placeholder="Contoh: Bank BCA, Supplier ABC" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tenor">Tenor (Bulan)</Label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={formData.tenor}
                  onChange={(e) => setFormData({ ...formData, tenor: e.target.value })}
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Tanggal Jatuh Tempo</Label>
                <Input id="dueDate" type="date" value={formData.dueDate || ""} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
              </div>
            </div>

            {formData.jumlah && formData.tenor && (
              <div className="bg-orange-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-orange-700">Rincian Kewajiban:</p>
                <p className="text-orange-600">Total: Rp {parseFormattedNumber(formData.jumlah).toLocaleString("id-ID")}</p>
                <p className="text-orange-600">Cicilan per bulan: Rp {(parseFormattedNumber(formData.jumlah) / parseInt(formData.tenor)).toLocaleString("id-ID")}</p>
              </div>
            )}
          </div>
        )}

        {/* ========== PIUTANG OPTIONS ========== */}
        {type === "piutang" && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-purple-700">
              <Receipt className="h-4 w-4" />
              <span className="font-medium text-sm">Option Piutang</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="studentName">Nama Siswa</Label>
              <Input id="studentName" value={formData.studentName || ""} onChange={(e) => setFormData({ ...formData, studentName: e.target.value })} placeholder="Nama siswa" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nis">NIS Siswa</Label>
              <Input id="nis" value={formData.nis || ""} onChange={(e) => setFormData({ ...formData, nis: e.target.value })} placeholder="Nomor Induk Siswa" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="piutangDueDate">Jatuh Tempo</Label>
              <Input id="piutangDueDate" type="date" value={formData.dueDate || ""} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
            </div>
          </div>
        )}

        {/* ========== EKUITAS OPTIONS ========== */}
        {type === "ekuitas" && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-yellow-700">
              <PiggyBank className="h-4 w-4" />
              <span className="font-medium text-sm">Option Ekuitas</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jenisEkuitas">Jenis Ekuitas</Label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={formData.jenisEkuitas || ""}
                onChange={(e) => setFormData({ ...formData, jenisEkuitas: e.target.value })}
              >
                <option value="">Pilih jenis</option>
                <option value="Modal">Modal</option>
                <option value="Saldo Berjalan">Saldo Berjalan</option>
                <option value="Laba Tahun Berjalan">Laba Tahun Berjalan</option>
                <option value="Saldo Awal">Saldo Awal</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={() => setOpenType(null)}>
            Kembali
          </Button>
          <Button onClick={() => handleSubmit(type)} disabled={isLoading || !formData.kodeAkun || !formData.jumlah}>
            {isLoading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog.Root
      open={openType !== null || isMainModalOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsMainModalOpen(false);
          setOpenType(null);
          setFormData(INITIAL_FORM);
          setSelectedCategory("");
          setError("");
        } else {
          setIsMainModalOpen(true);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button className="bg-[#059DEA] hover:bg-[#0480c4] text-white flex items-center gap-2">
          <span className="hidden sm:inline">Tambah Transaksi</span>
          <span className="sm:hidden">Tambah</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          {openType === null ? (
            <>
              <Dialog.Title className="text-lg font-semibold mb-4 text-center">
                Pilih Jenis Transaksi
              </Dialog.Title>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(TRANSACTION_CONFIG) as TransactionType[]).map((type) => {
                  const config = TRANSACTION_CONFIG[type];
                  return (
                    <button
                      key={type}
                      onClick={() => setOpenType(type)}
                      className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all gap-3"
                    >
                      <div className={`p-3 rounded-xl ${config.color} text-white`}>
                        {config.icon}
                      </div>
                      <span className="font-medium text-sm text-gray-700">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TRANSACTION_CONFIG[openType].color} text-white`}>
                  {TRANSACTION_CONFIG[openType].icon}
                </span>
                {TRANSACTION_CONFIG[openType].label}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500 mb-4">
                {TRANSACTION_CONFIG[openType].description}
              </Dialog.Description>
              {renderForm(openType)}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}