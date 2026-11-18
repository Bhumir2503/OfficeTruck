-- DQ files, step 3: reminders. The daily job (app/api/cron/dq-daily) emails
-- the owner at 60, 30, 14 and 7 days before an item is due, then weekly
-- once it's overdue. Each reminder is recorded here so a rerun of the job
-- never sends the same one twice. Written only by the job, with the secret
-- key; owners and admins can read when reminders went out.

create table public.dq_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  dq_item_id uuid not null,
  -- d60, d30, d14, d7, or overdue_<weeks late>
  reminder text not null check (reminder ~ '^(d60|d30|d14|d7|overdue_[0-9]{1,4})$'),
  -- The date the reminder is about (the due or expiry date), so a changed
  -- date gets its own reminders.
  due_on date not null,
  sent_to text not null check (char_length(sent_to) <= 254),
  sent_at timestamptz not null default now(),
  constraint dq_reminders_item_fkey
    foreign key (organization_id, dq_item_id)
    references public.dq_items (organization_id, id) on delete cascade,
  constraint dq_reminders_once unique (dq_item_id, reminder, due_on)
);

create index dq_reminders_organization_idx on public.dq_reminders (organization_id, sent_at);

create trigger dq_reminders_refuse_delete
  before delete on public.dq_reminders
  for each row execute function public.dq_refuse_delete();

alter table public.dq_reminders enable row level security;

grant select on public.dq_reminders to authenticated;

create policy "Owners and admins can see DQ reminders"
  on public.dq_reminders for select
  to authenticated
  using ((select public.can_manage_dq(organization_id)));

-- --------------------------------------------------- Who a driver is -----

-- For a driver signed in on the phone app: the drivers they're linked to,
-- with each carrier's name. Drivers can't read the drivers or organizations
-- tables, so this hands back only these few fields, for themselves.
create function public.my_dq_drivers()
returns table (
  organization_id uuid,
  organization_name text,
  driver_id uuid,
  full_name text,
  license_class text,
  start_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, d.id, d.full_name, d.license_class, d.start_date
  from public.drivers d
  join public.organizations o on o.id = d.organization_id
  where d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date)
  order by o.name;
$$;

revoke execute on function public.my_dq_drivers() from public, anon;
grant execute on function public.my_dq_drivers() to authenticated;
