'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  ArrowRightLeft,
  Users,
  BookOpen,
  Upload,
  FileText,
  LogOut,
  LogIn,
  Menu,
  X,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cashflow', href: '/cashflow', icon: ArrowRightLeft },
  { name: 'Data Siswa', href: '/students', icon: Users },
  { name: 'Akun', href: '/accounts', icon: BookOpen },
  { name: 'Laporan', href: '/reports', icon: FileText },
];

const adminNavigation = [
  { name: 'Import Data', href: '/admin', icon: Upload },
];

export function Sidebar() {
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const NavLink = ({ item }: { item: typeof navigation[0] }) => {
    const isActive = router.pathname === item.href;
    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
        onClick={() => setIsMobileOpen(false)}
      >
        <item.icon className="h-5 w-5" />
        {item.name}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-md">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Keuangan</h1>
            <p className="text-xs text-slate-500">Sekolah</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Menu Utama
          </div>
          {navigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          {isAdmin && (
            <>
              <div className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Admin
              </div>
              {adminNavigation.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200 p-4">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200">
                  <span className="text-sm font-semibold text-slate-600">
                    {user.role === 'admin' ? 'A' : 'G'}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {user.role === 'admin' ? 'Admin' : 'Guest'}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Link href="/login">
              <Button className="w-full" variant="outline">
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
