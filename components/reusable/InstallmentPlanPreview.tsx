"use client";

import { formatRupiah } from "@/lib/utils/utils-currency";

const MONTH_NAMES = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

interface InstallmentPlanPreviewProps {
	jumlahTotal: number;
	tenor: number;
	jenisBiaya?: string;
	className?: string;
}

export function InstallmentPlanPreview({
	jumlahTotal,
	tenor,
	jenisBiaya,
	className,
}: InstallmentPlanPreviewProps) {
	if (!jumlahTotal || !tenor || tenor <= 0) return null;

	const jumlahPerCicilan = Math.round((jumlahTotal / tenor) * 100) / 100;
	const now = new Date();
	const startMonth = now.getMonth();
	const startYear = now.getFullYear();

	const items = Array.from({ length: tenor }, (_, i) => {
		const monthIndex = (startMonth + i) % 12;
		const year = startYear + Math.floor((startMonth + i) / 12);
		const monthName = MONTH_NAMES[monthIndex];
		const label = jenisBiaya
			? `${jenisBiaya} Bulan ${monthName} (Cicilan ${i + 1}/${tenor})`
			: `Cicilan ${i + 1} — ${monthName} ${year}`;
		return {
			cicilanKe: i + 1,
			jumlah: jumlahPerCicilan,
			label,
		};
	});

	return (
		<div className={`rounded-lg bg-blue-50 p-3 space-y-2 ${className || ""}`}>
			<p className="text-sm font-medium text-blue-800">
				Estimasi Rencana Cicilan
			</p>
			<div className="space-y-1 max-h-40 overflow-y-auto">
				{items.map((item) => (
					<div
						key={item.cicilanKe}
						className="flex justify-between text-sm text-blue-700"
					>
						<span>{item.label}</span>
						<span className="font-medium">{formatRupiah(item.jumlah)}</span>
					</div>
				))}
			</div>
			<p className="text-xs text-blue-600 pt-1 border-t border-blue-100">
				Total: {formatRupiah(jumlahTotal)} × {tenor} cicilan
			</p>
		</div>
	);
}
