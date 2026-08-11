import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, ChevronRight } from "lucide-react";
import Link from "next/link";

interface PaymentStatusProps {
	totalStudents: number;
	lunasCount: number;
	belumLunasCount: number;
}

export function DashboardPaymentStatus({
	totalStudents,
	lunasCount,
	belumLunasCount,
}: PaymentStatusProps) {
	const lunasPercentage =
		totalStudents > 0
			? Math.round((lunasCount / totalStudents) * 100)
			: 0;

	return (
		<Card className="col-span-2 bg-white row-span-2">
			<CardHeader className="pb-2 px-3 md:px-4">
				<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
					Status Pembayaran
				</CardTitle>
			</CardHeader>
			<CardContent className="px-3 md:px-4 pb-3 space-y-3">
				<div>
					<div className="flex items-center justify-between text-xs mb-1">
						<span className="text-gray-500">Tingkat Kelulusan</span>
						<span className="font-semibold text-gray-900">
							{lunasPercentage}%
						</span>
					</div>
					<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
						<div
							className="h-full bg-[#059DEA] rounded-full"
							style={{ width: `${lunasPercentage}%` }}
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<div className="p-2 md:p-3 rounded-lg bg-[#059DEA]/10">
						<div className="flex items-center gap-1 mb-0.5">
							<CheckCircle className="h-3 w-3 text-green-600" />
							<span className="text-[10px] md:text-xs text-gray-600">
								Lunas
							</span>
						</div>
						<p className="text-lg md:text-xl font-bold text-gray-900">
							{lunasCount}
						</p>
					</div>
					<div className="p-2 md:p-3 rounded-lg bg-gray-100">
						<div className="flex items-center gap-1 mb-0.5">
							<Clock className="h-3 w-3 text-gray-400" />
							<span className="text-[10px] md:text-xs text-gray-600">
								Belum
							</span>
						</div>
						<p className="text-lg md:text-xl font-bold text-gray-900">
							{belumLunasCount}
						</p>
					</div>
				</div>
				<Link href="/billing" className="block">
					<Button variant="outline" size="sm" className="w-full text-xs">
						Kelola Tagihan <ChevronRight className="h-3 w-3" />
					</Button>
				</Link>
			</CardContent>
		</Card>
	);
}
