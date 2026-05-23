'use client';
import { useEffect, useState } from 'react';
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

type Locale = 'en' | 'id';

const STRINGS = {
  en: {
    eyebrow: 'For Indonesian Hospitals',
    title: 'Safe, Integrated, Transparent Ward Management.',
    subtitle:
      'WardFlow unifies nurse rounds, remote doctor monitoring, and read-only access for patient families — with an immutable audit trail.',
    disclaimer: 'Phase 0 scaffold — not a certified medical device.',
    noCodeYet: 'Nurse or doctor without a code yet?',
    createAccount: 'Create an account',
    footer:
      'WardFlow Phase 0 — Requires Permenkes 24/2022 compliance review before production use.',
    code: {
      placeholder: 'Enter your code',
      submit: 'Sign in',
      submitting: 'Signing in…',
      errorInvalid: 'Code not found. Check and try again.',
      errorExpired: 'This code has expired.',
      errorRevoked: 'This code has been revoked.',
      errorOther: 'Sign-in failed.',
      errorNetwork: 'Network error. Try again.',
    },
    cards: [
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
    ],
  },
  id: {
    eyebrow: 'Untuk Rumah Sakit Indonesia',
    title: 'Manajemen Bangsal yang Aman, Terintegrasi, dan Transparan.',
    subtitle:
      'WardFlow menyatukan ronde perawat, monitor dokter jarak jauh, dan akses read-only untuk keluarga pasien — dengan jejak audit yang tidak dapat diubah.',
    disclaimer:
      'Skema Fase 0 — bukan perangkat medis bersertifikasi.',
    noCodeYet: 'Perawat atau dokter belum punya kode?',
    createAccount: 'Buat akun',
    footer:
      'WardFlow Fase 0 — Memerlukan tinjauan kepatuhan Permenkes 24/2022 sebelum digunakan dalam produksi.',
    code: {
      placeholder: 'Masukkan kode Anda',
      submit: 'Masuk',
      submitting: 'Memproses…',
      errorInvalid: 'Kode tidak ditemukan. Periksa dan coba lagi.',
      errorExpired: 'Kode ini telah kedaluwarsa.',
      errorRevoked: 'Kode ini telah dicabut.',
      errorOther: 'Gagal masuk.',
      errorNetwork: 'Kesalahan jaringan. Coba lagi.',
    },
    cards: [
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
    ],
  },
};

const LOCALE_KEY = 'wf_locale';

export default function LandingPage() {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
      if (stored === 'en' || stored === 'id') setLocale(stored);
    } catch {
      // ignore
    }
  }, []);

  function pick(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore
    }
  }

  const t = STRINGS[locale];

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
        <div
          role="group"
          aria-label="Language"
          className="inline-flex items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/60 text-xs"
        >
          {(['id', 'en'] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pick(l)}
              aria-pressed={locale === l}
              className={`min-h-[36px] min-w-[44px] px-3 font-semibold uppercase transition ${
                locale === l
                  ? 'bg-primary text-primary-foreground'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-primary">
          {t.eyebrow}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
          {t.title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
          {t.subtitle}
        </p>
        <CodeEntry labels={t.code} />
        <p className="mt-5 text-xs text-slate-300">
          {t.noCodeYet}{' '}
          <Link href="/signup" className="underline">
            {t.createAccount}
          </Link>
        </p>
        <p className="mt-4 text-xs text-slate-400">{t.disclaimer}</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-3">
        {t.cards.map((f) => (
          <Card key={f.title} className="border-slate-800 bg-slate-900/60 p-5">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
            <p className="mt-1 text-xs text-slate-400">{f.body}</p>
          </Card>
        ))}
      </section>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        {t.footer}
      </footer>
    </main>
  );
}
