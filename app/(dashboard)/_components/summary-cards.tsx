import { Card, CardContent } from "@/components/ui/card";
import {
	ArrowUpRight,
	ArrowDownRight,
	Users,
	Wallet,
	Building2,
	Briefcase,
	Banknote,
} from "lucide-react";

interface SummaryCardsProps {
	totalRevenue: number;
	totalExpense: number;
	totalAssets: number;
	totalLiabilities: number;
	totalEquity: number;
	totalStudents: number;
	lunasCount: number;
	belumLunasCount: number;
	totalBillingDue: number;
	activeEmployees: number;
	totalMonthlySalary: number;
}

function formatRupiah(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

function SummaryCard({
	label,
	value,
	icon: Icon,
	colorClass,
}: {
	label: string;
	value: string;
	icon: React.ElementType;
	colorClass: string;
}) {
	return (
		<Card className="col-span-1 bg-white">
			<CardContent className="p-3 md:p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<p className="text-[10px] md:text-xs font-medium text-gray-500 truncate">
							{label}
						</p>
						<p className="text-sm md:text-base font-bold text-gray-900 mt-1 truncate">
							{value}
						</p>
					</div>
					<div
						className={`h-7 w-7 md:h-9 md:w-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}
					>
						<Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function DashboardSummaryCards({
	totalRevenue,
	totalExpense,
	totalAssets,
	totalLiabilities,
	totalEquity,
	totalStudents,
	belumLunasCount,
	totalBillingDue,
	activeEmployees,
	totalMonthlySalary,
}: SummaryCardsProps) {
	return (
		<>
			{/* Row 1 (after Net Income) */}
			<SummaryCard
				label="Pendapatan"
				value={formatRupiah(totalRevenue)}
				icon={ArrowUpRight}
				colorClass="bg-green-50 text-green-600"
			/>
			<SummaryCard
				label="Pengeluaran"
				value={formatRupiah(totalExpense)}
				icon={ArrowDownRight}
				colorClass="bg-red-50 text-red-500"
			/>
			<SummaryCard
				label="Aset"
				value={formatRupiah(totalAssets)}
				icon={Building2}
				colorClass="bg-blue-50 text-blue-600"
			/>
			<SummaryCard
				label="Kewajiban"
				value={formatRupiah(totalLiabilities)}
				icon={Wallet}
				colorClass="bg-orange-50 text-orange-600"
			/>

			{/* Row 2 */}
			<SummaryCard
				label="Ekuitas"
				value={formatRupiah(totalEquity)}
				icon={Banknote}
				colorClass="bg-purple-50 text-purple-600"
			/>
			<SummaryCard
				label="Siswa Aktif"
				value={totalStudents.toString()}
				icon={Users}
				colorClass="bg-indigo-50 text-indigo-600"
			/>
			<SummaryCard
				label="Tagihan Belum Lunas"
				value={formatRupiah(totalBillingDue)}
				icon={Wallet}
				colorClass="bg-rose-50 text-rose-600"
			/>
			<SummaryCard
				label="Karyawan Aktif"
				value={activeEmployees.toString()}
				icon={Briefcase}
				colorClass="bg-cyan-50 text-cyan-600"
			/>
			<SummaryCard
				label="Total Gaji Bulanan"
				value={formatRupiah(totalMonthlySalary)}
				icon={Banknote}
				colorClass="bg-emerald-50 text-emerald-600"
			/>
		</>
	);
}
