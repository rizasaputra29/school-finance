import type { NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/lib/withAuth';

interface StudentRecord {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahunMasuk: number;
  namaOrtu: string | null;
  noTelp: string | null;
  statusBayar: string;
  status: string;
}


async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all active students ordered by nama
    const students = await prisma.student.findMany({
      where: { status: 'Active' },
      orderBy: { nama: 'asc' },
    }) as StudentRecord[];

    // Format data for Excel with required columns
    const excelRows = students.map((student, index) => [
      index + 1,
      student.nis,
      student.nama,
      student.kelas || '',
      student.tahunMasuk || '',
      student.namaOrtu || '',
      student.noTelp || '',
    ]);

    // Add counts row
    const totalSiswa = students.length;
    
    if (excelRows.length > 0) {
      excelRows.push([
        '',
        '',
        `Total: ${totalSiswa} Siswa`,
        '',
        '',
        '',
        '',
      ]);
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create header info
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    
    const headerInfo = [
      ['LAPORAN DATA SISWA'],
      ['SEKOLAH'],
      [`Per ${currentDate}`],
      [],
    ];

    // Create sheet with header and data
    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerInfo,
      ['No', 'NIS', 'Nama', 'Kelas', 'Tahun Masuk', 'Nama Ortu', 'No Telp'],
      ...excelRows,
    ]);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // NIS
      { wch: 25 },  // Nama
      { wch: 10 },  // Kelas
      { wch: 12 },  // Tahun Masuk
      { wch: 25 },  // Nama Ortu
      { wch: 15 },  // No Telp
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Siswa');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const filename = `data-siswa-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    return res.send(buffer);
  } catch (error) {
    console.error('Export Students error:', error);
    return res.status(500).json({ error: 'Gagal mengexport data Siswa' });
  }
}

export default withAuth(handler, { requireAdmin: true });