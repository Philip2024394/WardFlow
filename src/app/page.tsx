import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  ShieldCheck,
  Stethoscope,
  Activity,
  Users,
  Lock,
  Languages,
} from 'lucide-react';
import { CodeEntry } from './code-entry';

export default function LandingPage() {
  return (
    <main className="relative min-h-screen text-slate-100">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[length:100%_auto] bg-top bg-no-repeat md:bg-cover md:bg-center"
        style={{
          backgroundImage:
            "url('https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%2023,%202026,%2006_27_09%20AM.png')",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-slate-950/90"
      />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://ik.imagekit.io/nepgaxllc/Untitleddsfsdfsdfsdf-removebg-preview.png"
            alt="WardFlow logo"
            className="h-10 w-10 object-contain"
          />
          <span className="text-2xl font-bold tracking-tight">WardFlow</span>
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
        <CodeEntry />
        <p className="mt-5 text-xs text-slate-300">
          Nurse or doctor without a code yet?{' '}
          <Link href="/signup" className="underline">
            Create an account
          </Link>
        </p>
        <p className="mt-4 text-xs text-slate-400">
          Phase 0 scaffold — not a certified medical device.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-3">
        {[
          {
            icon: Stethoscope,
            title: 'For Nurses',
            body: 'Fast rounds, one-touch vital signs, large emergency button.',
          },
          {
            icon: Activity,
            title: 'For Doctors',
            body: 'Monitor patients remotely, share selected info with family.',
          },
          {
            icon: Users,
            title: 'For Family',
            body: 'Access the read-only code provided by your doctor. No account login required.',
          },
          {
            icon: ShieldCheck,
            title: 'Audit Trail',
            body: 'Every action is logged — INSERT-only audit_logs in the database.',
          },
          {
            icon: Lock,
            title: 'RLS per Role',
            body: 'Postgres Row-Level Security restricts data per role and ward.',
          },
          {
            icon: Languages,
            title: 'Indonesian',
            body: 'Main interface language, English fallback. Prepared for local staff.',
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
