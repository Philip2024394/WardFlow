// TODO i18n — Phase 1 user management surface.
export default function AdminStub() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-bold">Administrator</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        STUB — Phase 1. User/role management, ward provisioning, audit-log search,
        license uploads, integration credentials. Should be the LAST surface to ship
        — until then, Phil manages via Supabase Studio.
      </p>
    </div>
  );
}
