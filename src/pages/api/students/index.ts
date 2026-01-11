import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET': {
        const { page = '1', limit = '10', kelas, statusBayar, status, search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};
        
        // Filter by class
        if (kelas) where.kelas = kelas;
        
        // Filter by payment status
        if (statusBayar) where.statusBayar = statusBayar;
        
        // Filter by active status (default: Active only)
        if (status) {
          where.status = status;
        } else {
          where.status = 'Active'; // Default to active students
        }
        
        // Search by name, NIS, or class
        if (search) {
          where.OR = [
            { nama: { contains: search as string, mode: 'insensitive' } },
            { nis: { contains: search as string, mode: 'insensitive' } },
            { kelas: { contains: search as string, mode: 'insensitive' } },
          ];
        }

        const [students, total] = await Promise.all([
          prisma.student.findMany({
            where,
            orderBy: { nama: 'asc' },
            skip,
            take: parseInt(limit as string),
          }),
          prisma.student.count({ where }),
        ]);

        return res.status(200).json({
          data: students,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            totalPages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      }

      case 'POST': {
        const { nis, nama, jenisKelamin, kelas, tahunMasuk, tahunAjaran, namaOrtu, noTelp, statusBayar, totalTagihan, totalBayar } = req.body;

        if (!nis || !nama || !kelas || !tahunMasuk) {
          return res.status(400).json({ error: 'NIS, nama, kelas, dan tahun masuk wajib diisi' });
        }

        // Check for duplicate NIS
        const existingStudent = await prisma.student.findUnique({
          where: { nis },
        });

        if (existingStudent) {
          return res.status(400).json({ error: 'NIS sudah terdaftar' });
        }

        const student = await prisma.student.create({
          data: {
            nis,
            nama,
            jenisKelamin: jenisKelamin || null,
            kelas,
            tahunMasuk: parseInt(tahunMasuk),
            tahunAjaran: tahunAjaran || null,
            namaOrtu: namaOrtu || null,
            noTelp: noTelp || null,
            statusBayar: statusBayar || 'Belum Lunas',
            status: 'Active',
            totalTagihan: parseFloat(totalTagihan) || 0,
            totalBayar: parseFloat(totalBayar) || 0,
          },
        });

        return res.status(201).json(student);
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

