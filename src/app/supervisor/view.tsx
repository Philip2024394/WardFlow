'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { subscribeAlertFeed } from '@/lib/realtime/channels';
import { enableAudioAlerts, audioAlertsEnabled, playAlertTone } from '@/lib/audio/alert';

export interface AlertRow {
  id: string;
  kind: string;
  state: string;
  patient_id: string | null;
  nurse_user_id: string | null;
  scheduled_visit_id: string | null;
  payload: Record<string, unknown> | null;
  opened_at: string;
}

export function SupervisorView({ initialAlerts }: { initialAlerts: AlertRow[] }) {
  const [alerts, setAlerts] = useState<AlertRow[]>(initialAlerts);
  const [audio, setAudio] = useState(false);
  const [reasonByAlert, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setAudio(audioAlertsEnabled());
  }, []);

  useEffect(() => {
    const unsub = subscribeAlertFeed((payload) => {
      const ev = payload as { eventType?: string; new?: AlertRow };
      if (ev.eventType === 'INSERT' && ev.new && ev.new.state === 'open') {
        setAlerts((prev) => [ev.new!, ...prev]);
        playAlertTone('red');
      } else if (ev.eventType === 'UPDATE' && ev.new) {
        setAlerts((prev) =>
          prev
            .map((a) => (a.id === ev.new!.id ? ev.new! : a))
            .filter((a) => a.state === 'open'),
        );
      }
    });
    return unsub;
  }, []);

  async function ack(a: AlertRow) {
    const reason = (reasonByAlert[a.id] || '').trim();
    if (reason.length < 3) {
      alert('Please enter a reason (min 3 chars) before acknowledging.');
      return;
    }
    setBusy(a.id);
    try {
      const res = await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alert_id: a.id, reason_note: reason }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((x) => x.id !== a.id));
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Supervisor — Open alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Red alerts mean a scheduled check-up was more than 30 minutes late, or a
            shift change was not properly handed off. Acknowledge with a written reason
            — the entry is permanent.
          </p>
        </div>
        <Button
          variant={audio ? 'secondary' : 'outline'}
          onClick={async () => {
            await enableAudioAlerts();
            setAudio(true);
          }}
        >
          {audio ? 'Audio alerts on' : 'Enable audio alerts'}
        </Button>
      </header>

      {alerts.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
          No open alerts. Live feed is active — you will hear a chime on any new red
          alert.
        </Card>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id}>
              <Card className="overflow-hidden border-l-4 border-l-red-600">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-red-50 dark:bg-red-950/30 px-4 py-3">
                  <div>
                    <Badge variant="destructive" className="uppercase">
                      {a.kind.replaceAll('_', ' ')}
                    </Badge>
                    <span className="ml-2 font-mono text-xs">
                      patient {a.patient_id?.slice(0, 8) ?? '—'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.opened_at).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-3 px-4 py-3 text-sm">
                  {a.payload?.minutes_late ? (
                    <div className="text-sm">
                      <strong>{Math.round(Number(a.payload.minutes_late))} min</strong>{' '}
                      past due
                    </div>
                  ) : null}
                  <div>
                    <Label htmlFor={`reason-${a.id}`}>Acknowledgement reason</Label>
                    <Input
                      id={`reason-${a.id}`}
                      placeholder="e.g. nurse was responding to code blue in bed 4"
                      value={reasonByAlert[a.id] || ''}
                      onChange={(e) =>
                        setReason((s) => ({ ...s, [a.id]: e.target.value }))
                      }
                    />
                  </div>
                  <Button disabled={busy === a.id} onClick={() => ack(a)}>
                    Acknowledge
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
