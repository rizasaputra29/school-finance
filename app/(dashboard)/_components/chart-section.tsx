"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/utils/utils-currency";
import type { DashboardChartData } from "@/lib/actions/dashboard";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	ResponsiveContainer,
	CartesianGrid,
} from "recharts";

interface DashboardChartSectionProps {
	initialData: DashboardChartData;
	academicYearLabel?: string;
}

export function DashboardChartSection({
	initialData,
	academicYearLabel,
}: DashboardChartSectionProps) {
	const [activeTab, setActiveTab] = useState<"academic" | "calendar">(
		"academic",
	);

	const data =
		activeTab === "academic"
			? initialData.academicYear
			: initialData.calendarYear;

	const title =
		activeTab === "academic"
			? `Grafik Keuangan - TA ${academicYearLabel ?? ""}`
			: `Grafik Keuangan - Tahun Kalender ${new Date().getFullYear()}`;

	const hasData = data.some(
		(d) => d.revenue !== 0 || d.expense !== 0 || d.net !== 0,
	);

	return (
		<Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white row-span-2">
			<CardHeader className="pb-2 px-3 md:px-4">
				<div className="flex items-center justify-between flex-wrap gap-2">
					<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
						{title}
					</CardTitle>
					<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
						<button
							onClick={() => setActiveTab("academic")}
							className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
								activeTab === "academic"
									? "bg-white text-gray-900 shadow-sm"
									: "text-gray-500 hover:text-gray-700"
							}`}
						>
							Tahun Akademik
						</button>
						<button
							onClick={() => setActiveTab("calendar")}
							className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
								activeTab === "calendar"
									? "bg-white text-gray-900 shadow-sm"
									: "text-gray-500 hover:text-gray-700"
							}`}
						>
							Tahun Kalender
						</button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0 px-2 md:px-4 pb-3">
				{hasData ? (
					<div className="h-[260px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={data}
								margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									vertical={false}
									stroke="#E5E7EB"
								/>
								<XAxis
									dataKey="month"
									tick={{ fontSize: 10 }}
									axisLine={{ stroke: "#E5E7EB" }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 10 }}
									axisLine={false}
									tickLine={false}
									tickFormatter={(value) => {
										if (value >= 1000000)
											return `${(value / 1000000).toFixed(0)}M`;
										if (value >= 1000)
											return `${(value / 1000).toFixed(0)}K`;
										return String(value);
									}}
								/>
								<Tooltip
									formatter={(value) => formatRupiah(Number(value))}
									contentStyle={{
										fontSize: "12px",
										borderRadius: "8px",
										border: "none",
										boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
									}}
									labelStyle={{ fontSize: "12px", fontWeight: "600" }}
								/>
								<Legend
									wrapperStyle={{
										fontSize: "11px",
										paddingTop: "8px",
									}}
								/>
								<Bar
									dataKey="revenue"
									name="Pendapatan"
									fill="#059DEA"
									radius={[4, 4, 0, 0]}
								/>
								<Bar
									dataKey="expense"
									name="Pengeluaran"
									fill="#EF4444"
									radius={[4, 4, 0, 0]}
								/>
								<Bar
									dataKey="net"
									name="Laba Bersih"
									fill="#10B981"
									radius={[4, 4, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : (
					<div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
						<p className="text-xs">Tidak ada data</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
