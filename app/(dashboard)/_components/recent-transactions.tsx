import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDateFull as formatDate } from "@/lib/utils/utils-date";
import { formatRupiah } from "@/lib/utils/utils-currency";
import type { DashboardTransaction } from "@/lib/actions/dashboard";

interface RecentTransactionsProps {
	transactions: DashboardTransaction[];
}

export function DashboardRecentTransactions({
	transactions,
}: RecentTransactionsProps) {
	return (
		<Card className="col-span-2 md:col-span-4 lg:col-span-4 bg-white">
			<CardHeader className="pb-2 px-3 md:px-4">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
						Transaksi Terakhir
					</CardTitle>
					<Link href="/cashflow">
						<Button
							variant="ghost"
							size="sm"
							className="text-xs text-gray-500 hover:text-gray-900 h-7 px-2"
						>
							Lihat Semua <ChevronRight className="h-3 w-3" />
						</Button>
					</Link>
				</div>
			</CardHeader>
			<CardContent className="pt-0 px-3 md:px-4 pb-3">
				<div className="space-y-0">
					{transactions.slice(0, 4).map((tx) => (
						<div
							key={tx.id}
							className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
						>
							<div className="flex items-center gap-2 min-w-0 flex-1">
								<div
									className={`h-7 w-7 md:h-8 md:w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.debit > 0 ? "bg-[#059DEA]/20" : "bg-gray-100"}`}
								>
									{tx.debit > 0 ? (
										<TrendingUp className="h-3.5 w-3.5 text-gray-700" />
									) : (
										<TrendingDown className="h-3.5 w-3.5 text-gray-500" />
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-xs text-gray-900 truncate">
										{tx.keterangan}
									</p>
									<p className="text-[10px] text-gray-400">
										{formatDate(tx.tanggal)}
									</p>
								</div>
							</div>
							<p
								className={`font-semibold text-xs shrink-0 ml-2 ${tx.debit > 0 ? "text-gray-900" : "text-gray-500"}`}
							>
								{tx.debit > 0 ? "+" : "-"}{" "}
								{formatRupiah(tx.debit > 0 ? tx.debit : tx.kredit)}
							</p>
						</div>
					))}
					{transactions.length === 0 && (
						<div className="py-6 text-center text-gray-400 text-xs">
							Belum ada transaksi
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
