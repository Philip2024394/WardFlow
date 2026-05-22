'use client';
// Bahasa Indonesia first, English fallback. See project rules.
// Stubs marked // TODO i18n are English-only until Phase 1.

import { useEffect, useState } from 'react';

export type Locale = 'id' | 'en';

export const STRINGS = {
  id: {
    common: {
      appName: 'WardFlow',
      tagline: 'Manajemen Bangsal Rumah Sakit',
      save: 'Simpan',
      saving: 'Menyimpan...',
      cancel: 'Batal',
      confirm: 'Konfirmasi',
      back: 'Kembali',
      logout: 'Keluar',
      loading: 'Memuat...',
      success: 'Berhasil',
      error: 'Terjadi kesalahan',
      retry: 'Coba lagi',
      copy: 'Salin',
      copied: 'Tersalin',
      revoke: 'Cabut',
      language: 'Bahasa',
    },
    login: {
      title: 'Masuk ke WardFlow',
      subtitle: 'Pilih peran Anda untuk melanjutkan',
      email: 'Email',
      password: 'Kata sandi',
      magicLink: 'Kirim tautan masuk ke email',
      submit: 'Masuk',
      submitting: 'Memproses...',
      noAccount: 'Belum punya akun? Hubungi admin rumah sakit Anda.',
      pickRole: 'Pilih peran',
      invalidCreds: 'Email atau kata sandi salah.',
      magicSent: 'Tautan masuk telah dikirim. Periksa email Anda.',
    },
    roles: {
      nurse: 'Perawat',
      doctor: 'Dokter',
      supervisor: 'Supervisor',
      admin: 'Administrator',
      reception: 'Resepsionis',
      family: 'Keluarga Pasien',
    },
    nurse: {
      dashboardTitle: 'Dasbor Shift',
      shiftStarted: 'Shift dimulai',
      assignedWards: 'Bangsal yang ditangani',
      patients: 'Pasien',
      lastRound: 'Ronde terakhir',
      noPatients: 'Belum ada pasien yang ditugaskan.',
      emergency: 'DARURAT',
      emergencyConfirm: 'Picu kode darurat untuk pasien ini?',
      bed: 'Kasur',
    },
    round: {
      title: 'Ronde Pasien',
      vitals: 'Tanda Vital',
      bp: 'Tekanan darah (mmHg)',
      bpSystolic: 'Sistolik',
      bpDiastolic: 'Diastolik',
      temp: 'Suhu (°C)',
      spo2: 'SpO₂ (%)',
      hr: 'Detak jantung (bpm)',
      rr: 'Pernapasan (/menit)',
      pain: 'Skor nyeri (0-10)',
      meds: 'Obat diberikan',
      notes: 'Catatan',
      photo: 'Foto (opsional)',
      takePhoto: 'Ambil foto',
      saveRound: 'Simpan ronde',
      saved: 'Ronde tersimpan',
      saveError: 'Gagal menyimpan ronde. Coba lagi.',
    },
    doctor: {
      dashboardTitle: 'Monitor Pasien',
      latestVitals: 'Vital terbaru',
      trends: 'Tren',
      trendsPlaceholder: 'Grafik tren akan tersedia di Fase 1.',
      shareWithFamily: 'Bagikan dengan Keluarga',
    },
    family: {
      portalTitle: 'Portal Keluarga WardFlow',
      enterCode: 'Masukkan kode akses',
      codePlaceholder: 'WPR-XXXX-XXXX',
      enter: 'Lihat info pasien',
      invalidCode: 'Kode tidak valid atau sudah kedaluwarsa.',
      viewTitle: 'Informasi Pasien',
      careRounds: 'Catatan Ronde',
      medications: 'Daftar Obat',
      doctorNotes: 'Catatan Dokter',
      emergencyInfo: 'Kontak Darurat',
      noAccessToSection: 'Bagian ini tidak dibagikan oleh dokter.',
      sessionExpired: 'Sesi telah berakhir. Silakan masukkan kode lagi.',
      signOut: 'Akhiri Sesi',
      readOnlyNotice:
        'Tampilan hanya-baca. Untuk pertanyaan klinis silakan hubungi perawat bangsal.',
    },
    share: {
      title: 'Bagikan Akses dengan Keluarga',
      familyName: 'Nama anggota keluarga',
      relationship: 'Hubungan',
      relOptions: {
        spouse: 'Pasangan',
        parent: 'Orang tua',
        child: 'Anak',
        sibling: 'Saudara',
        other: 'Lainnya',
      },
      sections: 'Bagian yang dibagikan',
      expiry: 'Masa berlaku',
      expiryOptions: { d1: '1 hari', d7: '7 hari', d30: '30 hari' },
      generate: 'Buat kode akses',
      generated: 'Kode dibuat. Bagikan ke keluarga:',
      whatsapp: 'Bagikan via WhatsApp',
      active: 'Kode aktif',
      noActive: 'Belum ada kode aktif.',
      expires: 'Berakhir',
    },
    toasts: {
      networkError: 'Koneksi bermasalah. Periksa internet Anda.',
      unauthorized: 'Anda tidak memiliki akses untuk tindakan ini.',
    },
  },
  en: {
    common: {
      appName: 'WardFlow',
      tagline: 'Hospital Ward Management',
      save: 'Save',
      saving: 'Saving...',
      cancel: 'Cancel',
      confirm: 'Confirm',
      back: 'Back',
      logout: 'Sign out',
      loading: 'Loading...',
      success: 'Success',
      error: 'Something went wrong',
      retry: 'Retry',
      copy: 'Copy',
      copied: 'Copied',
      revoke: 'Revoke',
      language: 'Language',
    },
    login: {
      title: 'Sign in to WardFlow',
      subtitle: 'Choose your role to continue',
      email: 'Email',
      password: 'Password',
      magicLink: 'Email me a sign-in link',
      submit: 'Sign in',
      submitting: 'Signing in...',
      noAccount: "Don't have an account? Contact your hospital administrator.",
      pickRole: 'Pick a role',
      invalidCreds: 'Incorrect email or password.',
      magicSent: 'Sign-in link sent. Check your email.',
    },
    roles: {
      nurse: 'Nurse',
      doctor: 'Doctor',
      supervisor: 'Supervisor',
      admin: 'Administrator',
      reception: 'Reception',
      family: 'Family Member',
    },
    nurse: {
      dashboardTitle: 'Shift Dashboard',
      shiftStarted: 'Shift started',
      assignedWards: 'Assigned wards',
      patients: 'Patients',
      lastRound: 'Last round',
      noPatients: 'No patients assigned yet.',
      emergency: 'EMERGENCY',
      emergencyConfirm: 'Trigger emergency code for this patient?',
      bed: 'Bed',
    },
    round: {
      title: 'Patient Round',
      vitals: 'Vitals',
      bp: 'Blood pressure (mmHg)',
      bpSystolic: 'Systolic',
      bpDiastolic: 'Diastolic',
      temp: 'Temperature (°C)',
      spo2: 'SpO₂ (%)',
      hr: 'Heart rate (bpm)',
      rr: 'Respiratory rate (/min)',
      pain: 'Pain score (0-10)',
      meds: 'Medications given',
      notes: 'Notes',
      photo: 'Photo (optional)',
      takePhoto: 'Take photo',
      saveRound: 'Save round',
      saved: 'Round saved',
      saveError: 'Could not save round. Try again.',
    },
    doctor: {
      dashboardTitle: 'Patient Monitor',
      latestVitals: 'Latest vitals',
      trends: 'Trends',
      trendsPlaceholder: 'Trend charts ship in Phase 1.',
      shareWithFamily: 'Share with Family',
    },
    family: {
      portalTitle: 'WardFlow Family Portal',
      enterCode: 'Enter access code',
      codePlaceholder: 'WPR-XXXX-XXXX',
      enter: 'View patient info',
      invalidCode: 'Code is invalid or has expired.',
      viewTitle: 'Patient Information',
      careRounds: 'Care Rounds',
      medications: 'Medications',
      doctorNotes: 'Doctor Notes',
      emergencyInfo: 'Emergency Contact',
      noAccessToSection: 'This section was not shared by the doctor.',
      sessionExpired: 'Session expired. Please enter the code again.',
      signOut: 'End Session',
      readOnlyNotice:
        'Read-only view. For clinical questions please contact the ward nurse.',
    },
    share: {
      title: 'Share Access with Family',
      familyName: 'Family member name',
      relationship: 'Relationship',
      relOptions: {
        spouse: 'Spouse',
        parent: 'Parent',
        child: 'Child',
        sibling: 'Sibling',
        other: 'Other',
      },
      sections: 'Sections to share',
      expiry: 'Expires in',
      expiryOptions: { d1: '1 day', d7: '7 days', d30: '30 days' },
      generate: 'Generate access code',
      generated: 'Code generated. Share with the family:',
      whatsapp: 'Share via WhatsApp',
      active: 'Active codes',
      noActive: 'No active codes yet.',
      expires: 'Expires',
    },
    toasts: {
      networkError: 'Network error. Check your connection.',
      unauthorized: "You don't have permission to do that.",
    },
  },
} as const;

export type StringsTree = typeof STRINGS.id;

const LOCALE_KEY = 'wf:locale';

export function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'id';
  const stored = window.localStorage.getItem(LOCALE_KEY);
  if (stored === 'id' || stored === 'en') return stored;
  const browser = window.navigator.language?.toLowerCase() ?? '';
  return browser.startsWith('en') ? 'en' : 'id';
}

export function useT() {
  const [locale, setLocale] = useState<Locale>('id');
  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);
  const t = STRINGS[locale];
  const setT = (next: Locale) => {
    setLocale(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_KEY, next);
    }
  };
  return { t, locale, setLocale: setT };
}
