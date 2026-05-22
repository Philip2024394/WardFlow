'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ProposalRow {
  id: string;
  patient_id: string;
  target_doctor_id: string;
  proposed_by: string;
  origin: string;
  reason: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

export function DoctorInbox({
  initialProposals,
  selfDoctorId,
}: {
  initialProposals: ProposalRow[];
  selfDoctorId: string | null;
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [selfPatientId, setSelfPatientId] = useState('');
  const [selfReason, setSelfReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function selfPropose() {
    if (!selfDoctorId) {
      alert('Sign in as a doctor first.');
      return;
    }
    if (!selfPatientId.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/doctor/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: selfPatientId.trim(),
          target_doctor_id: selfDoctorId,
          origin: 'doctor_self',
          reason: selfReason.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const newRow: ProposalRow = {
          id: j.proposal_id,
          patient_id: selfPatientId,
          target_doctor_id: selfDoctorId,
          proposed_by: selfDoctorId,
          origin: 'doctor_self',
          reason: selfReason || null,
          status: 'pending',
          expires_at: j.expires_at,
          created_at: new Date().toISOString(),
        };
        setProposals((p) => [newRow, ...p]);
        setSelfPatientId('');
        setSelfReason('');
        alert(`Submitted. ER staff, patient, or NOK must confirm before you're assigned.`);
      } else {
        alert(`Error: ${j.error ?? 'failed'}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Doctor inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Proposals targeted at you (from ER staff, the patient, or NOK), plus self-propose to
          add yourself to a patient&apos;s care team for review.
        </p>
      </header>

      <Card className="mb-6 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Submit myself for review
        </h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <Label>Patient ID</Label>
            <Input
              placeholder="uuid"
              value={selfPatientId}
              onChange={(e) => setSelfPatientId(e.target.value)}
            />
          </div>
          <div>
            <Label>Reason</Label>
            <Input
              placeholder="e.g. cardiology consult requested"
              value={selfReason}
              onChange={(e) => setSelfReason(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2">
          <Button disabled={busy} onClick={selfPropose}>
            Submit
          </Button>
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recent proposals targeted at me
      </h2>
      {proposals.length === 0 ? (
        <Card className="px-4 py-8 text-center text-sm text-muted-foreground">
          No proposals yet.
        </Card>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <li key={p.id}>
              <Card className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">{p.origin}</Badge>
                      <span className="font-mono text-xs">
                        patient {p.patient_id.slice(0, 8)}…
                      </span>
                    </div>
                    {p.reason && (
                      <div className="mt-1 text-xs text-muted-foreground">{p.reason}</div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <Badge
                      variant={
                        p.status === 'pending'
                          ? 'outline'
                          : p.status === 'confirmed'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {p.status}
                    </Badge>
                    <div className="mt-1 text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
