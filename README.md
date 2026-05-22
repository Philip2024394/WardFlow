# WardFlow

Hospital ward management for Indonesia. Phase 0 scaffold.

WardFlow gives nurses fast bedside rounds, doctors a live remote-monitoring view,
and patient families a read-only window into the care their loved one is receiving —
with every action recorded in an immutable audit log.

---

## Status: Phase 0 (scaffold)

What's in this repo right now:

- Next.js 15 App Router + TypeScript + Tailwind + minimal Shadcn-style components
- Supabase: full 18-table schema (16 from spec + 2 for the family portal)
- RLS policies that scope data per role (`nurse / doctor / supervisor / admin / reception / family`)
- `audit_logs` and `family_access_log` are INSERT-only (Postgres trigger)
- Four interactive screens:
  - `/login` — role tile selector with email/password and magic-link options
  - `/nurse` — shift dashboard with patient cards and a large emergency button
  - `/nurse/patients/[id]` — bedside round-check form (BP/temp/SpO₂/HR/pain/meds/notes/photo)
  - `/doctor` — remote-monitor grid; `/doctor/patients/[id]` includes the family-share panel
- Family portal:
  - `/family` — single code entry
  - `/family/view` — read-only patient view limited to the sections the doctor approved
- Bahasa Indonesia primary, English fallback (toggle on the login screen)
- PWA manifest (no service worker yet — that ships with Capacitor in Phase 1)

What is **not** in this repo:

- Capacitor native shell (Phase 1 — once UX is validated)
- Realtime vitals streaming (Supabase Realtime channels are not yet wired)
- Offline-first sync queue (Phase 1)
- AI features (none — would require real model integration, not stubs)
- Video consult (would need WebRTC, not stubbed)
- Supervisor analytics, admin user management, and shift handover are **stubs**

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| UI | Tailwind CSS + a handful of Shadcn-style primitives |
| Motion | Framer Motion |
| Icons | lucide-react |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| SSR helper | `@supabase/ssr` |
| Validation | zod |

Project rules: **13px text floor** everywhere, **44px tap targets** on interactive controls.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe in browser, respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — used **only** in server-side API routes that need to set the `app.family_patient_id` GUC for family sessions. Never expose to the browser. |
| `FAMILY_SESSION_SECRET` | 32+ char random string used to sign family-portal cookies |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (used in WhatsApp share links) |

### 3. Run the database migrations

These migrations live in `supabase/migrations/` and are **not** auto-applied. Apply
them from your own Supabase project once you've linked it:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Migrations:
1. `0001_init_schema.sql` — 18 tables, enums, indexes, `updated_at` trigger
2. `0002_roles_and_policies.sql` — `user_role` enum + RLS policies per table
3. `0003_audit_immutable.sql` — INSERT-only trigger on `audit_logs` and `family_access_log`

### 4. (Optional) Generate fresh database types

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

This replaces the hand-written types with the real schema.

### 5. Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`.

### 6. Verify the build

```bash
npm run typecheck
npm run build
```

---

## Family portal flow (how it works)

1. Doctor opens a patient on `/doctor/patients/[id]` and uses `ShareWithFamilyPanel`.
2. They pick which sections to share (`care_rounds`, `medications`, `doctor_notes`,
   `emergency_info`), a relationship, and an expiry (1/7/30 days).
3. The server inserts a row into `family_access_codes` (RLS: doctor must own the patient)
   and returns a code like `WPR-AB3K-9XJP`.
4. The doctor shares the code via WhatsApp or copies it.
5. The family member opens `/family`, types the code, and the server (in
   `/api/family-session`) verifies it, then sets a signed, short-lived cookie
   that pins them to one patient + a list of allowed sections.
6. `/family/view` renders only those sections. Every render writes a row to
   `family_access_log` (INSERT-only).
7. The doctor can revoke the code at any time from the same panel.

The family never sees a Supabase Auth account.

---

## Routes

```
/                            marketing landing
/login                       role selector + email/password + magic link
/nurse                       shift dashboard
/nurse/patients/[id]         round-check form
/nurse/handover              STUB (Phase 1)
/doctor                      remote-monitor dashboard
/doctor/patients/[id]        detail + ShareWithFamilyPanel
/supervisor                  STUB (Phase 1)
/admin                       STUB (Phase 1 — manage via Supabase Studio for now)
/family                      access-code entry
/family/view                 read-only patient view (cookie-gated)

POST   /api/family-codes          generate code (doctor)
GET    /api/family-codes?patientId=...  list active codes for a patient
DELETE /api/family-codes/[code]   revoke
POST   /api/family-session        verify code, set cookie
DELETE /api/family-session        clear cookie
POST   /api/audit                 client-side audit log forwarder
```

---

## Compliance disclaimer

WardFlow Phase 0 is a **scaffold**. It is **not** a certified medical device, and it
has **not** undergone a Permenkes 24/2022 (Rekam Medis Elektronik) compliance review.

Before piloting in any real ward you must:

- Have a Permenkes 24/2022 compliance review (formal audit of consent flows,
  retention, audit-log handling, encryption-at-rest verification).
- Decide whether Kemenkes vendor certification applies to your deployment model
  (self-hosted vs SaaS).
- Hand off the audit-log retention policy to your hospital's medical records officer.
- Run a DPIA (data protection impact assessment) for PDP Law compliance.

Do **not** market this as "HIPAA-compliant" or "Permenkes-compliant" until those
reviews are signed off in writing.

---

## License

TBD — leave as proprietary until Phil decides. Suggest MIT for the open source path
or a hospital-pilot EULA for the SaaS path. <!-- TODO: pick a license -->

---

## Phase roadmap (working draft)

- **Phase 0 (now)** — scaffold, schema, RLS, 4 polished screens, family portal
- **Phase 1** — Capacitor native shell, offline-first sync queue, realtime vitals,
  shift handover flow, supervisor analytics, admin user management
- **Phase 2** — escalation engine (4-level), incident reports UX, integrations
  with hospital BPJS/insurance systems
- **Phase 3** — optional AI-assisted triage, voice-to-text round notes (only after
  a clinician panel signs off on safety boundaries)
