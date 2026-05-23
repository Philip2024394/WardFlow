'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Ward {
  id: string;
  name: string;
  code: string;
}
interface Doctor {
  user_id: string;
  full_name: string;
  wf_id: string;
  specialty: string | null;
  is_online: boolean;
}

interface Match {
  patient_id: string;
  full_name: string;
  dob: string | null;
  country: string | null;
  prior_admissions_count: number;
  last_admission_at: string | null;
  last_chief_complaint: string | null;
  last_medications: string[] | null;
  last_ward_name: string | null;
}

interface CreateResult {
  patient_id: string;
  intake_id: string | null;
  family_code: string | null;
  wristband_token: string | null;
  is_returning: boolean;
  patient_name: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function NewPatientPage() {
  const router = useRouter();
  const [wards, setWards] = useState<Ward[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | 'X' | ''>('');
  const [country, setCountry] = useState('ID');
  const [allergies, setAllergies] = useState('');
  const [arrivalReason, setArrivalReason] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [medsGiven, setMedsGiven] = useState('');
  const [treatingDoctor, setTreatingDoctor] = useState('');
  const [assignedWard, setAssignedWard] = useState('');
  const [severity, setSeverity] = useState<'1' | '2' | '3' | '4' | '5'>('3');

  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkedPatientId, setLinkedPatientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/er/options').catch(() => null);
      if (res?.ok) {
        const j = await res.json().catch(() => ({}));
        setWards((j.wards as Ward[]) ?? []);
        setDoctors((j.doctors as Doctor[]) ?? []);
      }
    })();
  }, []);

  const searchKey = useMemo(
    () => `${fullName.trim().toLowerCase()}|${dob}|${country.trim()}`,
    [fullName, dob, country],
  );

  useEffect(() => {
    if (linkedPatientId) return; // already linked
    if (fullName.trim().length < 2 || !ISO_DATE.test(dob)) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = new URLSearchParams({
          name: fullName.trim(),
          dob,
          ...(country.trim() ? { country: country.trim() } : {}),
        });
        const res = await fetch(`/api/er/patients/search?${q.toString()}`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        setMatches((j.matches as Match[]) ?? []);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchKey, fullName, dob, country, linkedPatientId]);

  function resetForm() {
    setFullName('');
    setDob('');
    setGender('');
    setCountry('ID');
    setAllergies('');
    setArrivalReason('');
    setChiefComplaint('');
    setMedsGiven('');
    setTreatingDoctor('');
    setAssignedWard('');
    setSeverity('3');
    setMatches([]);
    setLinkedPatientId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/er/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          existing_patient_id: linkedPatientId ?? undefined,
          full_name: fullName.trim(),
          dob: dob || undefined,
          gender: gender || undefined,
          country: country.trim() || undefined,
          allergies: allergies.split(',').map((s) => s.trim()).filter(Boolean),
          arrival_reason: arrivalReason.trim(),
          chief_complaint: chiefComplaint.trim(),
          medications_given_in_er: medsGiven
            .split(',').map((s) => s.trim()).filter(Boolean),
          er_treating_doctor_id: treatingDoctor || undefined,
          assigned_ward_id: assignedWard || undefined,
          severity,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.detail ?? j.error ?? 'Failed to create patient.');
        return;
      }
      setResult({
        patient_id: j.patient_id,
        intake_id: j.intake_id ?? null,
        family_code: j.family_code ?? null,
        wristband_token: j.wristband_token ?? null,
        is_returning: !!j.is_returning,
        patient_name: fullName.trim(),
      });
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <SuccessScreen
        result={result}
        onNew={() => {
          setResult(null);
          resetForm();
        }}
        onContinue={() => router.push(`/er/intake/${result.patient_id}`)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <Card className="border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">ER — new patient arrival</h1>
          <p className="mt-1 text-xs text-slate-400">
            Capture details at the ER door. The system checks for a prior
            admission as you type the identity.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-5">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Identity
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="full_name">Full name *</Label>
                  <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="dob">Date of birth *</Label>
                  <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'M' | 'F' | 'X' | '')}
                    className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                    <option value="X">X</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="country">Country (ISO code or name)</Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    placeholder="ID, US, AU…"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="allergies">Allergies (comma-separated)</Label>
                  <Input id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="penicillin, latex" />
                </div>
              </div>

              {(searching || matches.length > 0 || linkedPatientId) && (
                <div className="rounded-md border border-amber-700 bg-amber-950/40 p-3">
                  {searching && (
                    <p className="text-xs text-amber-300">Checking prior admissions…</p>
                  )}
                  {linkedPatientId && (
                    <div className="text-xs text-emerald-300">
                      Linked to existing patient record. The new ER intake will
                      attach to their history.{' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setLinkedPatientId(null)}
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                  {!linkedPatientId && matches.length > 0 && (
                    <>
                      <p className="text-sm font-semibold text-amber-200">
                        Patient previously admitted — {matches.length} match
                        {matches.length === 1 ? '' : 'es'}
                      </p>
                      <ul className="mt-2 space-y-2">
                        {matches.map((m) => (
                          <li
                            key={m.patient_id}
                            className="rounded bg-slate-900/60 p-2 text-xs text-slate-200"
                          >
                            <div className="font-semibold">{m.full_name}</div>
                            <div className="text-slate-400">
                              DOB {m.dob ?? '—'} · {m.country ?? 'country n/a'}
                            </div>
                            <div className="mt-1">
                              {m.prior_admissions_count} prior ER intake
                              {m.prior_admissions_count === 1 ? '' : 's'}
                              {m.last_admission_at && (
                                <>
                                  {' · last '}
                                  {new Date(m.last_admission_at).toLocaleString()}
                                </>
                              )}
                            </div>
                            {m.last_chief_complaint && (
                              <div className="mt-1 text-slate-300">
                                Last complaint:{' '}
                                <em>{m.last_chief_complaint}</em>
                              </div>
                            )}
                            {m.last_medications && m.last_medications.length > 0 && (
                              <div className="mt-1 text-slate-300">
                                Last ER meds:{' '}
                                <em>{m.last_medications.join(', ')}</em>
                              </div>
                            )}
                            {m.last_ward_name && (
                              <div className="text-slate-400">
                                Last ward: {m.last_ward_name}
                              </div>
                            )}
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setLinkedPatientId(m.patient_id)}
                              >
                                Use existing record
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-amber-300">
                        Or continue and a new record will be created on submit.
                      </p>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Arrival
              </h2>
              <div>
                <Label htmlFor="arrival">Reason of arrival *</Label>
                <Input id="arrival" value={arrivalReason} onChange={(e) => setArrivalReason(e.target.value)} placeholder="e.g. road accident" required />
              </div>
              <div>
                <Label htmlFor="chief">Chief complaint *</Label>
                <Input id="chief" value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. severe left leg pain, possible fracture" required />
              </div>
              <div>
                <Label htmlFor="meds">Medications given in ER (comma-separated)</Label>
                <Input id="meds" value={medsGiven} onChange={(e) => setMedsGiven(e.target.value)} placeholder="morphine 5mg IV, paracetamol 1g PO" />
              </div>
              <div>
                <Label htmlFor="severity">Triage severity (1=critical, 5=minor)</Label>
                <select
                  id="severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as '1' | '2' | '3' | '4' | '5')}
                  className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                >
                  {(['1', '2', '3', '4', '5'] as const).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Routing
              </h2>
              <div>
                <Label htmlFor="doc">ER treating doctor</Label>
                <select
                  id="doc"
                  value={treatingDoctor}
                  onChange={(e) => setTreatingDoctor(e.target.value)}
                  className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                >
                  <option value="">— not yet assigned —</option>
                  {doctors.map((d) => (
                    <option key={d.user_id} value={d.user_id}>
                      {d.full_name} ({d.wf_id})
                      {d.specialty ? ` — ${d.specialty}` : ''}
                      {d.is_online ? ' · online' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ward">Assigned ward</Label>
                <select
                  id="ward"
                  value={assignedWard}
                  onChange={(e) => setAssignedWard(e.target.value)}
                  className="block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                >
                  <option value="">— still in ER —</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>
            </section>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy
                ? 'Creating…'
                : linkedPatientId
                  ? 'Record new ER intake for existing patient'
                  : 'Create patient & issue code'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function SuccessScreen({
  result,
  onNew,
  onContinue,
}: {
  result: CreateResult;
  onNew: () => void;
  onContinue: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !result.wristband_token) return;
    QRCode.toCanvas(canvasRef.current, result.wristband_token, {
      width: 256,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => undefined);
  }, [result.wristband_token]);

  if (result.is_returning) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md">
          <Card className="border-slate-800 bg-slate-900 p-6">
            <h1 className="text-xl font-bold">Returning patient — intake recorded</h1>
            <p className="mt-2 text-sm text-slate-300">
              The new ER intake was attached to the existing record for{' '}
              <strong>{result.patient_name}</strong>. Their existing
              patient/family code and wristband still apply.
            </p>
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" size="lg" onClick={onContinue}>
                Continue to triage
              </Button>
              <Button variant="outline" size="lg" onClick={onNew}>
                New patient
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md">
        <Card className="border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">Patient created</h1>

          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Wristband QR — print and attach
            </h2>
            <div
              id="wristband-print"
              className="mt-2 rounded-md bg-white p-4 text-center text-black"
            >
              <p className="text-sm font-bold">{result.patient_name}</p>
              <canvas ref={canvasRef} className="mx-auto my-2 block" />
              <p className="font-mono text-[10px] tracking-tight break-all">
                {result.wristband_token}
              </p>
            </div>
            <Button
              className="mt-2 w-full"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              Print wristband
            </Button>
          </section>

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Patient & family code
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Share with the patient and family. Same code for both — enter on
              the home page.
            </p>
            <p className="mt-2 select-all rounded bg-slate-800 px-3 py-3 text-center font-mono text-2xl tracking-widest">
              {result.family_code}
            </p>
          </section>

          <div className="mt-6 flex gap-2">
            <Button className="flex-1" size="lg" onClick={onContinue}>
              Continue to triage
            </Button>
            <Button variant="outline" size="lg" onClick={onNew}>
              New patient
            </Button>
          </div>
        </Card>
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #wristband-print, #wristband-print * { visibility: visible; }
          #wristband-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </main>
  );
}
