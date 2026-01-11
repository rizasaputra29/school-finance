import type { NextApiRequest, NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

interface CashflowRow {
  Tanggal?: string | number;
  Keterangan?: string;
  'Kode Akun'?: string;
  Debit?: number;
  Kredit?: number;
}

interface StudentRow {
  NIS?: string;
  Nama?: string;
  Kelas?: string;
  'Tahun Masuk'?: number;
  'Status Bayar'?: string;
  'Total Tagihan'?: number;
  'Total Bayar'?: number;
}

interface AccountRow {
  'Kode Akun'?: string;
  'Nama Akun'?: string;
  'Tipe Akun'?: string;
  Saldo?: number;
}

function excelDateToJSDate(excelDate: number): Date {
  return new Date((excelDate - 25569) * 86400 * 1000);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileData, sheets, type = 'excel' } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'File data tidak ditemukan' });
    }

    const results = {
      cashflow: { inserted: 0, errors: 0 },
      students: { inserted: 0, errors: 0 },
      accounts: { inserted: 0, errors: 0 },
      billings: { inserted: 0, errors: 0 }, // Added billings
    };

    if (type === 'json') {
      const jsonStr = Buffer.from(fileData, 'base64').toString('utf-8');
      const jsonData = JSON.parse(jsonStr);
      const data = jsonData.data || jsonData; // Handle wrapped or direct structure

      // Process Accounts
      if (data.accounts && Array.isArray(data.accounts)) {
        for (const account of data.accounts) {
          try {
            await prisma.account.upsert({
              where: { kodeAkun: account.kodeAkun },
              update: {
                namaAkun: account.namaAkun,
                tipeAkun: account.tipeAkun,
                saldo: parseFloat(account.saldo) || 0,
              },
              create: {
                kodeAkun: account.kodeAkun,
                namaAkun: account.namaAkun,
                tipeAkun: account.tipeAkun,
                saldo: parseFloat(account.saldo) || 0,
              },
            });
            results.accounts.inserted++;
          } catch (e) {
            console.error('JSON Account error:', e);
            results.accounts.errors++;
          }
        }
      }

      // Process Students
      if (data.students && Array.isArray(data.students)) {
        for (const student of data.students) {
           try {
             await prisma.student.upsert({
               where: { nis: student.nis },
               update: {
                 nama: student.nama,
                 kelas: student.kelas,
                 tahunMasuk: student.tahunMasuk,
                 statusBayar: student.statusBayar,
                 totalTagihan: student.totalTagihan,
                 totalBayar: student.totalBayar,
               },
               create: {
                 // ID is auto-generated if not provided, but we might want to preserve it if exporting/importing same DB
                 // However, Prisma create usually ignores ID if default(cuid).
                 // For safety with cross-db, better let ID regen or use if possible. 
                 // Since schema uses CUID, we just map fields.
                 nis: student.nis,
                 nama: student.nama,
                 kelas: student.kelas,
                 tahunMasuk: student.tahunMasuk,
                 statusBayar: student.statusBayar,
                 totalTagihan: student.totalTagihan,
                 totalBayar: student.totalBayar,
               },
             });
             results.students.inserted++;
           } catch (e) {
             console.error('JSON Student error:', e);
             results.students.errors++;
           }
        }
      }

      // Process Cashflow
      if (data.cashflow && Array.isArray(data.cashflow)) {
        for (const cf of data.cashflow) {
          try {
            // Check if exists to avoid duplicates if ID provided?
            // Since ID is CUID, difficult to match unless we trust it.
            // For Cashflow, maybe better to just Create? Or check by unique fields if any? (None really).
            // We will just CREATE new records to avoid overwriting unless ID matches.
            // Actually, if ID is in JSON, we can try to Upsert.
            
            if (cf.id) {
               const exists = await prisma.cashflow.findUnique({ where: { id: cf.id } });
               if (exists) {
                 await prisma.cashflow.update({
                   where: { id: cf.id },
                   data: {
                     tanggal: new Date(cf.tanggal),
                     keterangan: cf.keterangan,
                     kodeAkun: cf.kodeAkun,
                     debit: cf.debit,
                     kredit: cf.kredit,
                   }
                 });
               } else {
                 await prisma.cashflow.create({
                    data: {
                      id: cf.id, // Force ID? Maybe
                      tanggal: new Date(cf.tanggal),
                      keterangan: cf.keterangan,
                      kodeAkun: cf.kodeAkun,
                      debit: cf.debit,
                      kredit: cf.kredit,
                    }
                 });
               }
            } else {
               await prisma.cashflow.create({
                 data: {
                   tanggal: new Date(cf.tanggal),
                   keterangan: cf.keterangan,
                   kodeAkun: cf.kodeAkun,
                   debit: cf.debit,
                   kredit: cf.kredit,
                 }
               });
            }
            results.cashflow.inserted++;
          } catch(e) {
             console.error('JSON Cashflow error:', e);
             results.cashflow.errors++;
          }
        }
      }

    } else {
      // Parse the Excel file from base64
      const buffer = Buffer.from(fileData, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Process Cashflow sheet
      if ((!sheets || sheets.includes('Cashflow')) && workbook.SheetNames.includes('Cashflow')) {
        const sheet = workbook.Sheets['Cashflow'];
        const data = XLSX.utils.sheet_to_json<CashflowRow>(sheet);

        for (const row of data) {
          try {
            let tanggal: Date;
            if (typeof row.Tanggal === 'number') {
              tanggal = excelDateToJSDate(row.Tanggal);
            } else if (row.Tanggal) {
              tanggal = new Date(row.Tanggal);
            } else {
              continue;
            }

            await prisma.cashflow.create({
              data: {
                tanggal,
                keterangan: row.Keterangan || '',
                kodeAkun: row['Kode Akun'] || '',
                debit: row.Debit || 0,
                kredit: row.Kredit || 0,
              },
            });
            results.cashflow.inserted++;
          } catch (error) {
            console.error('Cashflow row error:', error);
            results.cashflow.errors++;
          }
        }
      }

      // Process Data Siswa sheet
      if ((!sheets || sheets.includes('Data Siswa')) && workbook.SheetNames.includes('Data Siswa')) {
        const sheet = workbook.Sheets['Data Siswa'];
        const data = XLSX.utils.sheet_to_json<StudentRow>(sheet);

        for (const row of data) {
          try {
            if (!row.NIS || !row.Nama) continue;

            await prisma.student.upsert({
              where: { nis: String(row.NIS) },
              update: {
                nama: row.Nama,
                kelas: row.Kelas || '',
                tahunMasuk: row['Tahun Masuk'] || new Date().getFullYear(),
                statusBayar: row['Status Bayar'] || 'Belum Lunas',
                totalTagihan: row['Total Tagihan'] || 0,
                totalBayar: row['Total Bayar'] || 0,
              },
              create: {
                nis: String(row.NIS),
                nama: row.Nama,
                kelas: row.Kelas || '',
                tahunMasuk: row['Tahun Masuk'] || new Date().getFullYear(),
                statusBayar: row['Status Bayar'] || 'Belum Lunas',
                totalTagihan: row['Total Tagihan'] || 0,
                totalBayar: row['Total Bayar'] || 0,
              },
            });
            results.students.inserted++;
          } catch (error) {
            console.error('Student row error:', error);
            results.students.errors++;
          }
        }
      }

      // Process Akun sheet
      if ((!sheets || sheets.includes('Akun')) && workbook.SheetNames.includes('Akun')) {
        const sheet = workbook.Sheets['Akun'];
        const data = XLSX.utils.sheet_to_json<AccountRow>(sheet);

        for (const row of data) {
          try {
            if (!row['Kode Akun'] || !row['Nama Akun']) continue;

            await prisma.account.upsert({
              where: { kodeAkun: row['Kode Akun'] },
              update: {
                namaAkun: row['Nama Akun'],
                tipeAkun: row['Tipe Akun'] || 'Other',
                saldo: row.Saldo || 0,
              },
              create: {
                kodeAkun: row['Kode Akun'],
                namaAkun: row['Nama Akun'],
                tipeAkun: row['Tipe Akun'] || 'Other',
                saldo: row.Saldo || 0,
              },
            });
            results.accounts.inserted++;
          } catch (error) {
            console.error('Account row error:', error);
            results.accounts.errors++;
          }
        }
      }
    }

    return res.status(200).json({
      message: 'Import berhasil',
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({ error: 'Gagal mengimport data' });
  }
}
