"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardChartData } from "@/lib/actions/dashboard";
import { formatRupiah } from "@/lib/utils/utils-currency";
import {
	PieChart,
	Pie,
	Cell,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";

const monthNames = [
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

export function DashboardChartSection() {
	const currentDate = new Date();
	const [selectedBulan, setSelectedBulan] = useState(
		currentDate.getMonth() + 1,
	);
	const [selectedTahun, setSelectedTahun] = useState(currentDate.getFullYear());

	const years = [
		currentDate.getFullYear(),
		currentDate.getFullYear() - 1,
		currentDate.getFullYear() - 2,
	];

	const { data: chartData, isLoading: chartLoading } = useQuery({
		queryKey: ["dashboard-chart", selectedBulan, selectedTahun],
		queryFn: () => getDashboardChartData(selectedBulan, selectedTahun),
	});

	return (
		<Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white row-span-2">
			<CardHeader className="pb-2 px-3 md:px-4">
				<div className="flex items-center justify-between flex-wrap gap-2">
					<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
						Grafik Keuangan
					</CardTitle>
					<div className="flex items-center gap-2">
						<select
							value={selectedBulan}
							onChange={(e) => setSelectedBulan(parseInt(e.target.value))}
							className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-1 focus:ring-[#059DEA]/50 outline-none cursor-pointer"
						>
							{monthNames.map((name, index) => (
								<option key={index + 1} value={index + 1}>
									{name}
								</option>
							))}
						</select>
						<select
							value={selectedTahun}
							onChange={(e) => setSelectedTahun(parseInt(e.target.value))}
							className="appearance-none pl-2 pr-6 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:ring-1 focus:ring-[#059DEA]/50 outline-none cursor-pointer"
						>
							{years.map((year) => (
								<option key={year} value={year}>
									{year}
								</option>
							))}
						</select>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0 px-2 md:px-4 pb-3">
				{chartLoading ? (
					<div className="h-[200px] flex items-center justify-center">
						<div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-[#059DEA]" />
					</div>
				) : chartData &&
				  chartData.pieChart &&
				  chartData.pieChart.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Pie Chart */}
						<div>
							<p className="text-xs font-medium text-gray-600 mb-2 text-center">
								Pengeluaran per Kategori
							</p>
							<ResponsiveContainer width="100%" height={180}>
								<PieChart>
									<Pie
										data={chartData.pieChart}
										cx="50%"
										cy="50%"
										innerRadius={40}
										outerRadius={70}
										paddingAngle={2}
										dataKey="value"
									>
										{chartData.pieChart.map((entry, index) => (
											<Cell key={`cell-${index}`} fill={entry.color} />
										))}
									</Pie>
									<Tooltip
										formatter={(value) => formatRupiah(Number(value))}
										contentStyle={{
											fontSize: "12px",
											borderRadius: "8px",
											border: "none",
											boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
										}}
									/>
									<Legend
										layout="horizontal"
										verticalAlign="bottom"
										align="center"
										wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
									/>
								</PieChart>
							</ResponsiveContainer>
						</div>

						{/* Bar Chart */}
						<div>
							<p className="text-xs font-medium text-gray-600 mb-2 text-center">
								Pendapatan vs Beban Bulanan
							</p>
							<ResponsiveContainer width="100%" height={180}>
								<BarChart
									data={chartData.barChart}
									margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
								>
									<XAxis
										dataKey="bulan"
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
										wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
									/>
									<Bar
										dataKey="pendapatan"
										name="Pendapatan"
										fill="#059DEA"
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="beban"
										name="Beban"
										fill="#9CA3AF"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
					</div>
				) : (
					<div className="h-[160px] flex flex-col items-center justify-center text-gray-400">
						<p className="text-xs">Tidak ada data</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
