-- The driver's CDL in full, for the CDL card on the driver page: its class,
-- endorsements and restrictions, beside the number, state and expiration
-- already on drivers. The other states that licensed the driver in the past
-- 3 years (prior_license_states) are entered on the same card.
--
-- Endorsements, by the letter printed on the license:
--   H hazardous materials   N tank vehicle      P passenger
--   S school bus            T double/triple trailers
--   X tank vehicle and hazardous materials combined
--
-- The medical card, annual review and Clearinghouse query dates on drivers
-- are no longer entered: the qualification file tracks them. The columns
-- stay, unused, so nothing already saved is lost.

alter table public.drivers
  add column cdl_class text check (cdl_class in ('A', 'B', 'C')),
  add column cdl_endorsements text[] not null default '{}'
    check (cdl_endorsements <@ array['H', 'N', 'P', 'S', 'T', 'X']::text[]),
  add column cdl_restrictions text check (char_length(trim(cdl_restrictions)) between 1 and 60);

-- The DQ history logs changes to the CDL details too.
create or replace function public.dq_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op = 'UPDATE' then public.dq_audit_scrub(to_jsonb(old)) end;
  after_row jsonb := public.dq_audit_scrub(to_jsonb(new));
  dq_columns text[] := array[
    'license_class', 'cdl_number', 'cdl_state', 'cdl_class', 'cdl_endorsements',
    'cdl_restrictions', 'cdl_expires_on', 'prior_license_states', 'start_date',
    'end_date', 'holds_medical_variance', 'login_phone', 'user_id'
  ];
begin
  if tg_table_name = 'drivers' then
    if tg_op = 'UPDATE' then
      before_row := (select jsonb_object_agg(key, value) from jsonb_each(before_row) where key = any (dq_columns));
      after_row := (select jsonb_object_agg(key, value) from jsonb_each(after_row) where key = any (dq_columns));
      if before_row = after_row then
        return new;
      end if;
    else
      after_row := (select jsonb_object_agg(key, value) from jsonb_each(after_row) where key = any (dq_columns));
    end if;
  end if;

  insert into public.dq_audit_log (
    organization_id, driver_id, actor_id, action, entity, entity_id, before, after
  )
  values (
    new.organization_id,
    case when tg_table_name = 'drivers' then new.id else (to_jsonb(new) ->> 'driver_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    new.id,
    before_row,
    after_row
  );
  return new;
end;
$$;
