'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AcademicYear {
  id: string;
  tahunAjaran: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  isActive: boolean;
}

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  selectedYear: AcademicYear | null;
  setSelectedYear: (year: AcademicYear | null) => void;
  isLoading: boolean;
  refreshYears: () => Promise<void>;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYearState] = useState<AcademicYear | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshYears = async () => {
    try {
      const res = await fetch('/api/academic-year');
      if (res.ok) {
        const data = await res.json();
        setAcademicYears(data);
        
        // Check localStorage for saved selection
        const savedId = localStorage.getItem('selectedAcademicYearId');
        if (savedId) {
          const saved = data.find((y: AcademicYear) => y.id === savedId);
          if (saved) {
            setSelectedYearState(saved);
            return;
          }
        }
        
        // Otherwise, select active year
        const active = data.find((y: AcademicYear) => y.isActive);
        if (active) {
          setSelectedYearState(active);
        } else if (data.length > 0) {
          setSelectedYearState(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch academic years:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setSelectedYear = (year: AcademicYear | null) => {
    setSelectedYearState(year);
    if (year) {
      localStorage.setItem('selectedAcademicYearId', year.id);
    } else {
      localStorage.removeItem('selectedAcademicYearId');
    }
  };

  useEffect(() => {
    refreshYears();
  }, []);

  return (
    <AcademicYearContext.Provider value={{ academicYears, selectedYear, setSelectedYear, isLoading, refreshYears }}>
      {children}
    </AcademicYearContext.Provider>
  );
}

export function useAcademicYear() {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
}
