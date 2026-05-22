import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ShieldCheck,
  Stethoscope,
  Activity,
  Users,
  Lock,
  Languages,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-tight">WardFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/family">
            <Button variant="ghost" size="sm">
              Portal Keluarga
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm">Masuk</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-primary">
          Untuk Rumah Sakit Indonesia
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          Manajemen Bangsal yang Aman, Terintegrasi, dan Transparan.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
          WardFlow menyatukan ronde perawat, monitor dokter jarak jauh, dan akses
          read-only untuk keluarga pasien — dengan jejak audit yang tidak dapat diubah.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login">
            <Button size="xl">Mulai Demo</Button>
          </Link>
          <Link href="/family">
            <Button size="xl" variant="outline">
              Saya Anggota Keluarga
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Phase 0 scaffold — bukan perangkat medis bersertifikasi.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-3">
        {[
          {
            icon: Stethoscope,
            title: 'Untuk Perawat',
            body: 'Ronde cepat, vital sign satu sentuhan, tombol darurat besar.',
          },
          {
            icon: Activity,
            title: 'Untuk Dokter',
            body: 'Monitor pasien dari jarak jauh, bagikan info pilihan dengan keluarga.',
          },
          {
            icon: Users,
            title: 'Untuk Keluarga',
            body: 'Akses kode read-only yang diberikan oleh dokter. Tidak ada login akun.',
          },
          {
            icon: ShieldCheck,
            title: 'Jejak Audit',
            body: 'Setiap aksi tercatat — audit_logs INSERT-only di database.',
          },
          {
            icon: Lock,
            title: 'RLS per Peran',
            body: 'Postgres Row-Level Security membatasi data per peran dan bangsal.',
          },
          {
            icon: Languages,
            title: 'Bahasa Indonesia',
            body: 'Antarmuka utama Bahasa, fallback English. Disiapkan untuk staf lokal.',
          },
        ].map((f) => (
          <Card key={f.title} className="border-slate-800 bg-slate-900/60 p-5">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs text-slate-400">{f.body}</p>
          </Card>
        ))}
      </section>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        WardFlow Phase 0 — Memerlukan tinjauan kepatuhan Permenkes 24/2022 sebelum
        digunakan dalam produksi.
      </footer>
    </main>
  );
}
