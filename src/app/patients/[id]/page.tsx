// Patient page — care team panel + medications + recent visits.
// Care team is filtered to ACTIVE doctor_assignments (superseded_at is null)
// so a nurse only sees the doctors currently caring for this patient. Newly
// assigned doctors (within the last 24h) get a "Just assigned" badge.
// Auth: cookie staff session OR family session matching the URL patient_id.
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';
import { verifyFamilyCookie, FAMILY_COOKIE_NAME } from '@/lib/family/session';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

interface PatientDetail {
  id: string;
  full_name: string;
  bed_no: string | null;
  ward_id: string | null;
  risk_level: string;
  cognitive_status: string;
  assigned_doctor_id: string | null;
  assigned_nurse_id: string | null;
  admitted_at: string;
}

interface DoctorPublic {
  user_id: string;
  wf_id: string;
  specialty: string | null;
  expertise: string | null;
  is_online: boolean;
  full_name: string | null;
  photo_url: string | null;
  current_patient_count: number;
}

const RECENTLY_ASSIGNED_HOURS = 24;

async function authorize(patientId: string): Promise<boolean> {
  const staff = await getStaffSession();
  if (staff) return true;
  const store = await cookies();
  const fam = verifyFamilyCookie(store.get(FAMILY_COOKIE_NAME)?.value);
  return !!(fam && fam.patient_id === patientId);
}

async function loadAll(id: string) {
  const supabase = createSupabaseServiceClient();
  const { data: patient } = await supabase
    .from('patients')
    .select(
      'id,full_name,bed_no,ward_id,risk_level,cognitive_status,assigned_doctor_id,assigned_nurse_id,admitted_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!patient) return null;

  const { data: docPublics } = await supabase.rpc('list_doctor_public_profiles');
  const allDoctors = (docPublics as DoctorPublic[] | null) ?? [];

  const { data: assigns } = await supabase
    .from('doctor_assignments')
    .select(
      'id,doctor_user_id,primary_nurse_id,backup_nurse_id,emergency_exception,created_at,origin',
    )
    .eq('patient_id', id)
    .is('superseded_at', null)
    .order('created_at', { ascending: false });

  const { data: meds } = await supabase
    .from('doctor_orders')
    .select('id,kind,drug_name,dose,route,schedule_cron,duration,body,created_at')
    .eq('patient_id', id)
    .eq('kind', 'medication')
    .is('superseded_at', null)
    .order('created_at', { ascending: false });

  const { data: notes } = await supabase
    .from('doctor_orders')
    .select('id,kind,body,created_at')
    .eq('patient_id', id)
    .neq('kind', 'medication')
    .is('superseded_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: visits } = await supabase
    .from('visit_confirmations')
    .select('id,nurse_user_id,occurred_at,method')
    .eq('patient_id', id)
    .order('occurred_at', { ascending: false })
    .limit(10);

  return {
    patient: patient as PatientDetail,
    allDoctors,
    assigns: assigns ?? [],
    meds: meds ?? [],
    notes: notes ?? [],
    visits: visits ?? [],
  };
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ok = await authorize(id);
  if (!ok) redirect('/');

  const data = await loadAll(id);
  if (!data) notFound();

  const { patient, allDoctors, assigns, meds, notes, visits } = data;
  const doctorById = new Map(allDoctors.map((d) => [d.user_id, d]));
  const now = Date.now();
  const careDoctors = (
    assigns as { doctor_user_id: string; emergency_exception: boolean; created_at: string }[]
  )
    .map((a) => {
      const ageHours = (now - new Date(a.created_at).getTime()) / 3_600_000;
      return {
        ...a,
        doctor: doctorById.get(a.doctor_user_id),
        is_recent: ageHours < RECENTLY_ASSIGNED_HOURS,
      };
    })
    .sort((a, b) => {
      // Newest assignments first so "Just assigned" is at the top.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{patient.full_name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              Bed {patient.bed_no ?? '—'} · Admitted{' '}
              {new Date(patient.admitted_at).toLocaleString()} · Cognitive status:{' '}
              <Badge variant={patient.cognitive_status === 'alert' ? 'default' : 'destructive'}>
                {patient.cognitive_status}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/patients/${patient.id}/history`}
              className="inline-flex h-11 items-center rounded-md border px-3 text-sm"
            >
              History
            </Link>
            <Link
              href={`/patients/${patient.id}/procedures`}
              className="inline-flex h-11 items-center rounded-md border px-3 text-sm"
            >
              Procedures
            </Link>
            <Link
              href={`/patients/${patient.id}/report`}
              className="inline-flex h-11 items-center rounded-md border px-3 text-sm"
            >
              Audit report
            </Link>
          </div>
        </div>
      </header>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Care team — currently assigned doctors
        </h2>
        {careDoctors.length === 0 ? (
          <Card className="px-4 py-6 text-sm text-muted-foreground">
            No doctor assigned yet. Use the ER intake flow to suggest a doctor.
          </Card>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {careDoctors.map((d) => (
              <li key={d.doctor_user_id}>
                <Card className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    {d.doctor?.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.doctor.photo_url}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-base">
                        {(d.doctor?.full_name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {d.doctor?.full_name ?? '—'}
                        </span>
                        <Badge variant="secondary">{d.doctor?.wf_id ?? ''}</Badge>
                        {d.is_recent && (
                          <Badge className="bg-emerald-500/20 text-emerald-300">
                            Just assigned
                          </Badge>
                        )}
                        {d.emergency_exception && (
                          <Badge variant="destructive">Emergency exception</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm">
                        {d.doctor?.specialty ?? '—'}
                      </div>
                      {d.doctor?.expertise && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {d.doctor.expertise}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Assigned {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active medications
        </h2>
        {meds.length === 0 ? (
          <Card className="px-4 py-6 text-sm text-muted-foreground">
            No active medications.
          </Card>
        ) : (
          <ul className="space-y-1 text-sm">
            {(meds as Array<{ id: string; drug_name: string; dose: string; route?: string; schedule_cron?: string; duration?: string }>).map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border/40 px-3 py-2"
              >
                <strong>{m.drug_name}</strong> {m.dose}
                {m.route ? ` · ${m.route}` : ''} {m.schedule_cron ? ` · ${m.schedule_cron}` : ''}
                {m.duration ? ` · ${m.duration}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="px-3 py-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Doctor notes &amp; requests
          </h2>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(notes as Array<{ id: string; kind: string; body: string | null; created_at: string }>).map((n) => (
                <li
                  key={n.id}
                  className="border-b border-border/30 py-1 last:border-b-0"
                >
                  <Badge variant="secondary" className="mr-2 uppercase">
                    {n.kind.replaceAll('_', ' ')}
                  </Badge>
                  {n.body}
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="px-3 py-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent nurse visits
          </h2>
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(visits as Array<{ id: string; nurse_user_id: string; occurred_at: string; method: string }>).map((v) => (
                <li
                  key={v.id}
                  className="border-b border-border/30 py-1 last:border-b-0"
                >
                  <span className="font-mono text-xs">
                    nurse {v.nurse_user_id.slice(0, 8)}…
                  </span>{' '}
                  · {v.method}
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(v.occurred_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
