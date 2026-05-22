'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PatientCard } from '@/components/PatientCard';
import { EmergencyButton } from '@/components/EmergencyButton';
import { useT } from '@/lib/i18n/strings';

// Phase 0 sample roster. Real impl reads from supabase.
const SAMPLE_PATIENTS = [
  {
    id: 'p-001',
    full_name: 'Budi Santoso',
    photo_url: null,
    bed_no: '12A',
    risk_level: 'green' as const,
    lastRoundAt: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  {
    id: 'p-002',
    full_name: 'Siti Rahayu',
    photo_url: null,
    bed_no: '12B',
    risk_level: 'yellow' as const,
    lastRoundAt: new Date(Date.now() - 47 * 60_000).toISOString(),
  },
  {
    id: 'p-003',
    full_name: 'Andi Wijaya',
    photo_url: null,
    bed_no: '14C',
    risk_level: 'orange' as const,
    lastRoundAt: new Date(Date.now() - 8 * 60_000).toISOString(),
  },
  {
    id: 'p-004',
    full_name: 'Dewi Lestari',
    photo_url: null,
    bed_no: '14D',
    risk_level: 'red' as const,
    lastRoundAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: 'p-005',
    full_name: 'Joko Susilo',
    photo_url: null,
    bed_no: '15A',
    risk_level: 'green' as const,
    lastRoundAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  },
  {
    id: 'p-006',
    full_name: 'Maya Putri',
    photo_url: null,
    bed_no: '15B',
    risk_level: 'yellow' as const,
    lastRoundAt: new Date(Date.now() - 35 * 60_000).toISOString(),
  },
];

function useShiftTimer(startedAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const diffMs = now - startedAt;
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}j ${m}m`;
}

export function NurseDashboard() {
  const { t } = useT();
  const [shiftStartedAt] = useState(() => Date.now() - 2 * 3_600_000 - 14 * 60_000);
  const shift = useShiftTimer(shiftStartedAt);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            WardFlow
          </p>
          <h1 className="text-xl font-bold">{t.nurse.dashboardTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-semibold">
              {t.nurse.shiftStarted}: {shift}
            </span>
          </div>
          <Link href="/login">
            <Button variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
              {t.common.logout}
            </Button>
          </Link>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <p className="text-sm font-medium">{t.nurse.assignedWards}:</p>
        {['Mawar 3', 'Melati 2'].map((w) => (
          <Badge key={w} variant="secondary">
            {w}
          </Badge>
        ))}
      </div>

      <Separator className="my-5" />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t.nurse.patients}
      </h2>
      {SAMPLE_PATIENTS.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.nurse.noPatients}</p>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {SAMPLE_PATIENTS.map((p) => (
            <motion.div
              key={p.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
            >
              <PatientCard
                patient={p}
                lastRoundAt={p.lastRoundAt}
                href={`/nurse/patients/${p.id}`}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <EmergencyButton />
    </div>
  );
}
