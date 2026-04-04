'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowRightLeft,
  Receipt,
  Users,
  MoreHorizontal,
  X,
  BookOpen,
  Wallet,
  FileText,
  Upload,
  Briefcase,
  Building2,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const mainNavItems = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Cashflow', href: '/cashflow', icon: ArrowRightLeft },
  { name: 'Tagihan', href: '/billing', icon: Receipt },
  { name: 'Siswa', href: '/students', icon: Users },
];

const moreNavItems = [
  { name: 'Karyawan', href: '/karyawan', icon: Briefcase },
  { name: 'Gaji', href: '/karyawan/payroll', icon: Wallet },
  { name: 'Akun', href: '/accounts', icon: BookOpen },
  { name: 'Kas & Bank', href: '/keuangan', icon: Building2 },
  { name: 'Laporan', href: '/reports', icon: FileText },
  { name: 'Buku Kas', href: '/cashbook', icon: Wallet },
  { name: 'Performa', href: '/performa', icon: BarChart3 },
];

const adminNavItems = [
  { name: 'Import Data', href: '/admin', icon: Upload },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const allMoreItems = isAdmin ? [...moreNavItems, ...adminNavItems] : moreNavItems;

  return (
    <>
      {/* More Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* More Menu Sheet */}
      <div 
        className={`fixed bottom-16 left-0 right-0 z-50 md:hidden bg-white rounded-t-2xl shadow-xl transform transition-transform duration-300 ease-out ${
          isMenuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Menu Lainnya</h3>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {allMoreItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-[#059DEA] text-white' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-6 w-6 mb-2" />
                  <span className="text-xs font-medium text-center">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {/* Safe area padding */}
        <div className="h-2" />
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-all ${
                  isActive 
                    ? 'text-gray-900' 
                    : 'text-gray-400'
                }`}
              >
                <div className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-[#059DEA] text-white shadow-sm' 
                    : 'bg-transparent'
                }`}>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
          
          {/* More Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-all ${
              isMenuOpen ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <div className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
              isMenuOpen ? 'bg-[#059DEA] text-white shadow-sm' : 'bg-transparent'
            }`}>
              <MoreHorizontal className="h-5 w-5" strokeWidth={isMenuOpen ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] mt-0.5 font-medium ${isMenuOpen ? 'text-gray-900' : 'text-gray-400'}`}>
              Menu
            </span>
          </button>
        </div>
        {/* Safe area for iOS */}
        <div className="h-safe-area-inset-bottom bg-white" />
      </nav>
    </>
  );
}
