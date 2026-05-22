'use client';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { subscribeAlertFeed } from '@/lib/realtime/channels';
import { enableAudioAlerts, audioAlertsEnabled, playAlertTone } from '@/lib/audio/alert';

export interface PatientCard {
  patient_id: string;
  patient_name: string;
  bed_no: string | null;
  ward_name: string | null;
  ward_code: string | null;
  risk_level: 'green' | 'yellow' | 'orange' | 'red';
  doctor_id: string | null;
  nurse_id: string | null;
  next_due_at: string | null;
  last_visit_at: string | null;
}

const GRACE_MIN = 30;

function cardState(c: PatientCard, now: number): 'green' | 'yellow' | 'red' {
  if (!c.next_due_at) return c.risk_level === 'red' ? 'red' : 'green';
  const dueMs = new Date(c.next_due_at).getTime();
  const minLeft = (dueMs - now) / 60_000;
  if (minLeft > 30) return 'green';
  if (minLeft > -GRACE_MIN) return 'yellow';
  return 'red';
}

const STYLE_BY_STATE: Record<'green' | 'yellow' | 'red', { border: string; text: string; bg: string; label: string; icon: string }> = {
  green: { border: 'border-l-green-600', text: 'text-green-700 dark:text-green-300', bg: '', label: 'On schedule', icon: '●' },
  yellow: { border: 'border-l-amber-500', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Due soon', icon: '▲' },
  red: { border: 'border-l-red-600', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30', label: 'OVERDUE', icon: '■' },
};

export function DashboardGrid({ initialCards }: { initialCards: PatientCard[] }) {
  const [cards] = useState(initialCards);
  const [now, setNow] = useState<number>(() => Date.now());
  const [audio, setAudio] = useState(false);

  useEffect(() => {
    setAudio(audioAlertsEnabled());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribeAlertFeed((payload) => {
      const ev = payload as { eventType?: string; new?: { state?: string } };
      if (ev.eventType === 'INSERT' && ev.new?.state === 'open') {
        playAlertTone('red');
      }
    });
    return unsub;
  }, []);

  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const card of cards) c[cardState(card, now)] += 1;
    return c;
  }, [cards, now]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Hospital dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every active patient and their next scheduled check-up. Cards turn red 30
            minutes past due.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Green: {counts.green}</Badge>
          <Badge variant="secondary">Yellow: {counts.yellow}</Badge>
          <Badge variant="destructive">Red: {counts.red}</Badge>
          <Button
            variant={audio ? 'secondary' : 'outline'}
            onClick={async () => {
              await enableAudioAlerts();
              setAudio(true);
            }}
          >
            {audio ? 'Audio on' : 'Enable audio'}
          </Button>
        </div>
      </header>

      {cards.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
          No active patients. Cards appear here when patients are admitted.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((c) => {
            const state = cardState(c, now);
            const sty = STYLE_BY_STATE[state];
            const minLeft = c.next_due_at
              ? Math.round((new Date(c.next_due_at).getTime() - now) / 60_000)
              : null;
            return (
              <Card
                key={c.patient_id}
                className={`overflow-hidden border-l-4 ${sty.border} ${sty.bg}`}
              >
                <div className="space-y-1 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${sty.text}`}>
                      {sty.icon} {sty.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.ward_code || c.ward_name || '—'} {c.bed_no ? `· ${c.bed_no}` : ''}
                    </span>
                  </div>
                  <div className="truncate text-sm font-semibold" title={c.patient_name}>
                    {c.patient_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Next due:{' '}
                    {c.next_due_at ? (
                      <>
                        {new Date(c.next_due_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        {minLeft != null && (
                          <span className={sty.text}>
                            ({minLeft >= 0 ? `${minLeft} min` : `${-minLeft} min late`})
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last visit:{' '}
                    {c.last_visit_at
                      ? new Date(c.last_visit_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
