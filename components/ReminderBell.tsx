"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
	Bell,
	AlertTriangle,
	Calendar,
	FileText,
	Clock,
	X,
} from "lucide-react";
import { formatShortDate } from "@/lib/utils/utils-core";
import { formatRupiah } from "@/lib/utils/utils-currency";
import Link from "next/link";

interface Reminder {
	id: string;
	type: "hutang" | "penyusutan" | "piutang" | "payroll";
	title: string;
	description: string;
	amount?: number;
	dueDate?: string;
}

export function ReminderBell() {
	const [reminders, setReminders] = useState<Reminder[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		fetchReminders();
	}, []);

	const fetchReminders = async () => {
		try {
			const res = await fetch("/api/reminders");
			const result = await res.json();
			if (!result.success) {
				toast.error(result.error?.message || "Gagal memuat pengingat");
				return;
			}
			setReminders(result.data);
		} catch (error) {
			console.error("Failed to fetch reminders:", error);
			toast.error("Terjadi kesalahan saat memuat pengingat");
		} finally {
			setIsLoading(false);
		}
	};

	const unreadCount = reminders.length;

	const getTypeIcon = (type: Reminder["type"]) => {
		switch (type) {
			case "hutang":
				return <AlertTriangle className="h-4 w-4 text-red-500" />;
			case "penyusutan":
				return <Calendar className="h-4 w-4 text-amber-500" />;
			case "piutang":
				return <FileText className="h-4 w-4 text-blue-500" />;
			case "payroll":
				return <Clock className="h-4 w-4 text-purple-500" />;
		}
	};

	const getTypeBgColor = (type: Reminder["type"]) => {
		switch (type) {
			case "hutang":
				return "bg-red-50";
			case "penyusutan":
				return "bg-amber-50";
			case "piutang":
				return "bg-blue-50";
			case "payroll":
				return "bg-purple-50";
		}
	};

	return (
		<div className="relative">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
			>
				<Bell className="h-5 w-5 text-gray-600" />
				{unreadCount > 0 && (
					<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white font-medium">
						{unreadCount > 9 ? "9+" : unreadCount}
					</span>
				)}
			</button>

			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-10"
						onClick={() => setIsOpen(false)}
					/>
					<div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-20 max-h-96 overflow-hidden">
						<div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
							<h3 className="font-semibold text-gray-900">Pengingat</h3>
							<button
								onClick={() => setIsOpen(false)}
								className="p-1 hover:bg-gray-100 rounded"
							>
								<X className="h-4 w-4 text-gray-500" />
							</button>
						</div>

						<div className="overflow-y-auto max-h-72">
							{isLoading ? (
								<div className="flex items-center justify-center py-8">
									<div className="h-6 w-6 animate-spin rounded-full border-3 border-gray-200 border-t-[#059DEA]" />
								</div>
							) : reminders.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-gray-500">
									<Bell className="h-8 w-8 text-gray-300 mb-2" />
									<p className="text-sm">Tidak ada pengingat</p>
								</div>
							) : (
								<div className="p-2 space-y-2">
									{reminders.map((reminder) => (
										<div
											key={reminder.id}
											className={`flex items-start gap-3 p-3 rounded-lg ${getTypeBgColor(reminder.type)}`}
										>
											{getTypeIcon(reminder.type)}
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium text-gray-900">
													{reminder.title}
												</p>
												<p className="text-xs text-gray-600 truncate">
													{reminder.description}
												</p>
												{reminder.amount && (
													<p className="text-xs font-medium text-gray-700 mt-1">
														{formatRupiah(reminder.amount)}
													</p>
												)}
												{reminder.dueDate && (
													<p className="text-xs text-gray-500 mt-1">
														Jatuh tempo: {formatShortDate(reminder.dueDate)}
													</p>
												)}
											</div>
										</div>
									))}
								</div>
							)}
						</div>

						<div className="border-t border-gray-200 p-2">
							<Link
								href="/reminder"
								className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-[#059DEA] hover:bg-[#059DEA]/10"
								onClick={() => setIsOpen(false)}
							>
								<span>Lihat Semua Pengingat</span>
							</Link>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
