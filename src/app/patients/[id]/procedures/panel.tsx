'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface Procedure {
  id: string;
  patient_id: string;
  intake_id: string | null;
  kind: ProcedureKind;
  status: ProcedureStatus;
  ordered_by: string;
  ordered_at: string;
  notes: string | null;
  performed_by: string | null;
  performed_at: string | null;
  result_summary: string | null;
  result_values: Record<string, unknown> | null;
  result_media_id: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  ordered_user: { full_name: string } | { full_name: string }[] | null;
}

type ProcedureKind =
  | 'xray' | 'blood_test' | 'ct_scan' | 'mri' | 'ultrasound' | 'ecg'
  | 'urine_test' | 'biopsy' | 'culture' | 'endoscopy' | 'other';
type ProcedureStatus = 'ordered' | 'in_progress' | 'completed' | 'cancelled';

const KIND_LABEL: Record<ProcedureKind, string> = {
  xray: 'X-ray',
  blood_test: 'Blood test',
  ct_scan: 'CT scan',
  mri: 'MRI',
  ultrasound: 'Ultrasound',
  ecg: 'ECG',
  urine_test: 'Urine test',
  biopsy: 'Biopsy',
  culture: 'Culture',
  endoscopy: 'Endoscopy',
  other: 'Other',
};

const STATUS_VARIANT: Record<ProcedureStatus, 'default' | 'secondary' | 'outline'> = {
  ordered: 'outline',
  in_progress: 'secondary',
  completed: 'default',
  cancelled: 'outline',
};

interface Session {
  role: 'nurse' | 'doctor' | null;
}

export function ProceduresPanel({ patientId }: { patientId: string }) {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [session, setSession] = useState<Session>({ role: null });
  const [loading, setLoading] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [pRes, sRes] = await Promise.all([
      fetch(`/api/procedures?patient_id=${patientId}`),
      fetch('/api/auth/me').catch(() => null),
    ]);
    const pj = await pRes.json().catch(() => ({}));
    setProcedures((pj.procedures as Procedure[]) ?? []);
    if (sRes?.ok) {
      const sj = await sRes.json().catch(() => ({}));
      setSession({ role: sj.role ?? null });
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const isDoctor = session.role === 'doctor';

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Procedures</h1>
          <p className="text-xs text-slate-400">
            X-rays, blood tests, scans, biopsies and other diagnostics.
            {isDoctor
              ? ' You can order new procedures and record results.'
              : ' Read-only — only doctors can order or modify procedures.'}
          </p>
        </div>
        {isDoctor && (
          <Button onClick={() => setShowOrder(true)}>+ Order procedure</Button>
        )}
      </header>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && procedures.length === 0 && (
        <Card className="border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          No procedures yet for this patient.
        </Card>
      )}

      <ul className="space-y-2">
        {procedures.map((p) => {
          const orderedName = Array.isArray(p.ordered_user)
            ? p.ordered_user[0]?.full_name
            : p.ordered_user?.full_name;
          return (
            <li key={p.id}>
              <Card className="border-slate-800 bg-slate-900 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {KIND_LABEL[p.kind]}
                      </span>
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {p.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Ordered by {orderedName ?? '—'} ·{' '}
                      {new Date(p.ordered_at).toLocaleString()}
                    </div>
                    {p.notes && (
                      <div className="mt-1 text-xs text-slate-300">
                        <em>{p.notes}</em>
                      </div>
                    )}
                    {p.status === 'completed' && p.result_summary && (
                      <div className="mt-2 rounded bg-slate-800 p-2 text-xs text-slate-200">
                        <strong>Result:</strong> {p.result_summary}
                        {p.performed_at && (
                          <div className="mt-1 text-slate-400">
                            Recorded {new Date(p.performed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                    {p.status === 'cancelled' && (
                      <div className="mt-2 text-xs text-rose-400">
                        Cancelled: {p.cancelled_reason}
                      </div>
                    )}
                  </div>
                  {isDoctor && p.status !== 'completed' && p.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(p)}
                    >
                      Update
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {showOrder && isDoctor && (
        <OrderForm
          patientId={patientId}
          onClose={() => setShowOrder(false)}
          onDone={async () => {
            setShowOrder(false);
            await load();
          }}
          onError={setError}
        />
      )}

      {editing && isDoctor && (
        <UpdateForm
          procedure={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
          onError={setError}
        />
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function OrderForm({
  patientId,
  onClose,
  onDone,
  onError,
}: {
  patientId: string;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = useState<ProcedureKind>('xray');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          kind,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(j.detail ?? j.error ?? 'Order failed.');
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold">Order procedure</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProcedureKind)}
            className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
          >
            {(Object.keys(KIND_LABEL) as ProcedureKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="notes">Notes / instructions (optional)</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? 'Saving…' : 'Order'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UpdateForm({
  procedure,
  onClose,
  onDone,
  onError,
}: {
  procedure: Procedure;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [status, setStatus] = useState<ProcedureStatus>(procedure.status);
  const [resultSummary, setResultSummary] = useState(procedure.result_summary ?? '');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = { status };
      if (status === 'completed') body.result_summary = resultSummary;
      if (status === 'cancelled') {
        if (cancelReason.trim().length < 3) {
          onError('Cancellation reason is required (3+ characters).');
          setBusy(false);
          return;
        }
        body.cancelled_reason = cancelReason.trim();
      }
      const res = await fetch(`/api/procedures/${procedure.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(j.detail ?? j.error ?? 'Update failed.');
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold">
        Update {KIND_LABEL[procedure.kind]}
      </h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProcedureStatus)}
            className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
          >
            <option value="ordered">Ordered</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {status === 'completed' && (
          <div>
            <Label htmlFor="rs">Result summary</Label>
            <Input
              id="rs"
              value={resultSummary}
              onChange={(e) => setResultSummary(e.target.value)}
              placeholder="e.g. No fracture seen on left tibia."
            />
          </div>
        )}
        {status === 'cancelled' && (
          <div>
            <Label htmlFor="cr">Cancellation reason *</Label>
            <Input
              id="cr"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
