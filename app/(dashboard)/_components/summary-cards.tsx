import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface SummaryCardsProps {
	totalRevenue: number;
	totalExpense: number;
}

function formatRupiah(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

function LargeSummaryCard({
	label,
	value,
	icon: Icon,
	colorClass,
	bgClass,
}: {
	label: string;
	value: string;
	icon: React.ElementType;
	colorClass: string;
	bgClass: string;
}) {
	return (
		<Card className={`col-span-2 ${bgClass} border-0`}>
			<CardContent className="p-4 md:p-6">
				<div className="flex items-center gap-4">
					<div
						className={`h-12 w-12 md:h-14 md:w-14 rounded-xl flex items-center justify-center ${colorClass}`}
					>
						<Icon className="h-6 w-6 md:h-7 md:w-7" />
					</div>
					<div>
						<p className="text-sm md:text-base font-medium text-gray-500">
							{label}
						</p>
						<p className="text-xl md:text-2xl font-bold text-gray-900">
							{value}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function DashboardSummaryCards({
	totalRevenue,
	totalExpense,
}: SummaryCardsProps) {
	return (
		<>
			<LargeSummaryCard
				label="Pendapatan"
				value={formatRupiah(totalRevenue)}
				icon={ArrowUpRight}
				colorClass="bg-green-100 text-green-600"
				bgClass="bg-white"
			/>
			<LargeSummaryCard
				label="Pengeluaran"
				value={formatRupiah(totalExpense)}
				icon={ArrowDownRight}
				colorClass="bg-red-100 text-red-500"
				bgClass="bg-white"
			/>
		</>
	);
}
