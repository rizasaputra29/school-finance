"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { ReminderBell } from "@/components/ReminderBell";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayoutClient({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider defaultOpen={true}>
			{/* Desktop Sidebar - Hidden on mobile */}
			<AppSidebar />

			{/* Main Content */}
			<main className="flex-1 min-h-screen bg-background transition-all duration-300">
				{/* Top Bar */}
				<div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
					<div className="flex-1" />
					<div className="flex items-center gap-4">
						<AcademicYearSelector />
						<ReminderBell />
					</div>
				</div>

				<div className="p-4 pb-20 md:p-6 lg:p-8 md:pb-8 w-full max-w-7xl mx-auto">
					{children}
				</div>
			</main>

			{/* Mobile Bottom Nav */}
			<BottomNav />

			{/* Toast notifications - responsive positioning */}
			<Toaster
				position="bottom-right"
				richColors
				closeButton
				duration={3000}
				className="[&_[data-sonner-toaster]]:top-4![&_[data-sonner-toaster]]:bottom-auto![&_[data-sonner-toaster]]:left-1/2![&_[data-sonner-toaster]]:-translate-x-1/2! sm:[&_[data-sonner-toaster]]:top-auto! sm:[&_[data-sonner-toaster]]:left-auto! sm:[&_[data-sonner-toaster]]:translate-x-0! sm:[&_[data-sonner-toaster]]:bottom-4! sm:[&_[data-sonner-toaster]]:right-4!"
			/>
		</SidebarProvider>
	);
}
