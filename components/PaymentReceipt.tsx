"use client";

import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface PaymentReceiptProps {
	studentName: string;
	studentNis: string;
	studentKelas: string;
	billingType: string;
	period: string;
	amount: number;
	paymentDate: string;
	paymentMethod?: string;
	note?: string;
	reference?: string;
}

function formatRupiah(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

function terbilang(amount: number): string {
	const ones = [
		"",
		"Satu",
		"Dua",
		"Tiga",
		"Empat",
		"Lima",
		"Enam",
		"Tujuh",
		"Delapan",
		"Sembilan",
		"Sepuluh",
		"Sebelas",
	];
	const tens = [
		"",
		"",
		"Dua Puluh",
		"Tiga Puluh",
		"Empat Puluh",
		"Lima Puluh",
		"Enam Puluh",
		"Tujuh Puluh",
		"Delapan Puluh",
		"Sembilan Puluh",
	];

	if (amount === 0) return "Nol Rupiah";

	let result = "";
	let num = Math.floor(amount);

	if (num >= 1000000000) {
		const billions = Math.floor(num / 1000000000);
		result += terbilang(billions) + " Miliar ";
		num %= 1000000000;
	}
	if (num >= 1000000) {
		const millions = Math.floor(num / 1000000);
		result += terbilang(millions) + " Juta ";
		num %= 1000000;
	}
	if (num >= 1000) {
		const thousands = Math.floor(num / 1000);
		if (thousands === 1) {
			result += "Seribu ";
		} else {
			result += terbilang(thousands) + " Ribu ";
		}
		num %= 1000;
	}
	if (num >= 100) {
		const hundreds = Math.floor(num / 100);
		if (hundreds === 1) {
			result += "Seratus ";
		} else {
			result += ones[hundreds] + " Ratus ";
		}
		num %= 100;
	}
	if (num >= 20) {
		result += tens[Math.floor(num / 10)] + " ";
		num %= 10;
	}
	if (num >= 10) {
		if (num === 10) {
			result += "Sepuluh ";
		} else if (num === 11) {
			result += "Sebelas ";
		} else {
			result += ones[num] + " Belas ";
		}
		num = 0;
	}
	if (num > 0) {
		result += ones[num] + " ";
	}

	return result.trim() + " Rupiah";
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export default function PaymentReceipt({
	studentName,
	studentNis,
	studentKelas,
	billingType,
	period,
	amount,
	paymentDate,
	paymentMethod = "Cash",
	note,
	reference,
}: PaymentReceiptProps) {
	const componentId = useId();
	const receiptNo = useMemo(() => {
		if (reference) return reference;
		const d = new Date(paymentDate);
		const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
		return `RCP-${datePart}-${componentId.replace(/:/g, "").slice(0, 8).toUpperCase()}`;
	}, [reference, paymentDate, componentId]);

	const methodLabels: Record<string, string> = {
		Cash: "Kas Tunai",
		Bank: "Bank",
		Transfer: "Transfer Bank",
	};

	return (
		<>
			<style>{`
				@media print {
					body * {
						visibility: hidden;
					}
					#print-receipt,
					#print-receipt * {
						visibility: visible;
					}
					#print-receipt {
						position: absolute;
						left: 0;
						top: 0;
						width: 100%;
						padding: 20px;
						background: white !important;
					}
					.no-print {
						display: none !important;
					}
				}
			`}</style>

			<div className="no-print mb-4 flex justify-end">
				<Button onClick={() => window.print()} variant="outline" size="sm">
					<Printer className="h-4 w-4 mr-2" />
					Cetak Struk
				</Button>
			</div>

			<div
				id="print-receipt"
				className="bg-white border border-gray-200 rounded-xl p-6 max-w-md mx-auto"
			>
				{/* Header */}
				<div className="text-center border-b border-gray-200 pb-4 mb-4">
					<h1 className="text-lg font-bold text-gray-900">
						Al Madeena Islamic School
					</h1>
					<p className="text-sm text-gray-500">Bukti Pembayaran</p>
				</div>

				{/* Receipt Info */}
				<div className="flex justify-between text-xs text-gray-500 mb-4">
					<span>No: {receiptNo}</span>
					<span>{formatDate(paymentDate)}</span>
				</div>

				{/* Student Info */}
				<div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">Nama Siswa</span>
						<span className="font-medium text-gray-900">{studentName}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">NIS</span>
						<span className="font-medium text-gray-900">{studentNis}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">Kelas</span>
						<span className="font-medium text-gray-900">{studentKelas}</span>
					</div>
				</div>

				{/* Payment Details */}
				<div className="space-y-1 mb-4">
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">Jenis Biaya</span>
						<span className="font-medium text-gray-900">{billingType}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">Periode</span>
						<span className="font-medium text-gray-900">{period}</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-gray-500">Metode Bayar</span>
						<span className="font-medium text-gray-900">
							{methodLabels[paymentMethod] || paymentMethod}
						</span>
					</div>
					{note && (
						<div className="flex justify-between text-sm">
							<span className="text-gray-500">Catatan</span>
							<span className="font-medium text-gray-900">{note}</span>
						</div>
					)}
				</div>

				{/* Amount */}
				<div className="border-t border-b border-gray-200 py-3 mb-4">
					<div className="flex justify-between items-center">
						<span className="text-sm font-medium text-gray-500">
							Jumlah Bayar
						</span>
						<span className="text-xl font-bold text-gray-900">
							{formatRupiah(amount)}
						</span>
					</div>
					<p className="text-xs text-gray-400 mt-1 text-right">
						{terbilang(amount)}
					</p>
				</div>

				{/* Footer */}
				<div className="mt-8 flex justify-between text-xs text-gray-400">
					<div className="text-center">
						<p className="mb-8">___________________</p>
						<p>Penerima</p>
					</div>
					<div className="text-center">
						<p className="mb-8">___________________</p>
						<p>Orang Tua/Wali</p>
					</div>
				</div>
			</div>
		</>
	);
}
