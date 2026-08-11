"use client";

import { AuthProvider } from "@/context/AuthContext";
import { AcademicYearProvider } from "@/context/AcademicYearContext";
import { QueryProvider } from "./QueryProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AcademicYearProvider>
          {children}
        </AcademicYearProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
