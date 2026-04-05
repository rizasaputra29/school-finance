'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BookOpen, Send } from 'lucide-react';
import { formatShortDate } from '@/lib/utils';

interface Account {
  id: string;
  kodeAkun: string;
  namaAkun: string;
}

interface JurnalLine {
  id: string;
  tanggal: string;
  kodeAkun: string;
  namaAkun: string;
  debit: number;
  kredit: number;
  keterangan: string;
  reference: string | null;
}

export default function JurnalPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kodeAkun, setKodeAkun] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const year = new Date().getFullYear();
    return `${year}-01-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const year = new Date().getFullYear();
    return `${year}-12-31`;
  });
  const [keterangan, setKeterangan] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [lines, setLines] = useState<JurnalLine[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(result => {
        if (!result.success) {
          toast.error(result.error?.message || 'Gagal memuat data akun');
          return;
        }
        if (Array.isArray(result.data)) {
          setAccounts(result.data);
        } else {
          console.error('Expected accounts array, got:', result);
        }
      })
      .catch(e => {
        console.error(e);
        toast.error('Terjadi kesalahan saat memuat data akun');
      });
  }, []);



  const handleTampilkanData = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: '100', // large page limit for reporting
      });
      if (keterangan) params.append('search', keterangan);
      // Wait, standard jurnal API doesn't support 'kodeAkun' param effectively for filtering lines? 
      // The API filters JournalEntry by date/search, so let's fetch those and filter lines client-side if needed.

      const res = await fetch(`/api/reports/jurnal?${params.toString()}`);
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error?.message || 'Gagal memuat jurnal');
        return;
      }
      
      const journals = result.data || [];
      
      // Flatten journals to lines
      let flattenedLines: JurnalLine[] = [];
      for (const j of journals) {
        for (const e of j.entries) {
          flattenedLines.push({
            id: `${j.id}-${e.kodeAkun}`,
            tanggal: j.tanggal, // use journal date
            kodeAkun: e.kodeAkun,
            namaAkun: e.namaAkun,
            debit: e.debit,
            kredit: e.kredit,
            keterangan: j.keterangan,
            reference: j.reference
          });
        }
      }

      // Apply local filter for akun since backend journal search is by JournalEntry not line
      if (kodeAkun) {
        flattenedLines = flattenedLines.filter(l => l.kodeAkun === kodeAkun);
      }

      // Sort by date ascending to match images
      flattenedLines.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

      setLines(flattenedLines);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return formatShortDate(dateStr);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-gray-700" />
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Jurnal Umum</h1>
      </div>

      {/* Filter Card */}
      <Card>
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Cari Berdasarkan</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
                <option>Periode</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Posisi</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
                <option>Semua</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Tanggal Awal</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Akun</Label>
              <select 
                value={kodeAkun} 
                onChange={(e) => setKodeAkun(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value=""># Pilih Akun #</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.kodeAkun}>{a.kodeAkun} - {a.namaAkun}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Tanggal Akhir</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Cari Berdasarkan Keterangan</Label>
              <Input
                type="text"
                placeholder="Masukan No. Nota atau Kata"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-4 flex flex-col justify-end">
            <div className="h-[68px] flex items-end">
              <Button 
                onClick={handleTampilkanData} 
                disabled={isLoading}
                className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white flex items-center justify-center gap-2 h-10"
              >
                <Send className="w-4 h-4" />
                {isLoading ? 'Memuat...' : 'Tampilkan Data'}
              </Button>
            </div>
          </div>
          
        </CardContent>
      </Card>

      {/* Report Output */}
      {hasSearched && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-white">
                  <TableHead className="font-semibold text-gray-700 w-32 border-r">Tanggal</TableHead>
                  <TableHead className="font-semibold text-gray-700 border-r">Akun</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-36 border-r">Debet</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-36 border-r">Kredit</TableHead>
                  <TableHead className="font-semibold text-gray-700 min-w-[300px]">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id} className="hover:bg-slate-50/50 bg-white">
                    <TableCell className="text-gray-600 border-r py-3">{formatDateTime(line.tanggal)}</TableCell>
                    <TableCell className="text-gray-800 border-r font-medium text-[13px]">{line.namaAkun}</TableCell>
                    <TableCell className="text-gray-700 border-r text-[13px]">{line.debit > 0 ? line.debit.toFixed(2) : '0.00'}</TableCell>
                    <TableCell className="text-gray-700 border-r text-[13px]">{line.kredit > 0 ? line.kredit.toFixed(2) : '0.00'}</TableCell>
                    <TableCell className="text-gray-500 text-[13px] truncate">
                      {line.keterangan} {line.reference ? `| RefID: ${line.reference}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
                
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500 italic">
                      Tidak ada transaksi pada periode ini
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
