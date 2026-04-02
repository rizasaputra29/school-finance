'use client';

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, FileText, Clock, CheckCircle, ChevronRight, CreditCard, BookOpen, Send, DollarSign } from 'lucide-react';
import { formatCurrency, formatShortDate } from '@/lib/utils';
import Link from 'next/link';

interface Reminder {
  id: string;
  type: 'hutang' | 'penyusutan' | 'piutang' | 'payroll';
  title: string;
  description: string;
  amount?: number;
  dueDate?: string;
}

const categoryConfig = {
  hutang: {
    label: 'Hutang',
    icon: AlertTriangle,
    color: 'red',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  penyusutan: {
    label: 'Penyusutan',
    icon: Calendar,
    color: 'amber',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  piutang: {
    label: 'Piutang Siswa',
    icon: FileText,
    color: 'blue',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  payroll: {
    label: 'Gaji & Tunjangan',
    icon: Clock,
    color: 'purple',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
};

export default function ReminderPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    try {
      const res = await fetch('/api/reminders');
      if (res.ok) {
        const data = await res.json();
        setReminders(data);
      }
    } catch (error) {
      console.error('Failed to fetch reminders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReminders = filter === 'all' 
    ? reminders 
    : reminders.filter(r => r.type === filter);

  const groupedReminders = filteredReminders.reduce((acc, reminder) => {
    if (!acc[reminder.type]) {
      acc[reminder.type] = [];
    }
    acc[reminder.type].push(reminder);
    return acc;
  }, {} as Record<string, Reminder[]>);

  const counts = {
    hutang: reminders.filter(r => r.type === 'hutang').length,
    penyusutan: reminders.filter(r => r.type === 'penyusutan').length,
    piutang: reminders.filter(r => r.type === 'piutang').length,
    payroll: reminders.filter(r => r.type === 'payroll').length,
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <>
      <Head>
        <title>Pengingat - Keuangan Sekolah</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-gray-700" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Pengingat</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(categoryConfig).map(([type, config]) => {
            const Icon = config.icon;
            const count = counts[type as keyof typeof counts];
            return (
              <Card 
                key={type} 
                className={`cursor-pointer transition-all ${filter === type ? 'ring-2 ring-[#059DEA]' : ''}`}
                onClick={() => setFilter(filter === type ? 'all' : type)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.bgColor}`}>
                      <Icon className={`h-5 w-5 text-${config.color}-600`} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">{config.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filter */}
        {filter !== 'all' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Filter:</span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#059DEA]/10 text-[#059DEA] text-sm font-medium">
              {categoryConfig[filter as keyof typeof categoryConfig]?.label}
              <button onClick={() => setFilter('all')} className="ml-1 hover:bg-[#059DEA]/20 rounded">
                ×
              </button>
            </span>
          </div>
        )}

        {/* Reminder List */}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#059DEA]" />
          </div>
        ) : filteredReminders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
              <p className="text-lg font-medium text-gray-900">Tidak ada pengingat</p>
              <p className="text-sm text-gray-500">Semua pembayaran dan tagihan berjalan dengan baik</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedReminders).map(([type, items]) => {
              const config = categoryConfig[type as keyof typeof categoryConfig];
              const Icon = config.icon;

              return (
                <Card key={type} className={config.borderColor}>
                  <CardHeader className={`${config.bgColor} border-b`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 text-${config.color}-600`} />
                      <CardTitle className="text-lg">{config.label}</CardTitle>
                      <span className="ml-auto text-sm text-gray-500">{items.length} item</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-100">
                      {items.map((reminder) => (
                        <div
                          key={reminder.id}
                          className="flex items-center justify-between p-4 hover:bg-gray-50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{reminder.title}</p>
                              {isOverdue(reminder.dueDate) && (
                                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                  Jatuh Tempo
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 truncate">{reminder.description}</p>
                            <div className="flex items-center gap-4 mt-1">
                              {reminder.amount && (
                                <p className="text-sm font-medium text-gray-900">
                                  {formatCurrency(reminder.amount)}
                                </p>
                              )}
                              {reminder.dueDate && (
                                <p className={`text-sm ${isOverdue(reminder.dueDate) ? 'text-red-600' : 'text-gray-500'}`}>
                                  Jatuh tempo: {formatShortDate(reminder.dueDate)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  switch (reminder.type) {
                                    case 'hutang':
                                      router.push('/keuangan?tab=hutang');
                                      break;
                                    case 'penyusutan':
                                      router.push('/assets');
                                      break;
                                    case 'piutang':
                                      router.push('/billing');
                                      break;
                                    case 'payroll':
                                      router.push('/karyawan/payroll');
                                      break;
                                  }
                                }}
                              >
                                {reminder.type === 'hutang' && <CreditCard className="h-4 w-4 mr-1" />}
                                {reminder.type === 'penyusutan' && <BookOpen className="h-4 w-4 mr-1" />}
                                {reminder.type === 'piutang' && <Send className="h-4 w-4 mr-1" />}
                                {reminder.type === 'payroll' && <DollarSign className="h-4 w-4 mr-1" />}
                                {reminder.type === 'hutang' && 'Bayar'}
                                {reminder.type === 'penyusutan' && 'Catat'}
                                {reminder.type === 'piutang' && 'Kirim'}
                                {reminder.type === 'payroll' && 'Bayar'}
                              </Button>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/admin/approve">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Clock className="h-8 w-8 mx-auto text-[#059DEA] mb-2" />
                <p className="font-medium">Persetujuan</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/billing">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <FileText className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="font-medium">Tagihan Siswa</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/karyawan/payroll">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Clock className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                <p className="font-medium">Payroll</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/keuangan">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="font-medium">Kas & Bank</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
