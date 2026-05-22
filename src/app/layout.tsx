import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { AuditLogger } from '@/components/AuditLogger';

export const metadata: Metadata = {
  title: 'WardFlow — Manajemen Bangsal Rumah Sakit',
  description:
    'Platform manajemen bangsal rumah sakit untuk Indonesia. Phase 0 scaffold.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ToastProvider>
          <AuditLogger>{children}</AuditLogger>
        </ToastProvider>
      </body>
    </html>
  );
}
