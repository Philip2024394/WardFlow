'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PatientMeta {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  country: string | null;
  allergies: string[] | null;
  blood_type: string | null;
  ward_id: string | null;
  bed_no: string | null;
  risk_level: string;
  admitted_at: string;
}

type Kind =
  | 'er_intake'
  | 'doctor_assignment'
  | 'doctor_order'
  | 'procedure'
  | 'visit_confirmation';

interface Event {
  kind: Kind;
  occurred_at: string;
  summary: string;
  details: Record<string, unknown>;
  actor_name: string | null;
}

const KIND_META: Record<
  Kind,
  { label: string; color: string }
> = {
  er_intake: { label: 'ER arrival', color: 'bg-rose-500/20 text-rose-300' },
  doctor_assignment: {
    label: 'Doctor',
    color: 'bg-indigo-500/20 text-indigo-300',
  },
  doctor_order: {
    label: 'Order',
    color: 'bg-amber-500/20 text-amber-300',
  },
  procedure: { label: 'Procedure', color: 'bg-emerald-500/20 text-emerald-300' },
  visit_confirmation: {
    label: 'Nurse visit',
    color: 'bg-sky-500/20 text-sky-300',
  },
};

const KIND_LABELS: { key: Kind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'er_intake', label: 'ER arrivals' },
  { key: 'doctor_assignment', label: 'Doctors' },
  { key: 'doctor_order', label: 'Orders' },
  { key: 'procedure', label: 'Procedures' },
  { key: 'visit_confirmation', label: 'Nurse visits' },
];

export function HistoryView({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<PatientMeta | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/patients/${patientId}/history`);
      if (!res.ok) {
        setError(res.status === 401 ? 'Not authorised.' : 'Failed to load history.');
        setLoading(false);
        return;
      }
      const j = await res.json().catch(() => ({}));
      setPatient(j.patient ?? null);
      setEvents((j.events as Event[]) ?? []);
      setLoading(false);
    })();
  }, [patientId]);

  const visible =
    filter === 'all' ? events : events.filter((e) => e.kind === filter);

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-bold">
          {patient ? `${patient.full_name} — care history` : 'Care history'}
        </h1>
        {patient && (
          <p className="text-xs text-slate-400">
            DOB {patient.dob ?? '—'} · {patient.gender ?? '—'} ·{' '}
            {patient.country ?? 'country n/a'} · risk {patient.risk_level}
            {patient.bed_no ? ` · bed ${patient.bed_no}` : ''}
            {patient.allergies && patient.allergies.length > 0 && (
              <>
                {' · allergies: '}
                <span className="text-amber-300">
                  {patient.allergies.join(', ')}
                </span>
              </>
            )}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Link href={`/patients/${patientId}/procedures`}>
            <Button variant="outline" size="sm">
              Procedures
            </Button>
          </Link>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {KIND_LABELS.map((k) => (
          <button
            type="button"
            key={k.key}
            onClick={() => setFilter(k.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === k.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-slate-700 bg-slate-800 text-slate-200'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <Card className="border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          No events of this kind yet.
        </Card>
      )}

      <ol className="relative space-y-3 border-l border-slate-800 pl-4">
        {visible.map((e, i) => (
          <li key={`${e.kind}-${e.occurred_at}-${i}`} className="relative">
            <span
              className={`absolute -left-[22px] top-2 inline-block h-3 w-3 rounded-full ${
                KIND_META[e.kind].color
              }`}
            />
            <Card className="border-slate-800 bg-slate-900 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={KIND_META[e.kind].color}>
                  {KIND_META[e.kind].label}
                </Badge>
                <span className="text-xs text-slate-400">
                  {new Date(e.occurred_at).toLocaleString()}
                </span>
                {e.actor_name && (
                  <span className="text-xs text-slate-400">
                    · {e.actor_name}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-100">{e.summary}</p>
              <EventDetails kind={e.kind} details={e.details} />
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

function EventDetails({
  kind,
  details,
}: {
  kind: Kind;
  details: Record<string, unknown>;
}) {
  if (kind === 'er_intake') {
    const meds = (details.medications_given_in_er as string[] | undefined) ?? [];
    return (
      <div className="mt-1 text-xs text-slate-400">
        Chief complaint: {String(details.chief_complaint ?? '—')} · severity{' '}
        {String(details.severity ?? '—')}
        {meds.length > 0 && (
          <>
            <br />
            ER meds: <em>{meds.join(', ')}</em>
          </>
        )}
      </div>
    );
  }
  if (kind === 'doctor_order' && details.order_kind === 'medication') {
    return (
      <div className="mt-1 text-xs text-slate-400">
        {String(details.drug_name ?? '')} {String(details.dose ?? '')}{' '}
        {String(details.route ?? '')}{' '}
        {details.schedule_cron ? `· schedule ${String(details.schedule_cron)}` : ''}
        {details.duration ? `· ${String(details.duration)}` : ''}
        {details.superseded ? ' · superseded' : ''}
      </div>
    );
  }
  if (kind === 'doctor_order' && details.order_kind === 'treatment_note' && details.body) {
    return (
      <div className="mt-1 text-xs text-slate-400">{String(details.body)}</div>
    );
  }
  if (kind === 'procedure') {
    const lines: string[] = [];
    if (details.notes) lines.push(`Note: ${String(details.notes)}`);
    if (details.result_summary)
      lines.push(`Result: ${String(details.result_summary)}`);
    if (details.cancelled_reason)
      lines.push(`Cancelled: ${String(details.cancelled_reason)}`);
    if (lines.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5 text-xs text-slate-400">
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    );
  }
  if (kind === 'visit_confirmation') {
    const sp = details.signature_payload as Record<string, unknown> | null;
    if (!sp) return null;
    const bits: string[] = [];
    if (sp.geofence_enforced === true)
      bits.push(`geofence ${sp.geofence_distance_m}m`);
    else if (sp.gps_missing === true) bits.push('no GPS');
    if (sp.token_tail) bits.push(`band …${String(sp.token_tail)}`);
    if (bits.length === 0) return null;
    return (
      <div className="mt-1 text-xs text-slate-400">{bits.join(' · ')}</div>
    );
  }
  return null;
}
