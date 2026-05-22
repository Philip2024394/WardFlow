'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime, riskColorClass } from '@/lib/utils';
import { useT } from '@/lib/i18n/strings';

const SAMPLE = [
  {
    id: 'p-001',
    full_name: 'Budi Santoso',
    bed_no: '12A',
    risk: 'green',
    vitals: { bp: '118/76', spo2: 98, hr: 78, temp: 36.7 },
    lastRoundAt: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  {
    id: 'p-002',
    full_name: 'Siti Rahayu',
    bed_no: '12B',
    risk: 'yellow',
    vitals: { bp: '142/91', spo2: 95, hr: 102, temp: 37.8 },
    lastRoundAt: new Date(Date.now() - 47 * 60_000).toISOString(),
  },
  {
    id: 'p-004',
    full_name: 'Dewi Lestari',
    bed_no: '14D',
    risk: 'red',
    vitals: { bp: '88/52', spo2: 89, hr: 124, temp: 38.9 },
    lastRoundAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
] as const;

export function DoctorDashboard() {
  const { t, locale } = useT();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            WardFlow
          </p>
          <h1 className="text-xl font-bold">{t.doctor.dashboardTitle}</h1>
        </div>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            <LogOut className="h-4 w-4" />
            {t.common.logout}
          </Button>
        </Link>
      </header>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        {SAMPLE.map((p) => (
          <motion.div
            key={p.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              show: { opacity: 1, y: 0 },
            }}
          >
            <Link href={`/doctor/patients/${p.id}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          riskColorClass(p.risk as 'green' | 'yellow' | 'orange' | 'red')
                        )}
                      />
                      <p className="text-sm font-semibold">{p.full_name}</p>
                    </div>
                    <Badge variant="secondary" className="mt-1">
                      {t.nurse.bed} {p.bed_no}
                    </Badge>
                  </div>
                  <Activity className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <Cell label="BP" value={p.vitals.bp} />
                  <Cell label="SpO₂" value={`${p.vitals.spo2}%`} />
                  <Cell label="HR" value={`${p.vitals.hr}`} />
                  <Cell label="T°" value={`${p.vitals.temp}`} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t.nurse.lastRound} {formatRelativeTime(p.lastRoundAt, locale)}
                </p>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2 text-center">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
