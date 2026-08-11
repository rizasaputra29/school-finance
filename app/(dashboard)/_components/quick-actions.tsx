import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Wallet, TrendingUp, ChevronRight } from "lucide-react";
import Link from "next/link";

export function DashboardQuickActions() {
	return (
		<Card className="col-span-2 bg-white">
			<CardHeader className="pb-2 px-3 md:px-4">
				<CardTitle className="text-sm md:text-base font-semibold text-gray-900">
					Aksi Cepat
				</CardTitle>
			</CardHeader>
			<CardContent className="px-3 md:px-4 pb-3 grid grid-cols-2 gap-2">
				<Link href="/students" className="block">
					<Button
						variant="secondary"
						size="sm"
						className="w-full justify-start text-xs h-9"
					>
						<Users className="h-3.5 w-3.5" /> Siswa
					</Button>
				</Link>
				<Link href="/accounts" className="block">
					<Button
						variant="secondary"
						size="sm"
						className="w-full justify-start text-xs h-9"
					>
						<Wallet className="h-3.5 w-3.5" /> Akun
					</Button>
				</Link>
				<Link href="/cashflow" className="block">
					<Button
						variant="secondary"
						size="sm"
						className="w-full justify-start text-xs h-9"
					>
						<TrendingUp className="h-3.5 w-3.5" /> Cashflow
					</Button>
				</Link>
				<Link href="/reports" className="block">
					<Button
						variant="secondary"
						size="sm"
						className="w-full justify-start text-xs h-9"
					>
						<ChevronRight className="h-3.5 w-3.5" /> Laporan
					</Button>
				</Link>
			</CardContent>
		</Card>
	);
}
