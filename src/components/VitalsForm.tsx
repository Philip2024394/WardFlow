'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { useT } from '@/lib/i18n/strings';
import { useToast } from '@/components/ui/toast';

interface VitalsPayload {
  bpSystolic?: number;
  bpDiastolic?: number;
  tempC?: number;
  spo2?: number;
  hr?: number;
  rr?: number;
  pain?: number;
  meds: string[];
  notes: string;
}

interface Props {
  patientId: string;
  onSave?: (payload: VitalsPayload) => Promise<void> | void;
  knownMedications?: string[];
}

const DEFAULT_MEDS = ['Paracetamol', 'Insulin', 'Amoxicillin', 'Furosemide'];

export function VitalsForm({ patientId, onSave, knownMedications }: Props) {
  const { t } = useT();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [bpS, setBpS] = useState('');
  const [bpD, setBpD] = useState('');
  const [temp, setTemp] = useState('');
  const [spo2, setSpo2] = useState('');
  const [hr, setHr] = useState('');
  const [rr, setRr] = useState('');
  const [pain, setPain] = useState(0);
  const [notes, setNotes] = useState('');
  const [meds, setMeds] = useState<string[]>([]);

  const medOptions = knownMedications ?? DEFAULT_MEDS;

  const toggleMed = (m: string) =>
    setMeds((curr) => (curr.includes(m) ? curr.filter((x) => x !== m) : [...curr, m]));

  const handleSave = async () => {
    setSaving(true);
    const payload: VitalsPayload = {
      bpSystolic: bpS ? Number(bpS) : undefined,
      bpDiastolic: bpD ? Number(bpD) : undefined,
      tempC: temp ? Number(temp) : undefined,
      spo2: spo2 ? Number(spo2) : undefined,
      hr: hr ? Number(hr) : undefined,
      rr: rr ? Number(rr) : undefined,
      pain,
      meds,
      notes,
    };
    try {
      // Optimistic toast: announce success before round-trip.
      toast.push(t.round.saved, 'success');
      if (onSave) await onSave(payload);
    } catch {
      toast.push(t.round.saveError, 'error');
    } finally {
      setSaving(false);
    }
    // Patient id is captured for the eventual API call.
    void patientId;
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">{t.round.vitals}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bp-s">{t.round.bp}</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="bp-s"
              placeholder={t.round.bpSystolic}
              inputMode="numeric"
              value={bpS}
              onChange={(e) => setBpS(e.target.value)}
            />
            <Input
              placeholder={t.round.bpDiastolic}
              inputMode="numeric"
              value={bpD}
              onChange={(e) => setBpD(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="temp">{t.round.temp}</Label>
          <Input
            id="temp"
            inputMode="decimal"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="spo2">{t.round.spo2}</Label>
          <Input
            id="spo2"
            inputMode="numeric"
            value={spo2}
            onChange={(e) => setSpo2(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="hr">{t.round.hr}</Label>
          <Input
            id="hr"
            inputMode="numeric"
            value={hr}
            onChange={(e) => setHr(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="rr">{t.round.rr}</Label>
          <Input
            id="rr"
            inputMode="numeric"
            value={rr}
            onChange={(e) => setRr(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label>
          {t.round.pain}: <span className="font-bold">{pain}</span>
        </Label>
        <input
          aria-label={t.round.pain}
          type="range"
          min={0}
          max={10}
          step={1}
          value={pain}
          onChange={(e) => setPain(Number(e.target.value))}
          className="mt-2 w-full accent-primary"
        />
      </div>

      <div>
        <Label>{t.round.meds}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {medOptions.map((m) => {
            const active = meds.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMed(m)}
                className="focus:outline-none"
              >
                <Badge variant={active ? 'default' : 'outline'}>{m}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">{t.round.notes}</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div>
        <Label>{t.round.photo}</Label>
        <Button type="button" variant="outline" className="mt-1 w-full" disabled>
          <Camera className="h-4 w-4" />
          {t.round.takePhoto}
        </Button>
      </div>

      <Button size="xl" className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? t.common.saving : t.round.saveRound}
      </Button>
    </Card>
  );
}
