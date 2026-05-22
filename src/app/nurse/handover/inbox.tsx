'use client';
// Nurse handover inbox — accept / decline incoming proposals with countdown.
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { playAlertTone } from '@/lib/audio/alert';

export interface HandoverProposalRow {
  junction_id: string;
  role: string;
  accepted_at: string | null;
  declined_at: string | null;
  proposal_id: string;
  patient_id: string;
  to_ward_id: string;
  notes: string | null;
  pending_tasks: string | null;
  medication_status: string | null;
  patient_condition: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  proposed_by: string;
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

export function HandoverInbox({ initialRows }: { initialRows: HandoverProposalRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Play handover tone once if there's a fresh pending proposal at mount.
    if (initialRows.some((r) => r.status === 'pending' && !r.accepted_at && !r.declined_at)) {
      playAlertTone('handover');
    }
  }, [initialRows]);

  const pending = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'pending' && !r.accepted_at && !r.declined_at)
        .sort(
          (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime(),
        ),
    [rows],
  );

  async function act(p: HandoverProposalRow, action: 'accept' | 'decline') {
    setBusy(p.junction_id);
    try {
      const res = await fetch(`/api/handover/${p.proposal_id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'accept' ? { method: 'patient_tap' } : {}),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.junction_id === p.junction_id
              ? action === 'accept'
                ? { ...r, accepted_at: new Date().toISOString() }
                : { ...r, declined_at: new Date().toISOString() }
              : r,
          ),
        );
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Shift Handover Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accept or decline each patient proposed to your care. The ER cannot transfer
          the patient until at least one nurse accepts. Tap{' '}
          <strong>Accept</strong> only after you can see the patient and confirm
          arrival at the bed.
        </p>
      </header>

      <AnimatePresence>
        {pending.length === 0 ? (
          <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
            No pending proposals. You will hear a chime when a new patient is proposed
            to you.
          </Card>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => {
              const minLeft = minutesLeft(p.expires_at);
              const urgent = minLeft <= 5;
              return (
                <motion.li
                  key={p.junction_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Card className="overflow-hidden">
                    <div className="flex items-start justify-between gap-3 border-b border-border/40 bg-muted/30 px-4 py-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Patient
                        </div>
                        <div className="font-mono text-sm">{p.patient_id.slice(0, 8)}…</div>
                      </div>
                      <Badge variant={urgent ? 'destructive' : 'secondary'}>
                        {minLeft} min left
                      </Badge>
                    </div>
                    <div className="space-y-2 px-4 py-3 text-sm">
                      <Field label="Role">{p.role}</Field>
                      {p.notes && <Field label="Notes">{p.notes}</Field>}
                      {p.pending_tasks && <Field label="Pending tasks">{p.pending_tasks}</Field>}
                      {p.medication_status && (
                        <Field label="Medication status">{p.medication_status}</Field>
                      )}
                      {p.patient_condition && (
                        <Field label="Patient condition">{p.patient_condition}</Field>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-border/40 px-4 py-3">
                      <Button
                        disabled={busy === p.junction_id}
                        onClick={() => act(p, 'accept')}
                      >
                        Accept patient
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy === p.junction_id}
                        onClick={() => act(p, 'decline')}
                      >
                        Decline
                      </Button>
                    </div>
                  </Card>
                </motion.li>
              );
            })}
          </ul>
        )}
      </AnimatePresence>

      {/* Read-only echo so the supervisor can see resolved proposals when auditing. */}
      {rows.some((r) => r.accepted_at || r.declined_at) && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recently resolved
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {rows
              .filter((r) => r.accepted_at || r.declined_at)
              .slice(0, 10)
              .map((r) => (
                <li
                  key={r.junction_id}
                  className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
                >
                  <span className="font-mono text-xs">{r.patient_id.slice(0, 8)}…</span>
                  <Badge variant={r.accepted_at ? 'default' : 'secondary'}>
                    {r.accepted_at ? 'Accepted' : 'Declined'}
                  </Badge>
                </li>
              ))}
          </ul>
        </section>
      )}
      {/* Note: subtle visual reminder — the bottom of every visible card is a tap-target ≥44px */}
      <div className="sr-only" aria-live="polite">
        {pending.length === 0
          ? 'No pending handover proposals.'
          : `${pending.length} pending handover proposals.`}{' '}
        Use {now ? '' : ''}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
