// Nurse profile — large photo, identity, stats, recent activity timeline.
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

interface NurseDetail {
  user_id: string;
  wf_id: string;
  age: number | null;
  gender: string | null;
  whatsapp_e164: string | null;
  years_experience: number | null;
  specialization: string | null;
  shift_type: string | null;
  languages: string[] | null;
  employment_start_date: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  compliance_score: number | null;
  medication_accuracy_pct: number | null;
  missed_rounds_count: number;
  emergencies_handled_count: number;
  users: { full_name: string; email: string; phone_e164: string | null; photo_url: string | null } | null;
}

async function loadNurse(id: string): Promise<NurseDetail | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('nurses')
      .select(
        'user_id,wf_id,age,gender,whatsapp_e164,years_experience,specialization,shift_type,languages,employment_start_date,is_online,last_seen_at,compliance_score,medication_accuracy_pct,missed_rounds_count,emergencies_handled_count,users(full_name,email,phone_e164,photo_url)',
      )
      .eq('user_id', id)
      .maybeSingle();
    return (data as NurseDetail | null) ?? null;
  } catch {
    return null;
  }
}

async function loadRecentActivity(id: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('visit_confirmations')
      .select('id,patient_id,occurred_at,method')
      .eq('nurse_user_id', id)
      .order('occurred_at', { ascending: false })
      .limit(30);
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function NurseProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nurse = await loadNurse(id);
  if (!nurse) notFound();
  const activity = await loadRecentActivity(id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center">
          {nurse.users?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nurse.users.photo_url}
              alt={nurse.users.full_name}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-xl font-semibold">
              {(nurse.users?.full_name || '?').slice(0, 1)}
            </div>
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{nurse.users?.full_name}</h1>
              <Badge variant={nurse.is_online ? 'default' : 'secondary'}>
                {nurse.is_online ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-sm text-muted-foreground">
              {nurse.wf_id}
            </div>
            <div className="mt-1 text-sm">
              {nurse.specialization ?? '—'} ·{' '}
              {nurse.years_experience ? `${nurse.years_experience} yrs` : 'experience —'}{' '}
              · shift: {nurse.shift_type ?? '—'}
            </div>
          </div>
        </div>
      </Card>

      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Compliance" value={nurse.compliance_score?.toFixed(0) ?? '—'} suffix="%" />
        <Stat label="Med accuracy" value={nurse.medication_accuracy_pct?.toFixed(0) ?? '—'} suffix="%" />
        <Stat label="Missed rounds" value={nurse.missed_rounds_count.toString()} />
        <Stat label="Emergencies" value={nurse.emergencies_handled_count.toString()} />
      </section>

      <Card className="mb-4 px-4 py-3 text-sm">
        <Field label="Email">{nurse.users?.email}</Field>
        <Field label="Phone">{nurse.users?.phone_e164 ?? nurse.whatsapp_e164 ?? '—'}</Field>
        <Field label="Languages">{(nurse.languages ?? []).join(', ') || '—'}</Field>
        <Field label="Employment start">{nurse.employment_start_date ?? '—'}</Field>
      </Card>

      <Card className="px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent visit confirmations
        </h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border/40">
            {activity.map((a) => (
              <li
                key={a.id as string}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-mono text-xs">
                  patient {(a.patient_id as string).slice(0, 8)}…
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.occurred_at as string).toLocaleString()} · {a.method as string}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card className="px-3 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">
        {value}
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
