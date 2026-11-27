-- Follow-ups from the Red River QA run (docs/qa-red-river-demo.md, Ideas).
--
-- 1. TONU pay. A TONU load pays the driver nothing for miles never run, but
--    many carriers pay a flat amount for the wasted trip. The company sets a
--    default (organizations.tonu_driver_pay); marking a load TONU locks the
--    amount for that load (loads.tonu_driver_pay), which the dialog can
--    change.
-- 2. Past invoices. send_invoice only dates an invoice today, so a carrier
--    moving to the app couldn't bring in invoices it sent before.
--    record_past_invoice records a draft as sent on an earlier day, with no
--    email.
-- 3. TONU loads get a date: the pickup day, when the truck showed up for
--    nothing. delivered_on is the day a load counts on in Reports and on
--    pay statements, so a TONU's charge and the driver's TONU pay now land
--    there.
-- 4. Fuel gallons and state from the driver app. add_my_expense takes them,
--    so a driver's fuel receipt counts on the IFTA page; my_load returns them.

-- ------------------------------------------------------------ TONU pay ---

alter table public.organizations
  add column tonu_driver_pay numeric(10, 2)
    check (tonu_driver_pay >= 0 and tonu_driver_pay <= 99999999.99);

grant update (tonu_driver_pay) on public.organizations to authenticated;

alter table public.loads
  add column tonu_driver_pay numeric(10, 2)
    check (tonu_driver_pay >= 0 and tonu_driver_pay <= 99999999.99);

-- A TONU counts on its pickup day.
create or replace function public.loads_delivered_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'tonu' then
    new.delivered_on := new.pickup_start::date;
  elsif new.status not in ('delivered', 'invoiced', 'paid', 'factored') then
    new.delivered_on := null;
  elsif tg_op = 'INSERT'
     or old.delivered_on is null
     or old.status = 'tonu'
     or coalesce(current_setting('officetruck.redate_delivery', true), '') = 'on' then
    new.delivered_on := public.load_delivered_on(new);
  else
    -- Only the database sets it.
    new.delivered_on := old.delivered_on;
  end if;
  return new;
end;
$$;

-- TONU loads already marked.
update public.loads set delivered_on = pickup_start::date
where status = 'tonu' and delivered_on is distinct from pickup_start::date;

-- ------------------------------------------------------- Past invoices ---

create function public.record_past_invoice(
  target_invoice uuid,
  via text,
  sent_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  l public.loads;
  earliest date;
begin
  select * into i from public.invoices where id = target_invoice;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into l from public.loads where id = i.load_id;
  if sent_on is null or sent_on > current_date then
    raise exception 'Enter the day it was sent: today or earlier.' using errcode = '22023', hint = 'sent_on';
  end if;
  -- Not before the freight moved (the pickup day for a TONU).
  earliest := coalesce(l.delivered_on, l.pickup_start::date);
  if sent_on < earliest then
    raise exception 'That''s before the load was delivered (%).', to_char(earliest, 'Mon FMDD, YYYY')
      using errcode = '22023', hint = 'before_delivery';
  end if;

  -- Freezes the lines, sets factoring and moves the load, as sending does.
  perform public.send_invoice(target_invoice, via, '{}', null);

  update public.invoices
  set invoice_date = sent_on,
      due_on = sent_on + terms_days,
      sent_at = (sent_on + time '12:00') at time zone coalesce(
        (select o.time_zone from public.organizations o where o.id = i.organization_id),
        'America/Chicago')
  where id = target_invoice;
end;
$$;

revoke execute on function public.record_past_invoice(uuid, text, date) from public, anon;
grant execute on function public.record_past_invoice(uuid, text, date) to authenticated;

-- ------------------------------------------- Fuel from the driver app ---

drop function public.add_my_expense(uuid, text, numeric, date, text, text, text, text, uuid, text);

create function public.add_my_expense(
  target_load uuid,
  kind text,
  amount numeric,
  spent_on date,
  note text default null,
  receipt_path text default null,
  receipt_name text default null,
  receipt_type text default null,
  client_id uuid default null,
  paid_by text default 'driver',
  gallons numeric default null,
  jurisdiction text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads := public.require_my_load_on_road(target_load);
  new_id uuid := coalesce(client_id, gen_random_uuid());
begin
  if exists (select 1 from public.load_expenses e where e.id = new_id) then
    if exists (
      select 1 from public.load_expenses e
      where e.id = new_id and e.load_id = l.id and e.created_by = (select auth.uid())
    ) then
      return new_id;
    end if;
    raise exception 'That expense id is taken.' using errcode = '23505', hint = 'duplicate';
  end if;

  if paid_by is null or paid_by not in ('driver', 'company') then
    raise exception 'Say who paid: you or the company.' using errcode = '22023', hint = 'paid_by';
  end if;
  if paid_by = 'company' and receipt_path is null then
    raise exception 'Add the receipt for what the company paid.' using errcode = '22023', hint = 'no_receipt';
  end if;
  -- For IFTA: on fuel only, both or neither (load_expenses checks it too,
  -- but this says why).
  if (add_my_expense.gallons is null) <> (add_my_expense.jurisdiction is null) then
    raise exception 'Enter the gallons and the state, or neither.' using errcode = '22023', hint = 'fuel_details';
  end if;
  if add_my_expense.gallons is not null and kind <> 'fuel' then
    raise exception 'Gallons are only for fuel.' using errcode = '22023', hint = 'fuel_details';
  end if;
  if spent_on > current_date + 1 then
    raise exception 'That date is in the future.' using errcode = '22023', hint = 'future';
  end if;
  if receipt_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'load-documents' and o.name = add_my_expense.receipt_path
  ) then
    raise exception 'The receipt isn''t uploaded yet.' using errcode = 'P0002', hint = 'no_file';
  end if;

  insert into public.load_expenses
    (id, organization_id, load_id, kind, amount, spent_on, paid_by, note,
     receipt_path, receipt_name, receipt_type, gallons, jurisdiction, created_by)
  values
    (new_id, l.organization_id, l.id, kind, amount, spent_on, add_my_expense.paid_by, nullif(trim(note), ''),
     receipt_path, receipt_name, receipt_type, add_my_expense.gallons,
     upper(nullif(trim(add_my_expense.jurisdiction), '')), (select auth.uid()));

  return new_id;
end;
$$;

revoke execute on function public.add_my_expense(uuid, text, numeric, date, text, text, text, text, uuid, text, numeric, text) from public, anon;
grant execute on function public.add_my_expense(uuid, text, numeric, date, text, text, text, text, uuid, text, numeric, text) to authenticated;

create or replace function public.my_load(target_load uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.loads;
  my_driver uuid := public.my_load_driver(target_load);
  sees_rate boolean;
begin
  if my_driver is null then
    raise exception 'That load isn''t on your schedule.' using errcode = 'P0002', hint = 'not_found';
  end if;
  select * into l from public.loads where id = target_load;
  sees_rate := coalesce(public.driver_sees_rate(l.id), false);

  return (public.load_dispatch_packet(l.id, sees_rate) - 'stops') || jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'delivered_on', l.delivered_on,
    'can_edit', l.status in ('dispatched', 'loaded', 'delivered'),
    'truck_odometer', public.truck_odometer_floor(l.id, now()),
    'detention_free_hours', l.detention_free_hours,
    'truck_details', (
      select jsonb_build_object(
        'unit_number', t.unit_number,
        'year', t.year,
        'make', t.make,
        'model', t.model,
        'vin', t.vin,
        'plate_number', t.plate_number,
        'plate_state', t.plate_state,
        'odometer', t.odometer,
        'odometer_on', t.odometer_on,
        'annual_inspection_on', t.annual_inspection_on,
        'registration_expires_on', t.registration_expires_on
      )
      from public.trucks t
      where t.id = l.truck_id and t.organization_id = l.organization_id
    ),
    'organization', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone, 'time_zone', o.time_zone)
      from public.organizations o where o.id = l.organization_id
    ),
    'driver_pay', (
      select case when coalesce(l.driver_pay_type, d.pay_type) is not null then jsonb_build_object(
        'type', coalesce(l.driver_pay_type, d.pay_type),
        'rate', case when l.driver_pay_type is not null then l.driver_pay_rate else d.pay_rate end
      ) end
      from public.drivers d where d.id = my_driver
    ),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'position', s.position,
        'kind', s.kind,
        'facility', s.facility,
        'location', s.location,
        'appointment_type', s.appointment_type,
        'appointment_start', s.appointment_start,
        'appointment_end', s.appointment_end,
        'appointment_at', s.appointment_at,
        'stop_number', s.stop_number,
        'reference_numbers', s.reference_numbers,
        'contact_phone', s.contact_phone,
        'notes', s.notes,
        'arrived_at', s.arrived_at,
        'arrived_source', s.arrived_source,
        'arrived_odometer', s.arrived_odometer,
        'departed_at', s.departed_at,
        'departed_source', s.departed_source,
        'departed_odometer', s.departed_odometer
      ) order by s.position)
      from public.load_stops s where s.load_id = l.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', doc.id,
        'kind', doc.kind,
        'path', doc.path,
        'file_name', doc.file_name,
        'content_type', doc.content_type,
        'size_bytes', doc.size_bytes,
        'created_at', doc.created_at,
        'mine', doc.uploaded_by = (select auth.uid())
      ) order by doc.created_at)
      from public.load_documents doc
      where doc.load_id = l.id
        and (doc.kind <> 'rate_con' or coalesce(public.driver_sees_rate_con(l.id), false))
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'kind', e.kind,
        'amount', e.amount,
        'paid_by', e.paid_by,
        'spent_on', e.spent_on,
        'note', e.note,
        'receipt_path', e.receipt_path,
        'receipt_type', e.receipt_type,
        'gallons', e.gallons,
        'jurisdiction', e.jurisdiction,
        'created_at', e.created_at,
        'mine', coalesce(e.created_by = (select auth.uid()), false)
      ) order by e.spent_on, e.created_at)
      from public.load_expenses e
      where e.load_id = l.id
        and (e.paid_by = 'driver' or e.created_by = (select auth.uid()))
    ), '[]'::jsonb)
  );
end;
$$;
