'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LayoutDashboard,
  ArrowRightLeft,
  Receipt,
  Users,
  MoreHorizontal,
} from 'lucide-react';

const navItems = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Cashflow', href: '/cashflow', icon: ArrowRightLeft },
  { name: 'Billing', href: '/billing', icon: Receipt },
  { name: 'Siswa', href: '/students', icon: Users },
  { name: 'Menu', href: '/accounts', icon: MoreHorizontal },
];

export function BottomNav() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = router.pathname === item.href;
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
                  ? 'bg-[#c6ef4e] shadow-sm' 
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
      </div>
      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </nav>
  );
}
