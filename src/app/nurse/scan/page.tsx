'use client';
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = 'scanning' | 'submitting' | 'done' | 'error' | 'fallback';

interface DoneResult {
  visit_confirmation_id: string;
  patient_id: string;
  method: 'wristband_scan' | 'patient_fingerprint';
}

interface Gps {
  lat: number;
  lng: number;
  accuracy_m: number | null;
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'wf_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}

async function getGps(): Promise<Gps | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

export default function NurseScanPage() {
  const readerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<unknown>(null);
  const [stage, setStage] = useState<Stage>('scanning');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneResult | null>(null);
  const [fallbackPatientId, setFallbackPatientId] = useState('');
  const [geoStatus, setGeoStatus] = useState<'unknown' | 'ok' | 'denied'>('unknown');

  useEffect(() => {
    void getGps().then((g) => setGeoStatus(g ? 'ok' : 'denied'));
  }, []);

  useEffect(() => {
    if (stage !== 'scanning') return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || !readerRef.current) return;
        const scanner = new Html5Qrcode('wf-qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decoded) => {
            if (cancelled) return;
            void submitToken(decoded);
          },
          () => undefined,
        );
      } catch (e) {
        setError(
          (e as Error)?.message ??
            'Camera unavailable. Use the fingerprint fallback.',
        );
        setStage('error');
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current as { stop?: () => Promise<void> } | null;
      s?.stop?.().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  async function submitToken(token: string) {
    setStage('submitting');
    const gps = await getGps();
    try {
      const res = await fetch('/api/visits/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'wristband',
          token: token.trim(),
          device_id: getDeviceId(),
          gps_lat: gps?.lat,
          gps_lng: gps?.lng,
          gps_accuracy_m: gps?.accuracy_m ?? undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          j.error === 'unknown_token'
            ? 'Wristband not recognised. Try fingerprint fallback.'
            : j.error === 'out_of_geofence'
              ? `Out of the ${j.ward_name ?? 'ward'} geofence (${j.distance_m}m). Get closer to the patient and retry.`
              : (j.detail ?? j.error ?? 'Scan failed.'),
        );
        setStage('error');
        return;
      }
      setDone(j as DoneResult);
      setStage('done');
    } catch {
      setError('Network error. Retry or use fallback.');
      setStage('error');
    }
  }

  async function submitFallback(e: React.FormEvent) {
    e.preventDefault();
    setStage('submitting');
    const gps = await getGps();
    try {
      const res = await fetch('/api/visits/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'fingerprint_fallback',
          patient_id: fallbackPatientId.trim(),
          signature_payload: { fallback_reason: 'wristband_unusable' },
          device_id: getDeviceId(),
          gps_lat: gps?.lat,
          gps_lng: gps?.lng,
          gps_accuracy_m: gps?.accuracy_m ?? undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          j.error === 'out_of_geofence'
            ? `Out of the ${j.ward_name ?? 'ward'} geofence (${j.distance_m}m). Get closer to the patient and retry.`
            : (j.detail ?? j.error ?? 'Fallback failed.'),
        );
        setStage('fallback');
        return;
      }
      setDone(j as DoneResult);
      setStage('done');
    } catch {
      setError('Network error.');
      setStage('fallback');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-md">
        <Card className="border-slate-800 bg-slate-900 p-5">
          <h1 className="text-lg font-bold">Bedside visit — scan wristband</h1>
          <p className="mt-1 text-xs text-slate-400">
            Point the camera at the patient&apos;s wristband QR. The scan is
            logged with your nurse ID, the current time, and your GPS location.
          </p>
          <p className="mt-2 text-xs">
            {geoStatus === 'ok' && (
              <span className="text-emerald-400">
                ● Location available — geofence will be checked
              </span>
            )}
            {geoStatus === 'denied' && (
              <span className="text-amber-400">
                ⚠ Location unavailable. Geofence cannot be checked — scan will still log.
              </span>
            )}
            {geoStatus === 'unknown' && (
              <span className="text-slate-400">Checking location…</span>
            )}
          </p>

          {stage === 'scanning' && (
            <>
              <div
                id="wf-qr-reader"
                ref={readerRef}
                className="mt-4 overflow-hidden rounded-md bg-black"
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setStage('fallback')}
              >
                Wristband unusable — use fingerprint fallback
              </Button>
            </>
          )}

          {stage === 'submitting' && (
            <p className="mt-6 text-sm text-slate-300">Logging visit…</p>
          )}

          {stage === 'error' && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setStage('scanning');
                  }}
                >
                  Retry scan
                </Button>
                <Button
                  className="flex-1"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setStage('fallback');
                  }}
                >
                  Fingerprint fallback
                </Button>
              </div>
            </div>
          )}

          {stage === 'fallback' && (
            <form onSubmit={submitFallback} className="mt-4 space-y-3">
              <p className="text-xs text-slate-400">
                Use the patient&apos;s fingerprint at the bedside. Enter the
                patient ID so we can attribute the visit. The biometric prompt
                is stubbed in Phase 0 — signature passes through for now.
              </p>
              <div>
                <Label htmlFor="patient_id">Patient ID</Label>
                <Input
                  id="patient_id"
                  value={fallbackPatientId}
                  onChange={(e) => setFallbackPatientId(e.target.value)}
                  placeholder="patient uuid"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setError(null);
                    setStage('scanning');
                  }}
                >
                  Back to scan
                </Button>
                <Button type="submit" className="flex-1">
                  Confirm with fingerprint
                </Button>
              </div>
            </form>
          )}

          {stage === 'done' && done && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-emerald-400">
                Visit logged ({done.method === 'wristband_scan' ? 'wristband' : 'fingerprint'}).
              </p>
              <p className="font-mono text-xs text-slate-300 break-all">
                {done.visit_confirmation_id}
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setDone(null);
                  setError(null);
                  setFallbackPatientId('');
                  setStage('scanning');
                }}
              >
                Scan another patient
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
