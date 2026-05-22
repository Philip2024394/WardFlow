// Print-CSS A4 audit-trail report. Renders server-side via fetch to /api/patients/[id]/report.
import { headers } from 'next/headers';
import { PrintButton } from './print-button';
import './print.css';

async function fetchReport(id: string) {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  try {
    const cookie = h.get('cookie') ?? '';
    const r = await fetch(`${base}/api/patients/${id}/report`, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function PatientReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchReport(id);
  if (!data || !data.patient) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-bold">Patient report unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Either the patient record is missing or you lack permission. Contact the
          ward supervisor.
        </p>
      </div>
    );
  }

  const p = data.patient as Record<string, unknown>;
  const handovers = data.handovers as Array<Record<string, unknown>>;
  const orders = data.orders as Array<Record<string, unknown>>;
  const visits = data.visits as Array<Record<string, unknown>>;
  const ratings = data.ratings as Array<Record<string, unknown>>;
  const alerts = data.alerts as Array<Record<string, unknown>>;
  const overrides = data.overrides as Array<Record<string, unknown>>;

  return (
    <div className="report mx-auto max-w-3xl px-6 py-6 text-sm">
      <header className="mb-6 border-b border-black/20 pb-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          WardFlow audit-trail report
        </div>
        <h1 className="text-2xl font-bold">{p.full_name as string}</h1>
        <div className="mt-1 text-xs">
          Bed {p.bed_no as string | undefined} · Admitted{' '}
          {new Date(p.admitted_at as string).toLocaleString()} · Generated{' '}
          {new Date(data.generated_at).toLocaleString()}
        </div>
      </header>

      <Section title="Handover chain">
        {handovers.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-1">
            {handovers.map((h) => (
              <li key={h.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(h.created_at as string).toLocaleString()}
                </span>{' '}
                — {h.outgoing_role as string} → {h.incoming_role as string} · method:{' '}
                {h.acceptance_method as string}
                {h.superseded_at ? ' (superseded)' : ''}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Doctor orders">
        {orders.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-1">
            {orders.map((o) => (
              <li key={o.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(o.created_at as string).toLocaleString()}
                </span>{' '}
                — <strong>{o.kind as string}</strong>{' '}
                {o.kind === 'medication' && (
                  <>
                    {o.drug_name as string} {o.dose as string} {o.route as string | undefined}
                  </>
                )}
                {o.body ? ` — ${o.body as string}` : ''}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Visit confirmations">
        {visits.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-1">
            {visits.map((v) => (
              <li key={v.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(v.occurred_at as string).toLocaleString()}
                </span>{' '}
                — method: {v.method as string}{' '}
                {v.offline_queued_at ? ' [offline-replayed]' : ''}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Patient feedback">
        {ratings.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-1">
            {ratings.map((r) => (
              <li key={r.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(r.submitted_at as string).toLocaleString()}
                </span>{' '}
                — <strong>{r.rating as string}</strong>
                {r.is_advisory ? ' (advisory — patient not alert)' : ''}
                {r.comment ? ` — ${r.comment as string}` : ''}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Alerts">
        {alerts.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-1">
            {alerts.map((a) => (
              <li key={a.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(a.opened_at as string).toLocaleString()}
                </span>{' '}
                — {a.kind as string} ({a.state as string})
              </li>
            ))}
          </ol>
        )}
      </Section>

      {overrides.length > 0 && (
        <Section title="Supervisor overrides">
          <ol className="space-y-1">
            {overrides.map((o) => (
              <li key={o.id as string} className="border-b border-black/10 py-1">
                <span className="font-mono text-xs">
                  {new Date(o.created_at as string).toLocaleString()}
                </span>{' '}
                — {o.reason as string}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <footer className="mt-8 border-t border-black/30 pt-3 text-xs text-muted-foreground">
        This report is generated from the immutable WardFlow audit trail (Permenkes
        24/2022 compliant). Tampering with the source rows would require dropping
        triggers in <code>0007_immutability_triggers.sql</code>.
      </footer>

      <PrintButton />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground">No records.</div>;
}
