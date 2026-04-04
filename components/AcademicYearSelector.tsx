'use client';

import { useAcademicYear } from '@/context/AcademicYearContext';
import { useState } from 'react';
import { Calendar, ChevronDown, Check, Settings } from 'lucide-react';
import Link from 'next/link';

export function AcademicYearSelector() {
  const { academicYears, selectedYear, setSelectedYear, isLoading } = useAcademicYear();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg animate-pulse">
        <Calendar className="h-4 w-4 text-gray-400" />
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#059DEA]/10 hover:bg-[#059DEA]/20 rounded-lg transition-colors"
      >
        <Calendar className="h-4 w-4 text-[#059DEA]" />
        <span className="text-sm font-medium text-[#059DEA]">
          {selectedYear?.tahunAjaran || 'Pilih Tahun Ajaran'}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#059DEA] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="p-2">
              <p className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Tahun Ajaran</p>
              {academicYears.map((year) => (
                <button
                  key={year.id}
                  onClick={() => {
                    setSelectedYear(year);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedYear?.id === year.id
                      ? 'bg-[#059DEA]/10 text-[#059DEA]'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{year.tahunAjaran}</span>
                  {year.isActive && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-200 p-2">
              <Link
                href="/admin/tahun-ajaran"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="h-4 w-4" />
                <span>Kelola Tahun Ajaran</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
