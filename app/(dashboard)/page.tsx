import { Suspense } from "react";
import {
	getDashboardSummary,
	getRecentTransactions,
	getDashboardChartData,
} from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSummaryCards } from "./_components/summary-cards";
import { DashboardChartSection } from "./_components/chart-section";
import { DashboardPaymentStatus } from "./_components/payment-status";
import { DashboardRecentTransactions } from "./_components/recent-transactions";
import { DashboardQuickActions } from "./_components/quick-actions";
import { TrendingUp } from "lucide-react";

export default async function Dashboard() {
	const [summary, recentTransactions, chartData] = await Promise.all([
		getDashboardSummary(),
		getRecentTransactions(),
		getDashboardChartData(),
	]);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<div>
					<h1 className="text-xl md:text-2xl font-bold text-gray-900">
						Dashboard
					</h1>
					<p className="text-xs md:text-sm text-gray-500">
						{summary.academicYear
							? `Ringkasan keuangan - TA ${summary.academicYear.tahunAjaran}`
							: "Ringkasan keuangan"}
					</p>
				</div>
			</div>

			{/* Compact Bento Grid Layout */}
			<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
				{/* Net Income - spans 2 cols */}
				<Card className="col-span-2 bg-[#059DEA] border-0">
					<CardContent className="p-4 md:p-6">
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 md:h-14 md:w-14 rounded-xl bg-white/30 flex items-center justify-center">
								<TrendingUp className="h-6 w-6 md:h-7 md:w-7 text-white" />
							</div>
							<div>
								<p className="text-sm md:text-base font-medium text-white/80">
									Laba Bersih
								</p>
								<p className="text-xl md:text-2xl font-bold text-white">
									{formatRupiah(summary.netIncome)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Summary Cards */}
				<DashboardSummaryCards
					totalRevenue={summary.totalRevenue}
					totalExpense={summary.totalExpense}
				/>

				{/* Charts Section - Client Component for interactivity */}
				<Suspense fallback={<ChartSkeleton />}>
					<DashboardChartSection
						initialData={chartData}
						academicYearLabel={summary.academicYear?.tahunAjaran}
					/>
				</Suspense>

				{/* Payment Status */}
				<DashboardPaymentStatus
					totalStudents={summary.totalStudents}
					lunasCount={summary.lunasCount}
					belumLunasCount={summary.belumLunasCount}
				/>

				{/* Recent Transactions */}
				<DashboardRecentTransactions transactions={recentTransactions} />

				{/* Quick Actions */}
				<DashboardQuickActions />
			</div>
		</div>
	);
}

function ChartSkeleton() {
	return (
		<Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white row-span-2">
			<CardHeader className="pb-2 px-3 md:px-4">
				<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
					Grafik Keuangan
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 px-2 md:px-4 pb-3">
				<div className="h-[200px] flex items-center justify-center">
					<div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-[#059DEA]" />
				</div>
			</CardContent>
		</Card>
	);
}

function formatRupiah(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}
