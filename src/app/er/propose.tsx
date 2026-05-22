'use client';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PatientOption {
  id: string;
  full_name: string;
  bed_no: string | null;
}
export interface WardOption {
  id: string;
  name: string;
  code: string;
}
export interface NurseOption {
  user_id: string;
  wf_id: string;
  specialization: string | null;
  is_online: boolean;
  users: { full_name: string; photo_url: string | null } | null;
}

export function ErProposeView({
  patients,
  wards,
  nurses,
}: {
  patients: PatientOption[];
  wards: WardOption[];
  nurses: NurseOption[];
}) {
  const [patientId, setPatientId] = useState<string>('');
  const [wardId, setWardId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, 'primary' | 'backup' | null>>({});
  const [notes, setNotes] = useState('');
  const [meds, setMeds] = useState('');
  const [tasks, setTasks] = useState('');
  const [condition, setCondition] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return nurses.filter(
      (n) =>
        !lc ||
        (n.users?.full_name || '').toLowerCase().includes(lc) ||
        n.wf_id.toLowerCase().includes(lc) ||
        (n.specialization || '').toLowerCase().includes(lc),
    );
  }, [nurses, search]);

  const proposed = Object.entries(picked).filter(([, role]) => role) as [string, 'primary' | 'backup'][];

  async function submit() {
    if (!patientId || !wardId || proposed.length === 0) {
      alert('Pick patient, destination ward and at least one nurse.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/handover/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          to_ward_id: wardId,
          nurses: proposed.map(([nurse_user_id, role]) => ({ nurse_user_id, role })),
          notes: notes || undefined,
          pending_tasks: tasks || undefined,
          medication_status: meds || undefined,
          patient_condition: condition || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(`Proposal sent. Awaiting acceptance (expires ${new Date(j.expires_at).toLocaleTimeString()}).`);
        setPicked({});
        setNotes('');
        setMeds('');
        setTasks('');
        setCondition('');
      } else {
        setResult(`Error: ${j.error ?? 'failed'}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Emergency → Ward handover</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Propose ward nurse(s) for the patient. Patient stays in ER until at least one
          nurse accepts and the bedside confirmation is captured.
        </p>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label>Patient</Label>
          <select
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">— select —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.bed_no ? `(bed ${p.bed_no})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Destination ward</Label>
          <select
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={wardId}
            onChange={(e) => setWardId(e.target.value)}
          >
            <option value="">— select —</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mb-4">
        <Label htmlFor="nurse-search">Find nurse</Label>
        <Input
          id="nurse-search"
          placeholder="name, WF id, specialization…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="mt-2 max-h-96 space-y-2 overflow-auto">
          {filtered.map((n) => {
            const role = picked[n.user_id] ?? null;
            return (
              <li key={n.user_id}>
                <Card className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {n.users?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.users.photo_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm">
                        {(n.users?.full_name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium">{n.users?.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {n.wf_id} · {n.specialization || 'general'}
                      </div>
                    </div>
                    <Badge variant={n.is_online ? 'default' : 'secondary'} className="ml-2">
                      {n.is_online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={role === 'primary' ? 'default' : 'outline'}
                      onClick={() =>
                        setPicked((s) => ({
                          ...s,
                          [n.user_id]: role === 'primary' ? null : 'primary',
                        }))
                      }
                    >
                      Primary
                    </Button>
                    <Button
                      size="sm"
                      variant={role === 'backup' ? 'default' : 'outline'}
                      onClick={() =>
                        setPicked((s) => ({
                          ...s,
                          [n.user_id]: role === 'backup' ? null : 'backup',
                        }))
                      }
                    >
                      Backup
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="Handover notes" value={notes} onChange={setNotes} />
        <Field label="Medication status" value={meds} onChange={setMeds} />
        <Field label="Pending tasks" value={tasks} onChange={setTasks} />
        <Field label="Patient condition" value={condition} onChange={setCondition} />
      </section>

      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={submit}>
          Send proposal ({proposed.length})
        </Button>
        {result && <span className="text-sm text-muted-foreground">{result}</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
