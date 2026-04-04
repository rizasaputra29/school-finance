'use client';

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { ReminderBell } from "@/components/ReminderBell";

export default function DashboardLayout({
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
    </SidebarProvider>
  );
}
