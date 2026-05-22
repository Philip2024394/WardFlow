-- WardFlow Phase 1 — attach prevent_audit_modify() to insert-only tables added in 0004 + 0005.
-- Reuses the trigger function from 0003.

do $$
declare t text;
begin
  for t in select unnest(array[
    'handover_events',
    'doctor_assignments',
    'visit_confirmations',
    'visit_ratings',
    'doctor_orders',
    'alert_acknowledgements',
    'supervisor_overrides'
  ])
  loop
    execute format('drop trigger if exists %I_immutable on public.%I;', t, t);
    execute format(
      'create trigger %I_immutable before update or delete on public.%I
       for each row execute function public.prevent_audit_modify();', t, t);
  end loop;
end $$;

-- Special case: handover_events DOES need ONE allowed UPDATE: setting superseded_at + superseded_by.
-- We let the trigger block by default; the application uses a SECURITY DEFINER function to perform
-- the controlled supersedence, bypassing the trigger via SET LOCAL.
-- Same for doctor_assignments and doctor_orders.
create or replace function public.supersede_handover(p_event_id uuid, p_new_event_id uuid)
returns void language plpgsql security definer as $$
begin
  set local session_replication_role = replica; -- bypasses our trigger for this statement
  update public.handover_events
     set superseded_at = now(), superseded_by = p_new_event_id
   where id = p_event_id and superseded_at is null;
end;
$$;

create or replace function public.supersede_doctor_assignment(p_id uuid, p_new_id uuid)
returns void language plpgsql security definer as $$
begin
  set local session_replication_role = replica;
  update public.doctor_assignments
     set superseded_at = now(), superseded_by = p_new_id
   where id = p_id and superseded_at is null;
end;
$$;

create or replace function public.supersede_doctor_order(p_id uuid, p_new_id uuid)
returns void language plpgsql security definer as $$
begin
  set local session_replication_role = replica;
  update public.doctor_orders
     set superseded_at = now(), superseded_by = p_new_id
   where id = p_id and superseded_at is null;
end;
$$;

create or replace function public.fulfil_doctor_order(p_id uuid, p_media_id uuid)
returns void language plpgsql security definer as $$
begin
  set local session_replication_role = replica;
  update public.doctor_orders
     set fulfilled_media_id = p_media_id,
         fulfilled_at = now(),
         fulfilled_by = auth.uid()
   where id = p_id and fulfilled_at is null;
end;
$$;

-- Alerts state transitions: open → acknowledged → resolved are allowed.
-- The alerts table itself stays MUTABLE for state updates; only acknowledgements are immutable.

comment on function public.supersede_handover is
  'Controlled trigger-bypass for the immutable handover chain. Only callable from server code.';
