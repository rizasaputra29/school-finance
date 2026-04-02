import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';
import { getFilteredDashboardCache, invalidateDashboardCache } from '@/lib/cache';

// Define types inline for Prisma v7 compatibility

interface StudentRecord {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahunMasuk: number;
  statusBayar: string;
  totalTagihan: number;
  totalBayar: number;
  createdAt: Date;
  updatedAt: Date;
}


interface DashboardFilterParams {
  bulan?: number;
  tahun?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Parse filter parameters from request query
 */
function parseFilterParams(req: NextApiRequest): DashboardFilterParams {
  const { bulan, tahun, startDate, endDate } = req.query;
  
  return {
    bulan: bulan ? parseInt(bulan as string) : undefined,
    tahun: tahun ? parseInt(tahun as string) : undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };
}

/**
 * Build response with filtered dashboard data
 */
async function buildFilteredDashboardResponse(
  params: DashboardFilterParams
): Promise<{
  summary: { totalPendapatan: number; totalBeban: number; saldo: number };
  pieChart: Array<{ name: string; value: number }>;
  barChart: Array<{ bulan: string; pendapatan: number; beban: number }>;
}> {
  const getDashboardData = getFilteredDashboardCache(
    params.bulan,
    params.tahun,
    params.startDate,
    params.endDate
  );
  
  return getDashboardData() as Promise<{
    summary: { totalPendapatan: number; totalBeban: number; saldo: number };
    pieChart: Array<{ name: string; value: number }>;
    barChart: Array<{ bulan: string; pendapatan: number; beban: number }>;
  }>;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  // Handle filtered dashboard request (with query params)
  if (req.method === 'GET' && (req.query.bulan || req.query.tahun || req.query.startDate || req.query.endDate)) {
    return handleFilteredDashboard(req, res);
  }
  
  // Handle chart data request (legacy - keep for backward compatibility)
  if (req.method === 'GET' && req.query.chart) {
    return handleChartData(req, res);
  }
  
  // Original dashboard handler - get dashboard data with filters
  try {
    const filterParams = parseFilterParams(req);
    const dashboardData = await buildFilteredDashboardResponse(filterParams);
    
    // Get student stats (less frequently changing, so not cached)
    const students = await prisma.student.findMany({ where: { status: 'Active' } }) as StudentRecord[];
    const totalStudents = students.length;
    const lunasCount = students.filter((s) => s.statusBayar === 'Lunas').length;
    const belumLunasCount = totalStudents - lunasCount;
    
    // Get recent transactions (not cached - needs to be fresh)
    const recentTransactions = await prisma.cashflow.findMany({
      orderBy: { tanggal: 'desc' },
      take: 5,
    });
    
    // Return filtered dashboard data with additional student info
    return res.status(200).json({
      summary: {
        ...dashboardData.summary,
        totalStudents,
        lunasCount,
        belumLunasCount,
      },
      pieChart: dashboardData.pieChart,
      barChart: dashboardData.barChart,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle filtered dashboard requests
 * Supports: bulan, tahun, startDate, endDate
 */
async function handleFilteredDashboard(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    const filterParams = parseFilterParams(req);
    const dashboardData = await buildFilteredDashboardResponse(filterParams);
    
    return res.status(200).json({
      summary: dashboardData.summary,
      pieChart: dashboardData.pieChart,
      barChart: dashboardData.barChart,
    });
  } catch (error) {
    console.error('Filtered dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Handle chart data requests (legacy - keep for backward compatibility)
async function handleChartData(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  try {
    const bulan = parseInt(req.query.bulan as string) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun as string) || new Date().getFullYear();
    
    // Build filtered dashboard data for chart
    const dashboardData = await buildFilteredDashboardResponse({ bulan, tahun });
    
    return res.status(200).json({
      pieChart: dashboardData.pieChart,
      barChart: dashboardData.barChart,
    });
  } catch (error) {
    console.error('Chart data error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Export cache invalidation for use in transaction handlers
 */
export { invalidateDashboardCache };

export default withAuth(handler);
