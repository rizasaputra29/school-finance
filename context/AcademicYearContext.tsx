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
      
      // Handle error responses (e.g., 401 Unauthorized)
      if (!res.ok) {
        if (res.status === 401) {
          console.log('User not authenticated, skipping academic years fetch');
          return;
        }
        console.error('Failed to fetch academic years:', res.status, res.statusText);
        return;
      }
      
      const response = await res.json();
      
      // Handle wrapped response format: { data: [...], activeYear: {...} }
      const data = response.data || response;
      const activeYearFromAPI = response.activeYear;
      
      // Validate data is an array before processing
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', typeof data, data);
        return;
      }
      
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
      
      // Use activeYear from API if available, otherwise find it manually
      if (activeYearFromAPI) {
        setSelectedYearState(activeYearFromAPI);
      } else {
        // Otherwise, find active year manually
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
