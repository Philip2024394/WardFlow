'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Ward {
  id: string;
  name: string;
  code: string;
  floor: string | null;
  capacity: number;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_radius_m: number | null;
}

const EMPTY: Omit<Ward, 'id'> & { id?: string } = {
  name: '',
  code: '',
  floor: '',
  capacity: 0,
  gps_lat: null,
  gps_lng: null,
  gps_radius_m: null,
};

export default function AdminWardsPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/wards');
    const j = await res.json().catch(() => ({}));
    setWards((j.wards as Ward[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/wards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          name: editing.name.trim(),
          code: editing.code.trim().toUpperCase(),
          floor: editing.floor ?? null,
          capacity: editing.capacity,
          gps_lat: editing.gps_lat,
          gps_lng: editing.gps_lng,
          gps_radius_m: editing.gps_radius_m,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.detail ?? j.error ?? 'Save failed.');
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!editing) return;
    if (!navigator.geolocation) {
      setError('Browser does not expose geolocation.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setEditing({
          ...editing,
          gps_lat: Number(pos.coords.latitude.toFixed(7)),
          gps_lng: Number(pos.coords.longitude.toFixed(7)),
          gps_radius_m: editing.gps_radius_m ?? 30,
        }),
      (e) => setError(`Location error: ${e.message}`),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Wards & geofences</h1>
          <Button onClick={() => setEditing({ ...EMPTY })}>+ New ward</Button>
        </header>

        <p className="mb-4 text-xs text-slate-400">
          Set the GPS centre + radius of each ward to enforce the bedside-scan
          geofence. Wards without GPS configured skip the check.
        </p>

        <div className="space-y-2">
          {wards.length === 0 && (
            <Card className="border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              No wards yet. Click <em>New ward</em> to create one.
            </Card>
          )}
          {wards.map((w) => (
            <Card key={w.id} className="border-slate-800 bg-slate-900 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {w.name} <span className="text-slate-400">({w.code})</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {w.floor ? `floor ${w.floor} · ` : ''}capacity {w.capacity}
                    {w.gps_lat != null && w.gps_lng != null && w.gps_radius_m != null ? (
                      <>
                        {' · '}
                        <span className="text-emerald-400">
                          geofence {w.gps_lat.toFixed(5)}, {w.gps_lng.toFixed(5)} ±
                          {w.gps_radius_m}m
                        </span>
                      </>
                    ) : (
                      <>
                        {' · '}
                        <span className="text-amber-400">geofence not set</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing({ ...w, floor: w.floor ?? '' })}
                >
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {editing && (
          <Card className="mt-6 border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">
              {editing.id ? 'Edit ward' : 'New ward'}
            </h2>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                    placeholder="e.g. ER, ICU, W3A"
                  />
                </div>
                <div>
                  <Label htmlFor="floor">Floor</Label>
                  <Input
                    id="floor"
                    value={editing.floor ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, floor: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={editing.capacity}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        capacity: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <hr className="border-slate-800" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                GPS geofence
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={editing.gps_lat ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        gps_lat:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    value={editing.gps_lng ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        gps_lng:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="radius">Radius (m)</Label>
                  <Input
                    id="radius"
                    type="number"
                    min={5}
                    max={5000}
                    value={editing.gps_radius_m ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        gps_radius_m:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useMyLocation}
              >
                Use my current location
              </Button>
              <p className="text-xs text-slate-400">
                Stand at the centre of the ward and tap the button. Recommended
                radius: 20–50m for a typical ward, larger for whole-building
                geofences.
              </p>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={save}
                  disabled={busy || !editing.name || !editing.code}
                >
                  {busy ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
