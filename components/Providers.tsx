"use client";

import { AuthProvider } from "@/context/AuthContext";
import { AcademicYearProvider } from "@/context/AcademicYearContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AcademicYearProvider>
        {children}
      </AcademicYearProvider>
    </AuthProvider>
  );
}
