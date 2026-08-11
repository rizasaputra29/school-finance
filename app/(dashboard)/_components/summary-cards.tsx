import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface SummaryCardsProps {
	totalDebit: number;
	totalKredit: number;
}

function formatRupiah(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

export function DashboardSummaryCards({ totalDebit, totalKredit }: SummaryCardsProps) {
	return (
		<>
			{/* Pendapatan */}
			<Card className="col-span-2 bg-white">
				<CardContent className="p-4 md:p-5">
					<div className="flex items-start justify-between">
						<div className="min-w-0 flex-1">
							<p className="text-xs md:text-sm font-medium text-gray-500">
								Pendapatan
							</p>
							<p className="text-base md:text-xl font-bold text-gray-900 mt-1 truncate">
								{formatRupiah(totalDebit)}
							</p>
						</div>
						<div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
							<ArrowUpRight className="h-5 w-5 text-green-600" />
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Pengeluaran */}
			<Card className="col-span-2 bg-white">
				<CardContent className="p-4 md:p-5">
					<div className="flex items-start justify-between">
						<div className="min-w-0 flex-1">
							<p className="text-xs md:text-sm font-medium text-gray-500">
								Pengeluaran
							</p>
							<p className="text-base md:text-xl font-bold text-gray-900 mt-1 truncate">
								{formatRupiah(totalKredit)}
							</p>
						</div>
						<div className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
							<ArrowDownRight className="h-5 w-5 text-red-500" />
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
