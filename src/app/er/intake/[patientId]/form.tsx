'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PatientLite {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  allergies: string[] | null;
}

interface SuggestedDoctor {
  doctor_user_id: string;
  wf_id: string;
  full_name: string;
  specialty: string | null;
  expertise: string | null;
  is_online: boolean;
  on_shift_now: boolean;
  current_patient_count: number;
  rank_score: number;
}

const SYMPTOMS: { key: string; label: string }[] = [
  { key: 'chest_pain', label: 'Chest pain' },
  { key: 'breathing_difficulty', label: 'Breathing difficulty' },
  { key: 'abdominal_pain', label: 'Abdominal pain' },
  { key: 'head_trauma', label: 'Head trauma' },
  { key: 'fracture', label: 'Possible fracture' },
  { key: 'burns', label: 'Burns' },
  { key: 'bleeding', label: 'Bleeding' },
  { key: 'pregnancy', label: 'Pregnancy / OB' },
  { key: 'pediatric', label: 'Pediatric' },
  { key: 'psychiatric', label: 'Psychiatric' },
  { key: 'overdose', label: 'Overdose / poisoning' },
  { key: 'allergic_reaction', label: 'Allergic reaction' },
];

export function IntakeForm({ patient }: { patient: PatientLite }) {
  const [chief, setChief] = useState('');
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [severity, setSeverity] = useState<'1' | '2' | '3' | '4' | '5'>('3');
  const [bps, setBps] = useState('');
  const [bpd, setBpd] = useState('');
  const [temp, setTemp] = useState('');
  const [hr, setHr] = useState('');
  const [spo2, setSpo2] = useState('');
  const [pain, setPain] = useState('');
  const [conscious, setConscious] = useState(true);
  const [prefGender, setPrefGender] = useState<'M' | 'F' | 'any'>('any');
  const [prefLangs, setPrefLangs] = useState('');
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedDoctor[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleSymptom(k: string) {
    setSymptoms((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function submit() {
    if (chief.trim().length < 2) {
      alert('Chief complaint is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/er/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          chief_complaint: chief,
          symptom_keywords: Array.from(symptoms),
          severity,
          blood_pressure_systolic: bps ? Number(bps) : undefined,
          blood_pressure_diastolic: bpd ? Number(bpd) : undefined,
          temperature_c: temp ? Number(temp) : undefined,
          heart_rate_bpm: hr ? Number(hr) : undefined,
          oxygen_pct: spo2 ? Number(spo2) : undefined,
          pain_score: pain ? Number(pain) : undefined,
          is_conscious: conscious,
          preferred_gender: prefGender,
          preferred_languages: prefLangs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          known_allergies: patient.allergies ?? [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setIntakeId(j.intake_id);
      } else {
        alert(`Error: ${j.error ?? 'failed'}`);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!intakeId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/doctors/suggest?intakeId=${intakeId}`);
      const j = await res.json().catch(() => ({ doctors: [] }));
      if (!cancelled) setSuggestions((j.doctors as SuggestedDoctor[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [intakeId]);

  async function propose(doctor: SuggestedDoctor) {
    setBusy(true);
    try {
      const res = await fetch('/api/doctor/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          target_doctor_id: doctor.doctor_user_id,
          origin: 'er',
          intake_id: intakeId,
          rank_score: doctor.rank_score,
          reason: `Auto-suggested for ${chief}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(
          `Proposal sent to ${doctor.full_name}. Patient or NOK must confirm at bedside.`,
        );
      } else {
        alert(`Error: ${j.error ?? 'failed'}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold">ER triage — {patient.full_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture the intake report. Doctor suggestions appear after you save and respect
          severity, on-shift status, online status, workload, and the patient&apos;s preferences.
        </p>
      </header>

      <Card className="mb-4 px-4 py-3">
        <Label htmlFor="chief">Chief complaint</Label>
        <Input
          id="chief"
          value={chief}
          onChange={(e) => setChief(e.target.value)}
          placeholder="e.g. crushing central chest pain radiating to left arm"
        />

        <div className="mt-3">
          <Label>Symptoms</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSymptom(s.key)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  symptoms.has(s.key)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <SmallField label="Severity (1–5)" value={severity} onChange={(v) => setSeverity(v as '1' | '2' | '3' | '4' | '5')} />
          <SmallField label="BP sys" value={bps} onChange={setBps} type="number" />
          <SmallField label="BP dia" value={bpd} onChange={setBpd} type="number" />
          <SmallField label="Temp °C" value={temp} onChange={setTemp} type="number" />
          <SmallField label="HR bpm" value={hr} onChange={setHr} type="number" />
          <SmallField label="SpO₂ %" value={spo2} onChange={setSpo2} type="number" />
          <SmallField label="Pain 0-10" value={pain} onChange={setPain} type="number" />
          <SmallField
            label="Conscious"
            value={conscious ? 'yes' : 'no'}
            onChange={(v) => setConscious(v === 'yes')}
          />
          <SmallField
            label="Preferred gender"
            value={prefGender}
            onChange={(v) => setPrefGender(v as 'M' | 'F' | 'any')}
          />
        </div>
        <div className="mt-3">
          <SmallField
            label="Preferred languages (comma-sep)"
            value={prefLangs}
            onChange={setPrefLangs}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button disabled={busy} onClick={submit}>
            Save intake & suggest doctors
          </Button>
          {intakeId && (
            <span className="text-xs text-muted-foreground">
              Intake saved · {suggestions.length} suggestions
            </span>
          )}
        </div>
      </Card>

      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ranked doctor suggestions
          </h2>
          <ul className="space-y-2">
            {suggestions.map((d) => (
              <li key={d.doctor_user_id}>
                <Card className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{d.full_name}</span>
                      <Badge variant="secondary">{d.wf_id}</Badge>
                      <Badge variant={d.is_online ? 'default' : 'secondary'}>
                        {d.is_online ? 'Online' : 'Offline'}
                      </Badge>
                      <Badge variant={d.on_shift_now ? 'default' : 'outline'}>
                        {d.on_shift_now ? 'On shift' : 'Remote'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.specialty ?? '—'} · {d.expertise ?? ''} · workload:{' '}
                      {d.current_patient_count}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-xs">score {d.rank_score.toFixed(1)}</span>
                    <Button size="sm" onClick={() => propose(d)} disabled={busy}>
                      Propose
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
