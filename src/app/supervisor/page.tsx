// TODO i18n — Phase 1 will add the supervisor analytics + handover approvals UI.
export default function SupervisorStub() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-bold">Supervisor Analytics</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        STUB — Phase 1. Ward-level KPIs, missed-round alerts, escalation queue,
        handover sign-off. Wire to materialized views over the audit_logs + rounds
        tables once usage data exists.
      </p>
    </div>
  );
}
