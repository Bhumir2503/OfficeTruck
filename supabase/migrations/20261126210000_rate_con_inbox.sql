-- Rate cons by email. Each company gets a forwarding address
-- (rc-<token>@<inbox domain>); brokers or dispatchers send rate cons to it.
-- Resend receives the email and calls the web app's webhook, which saves
-- each PDF or photo here and has AI read it. The office opens it from the
-- Rate con inbox: New Load comes up filled in, with the rate con attached,
-- the sender checked against the broker's domains, and Best matches.
--
-- Rows are written only by the web app's secret key. Members can see their
-- company's and mark one used or dismissed.

alter table public.organizations
  add column rate_con_inbox_token text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    check (rate_con_inbox_token ~ '^[a-z0-9]{8,32}$');

create table public.rate_con_inbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Resend's ids, so a webhook delivered twice saves the file once.
  email_id text not null,
  attachment_id text not null,
  -- Who it came from: the email's sender, and the rate con's own sender
  -- when someone forwarded it (for the domain check).
  from_email text not null check (char_length(from_email) <= 254),
  sender_email text check (char_length(sender_email) <= 254),
  subject text check (char_length(subject) <= 300),
  received_at timestamptz not null default now(),
  -- The file, in the load-documents bucket under <org>/inbox/.
  path text not null,
  file_name text not null check (char_length(file_name) <= 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- reading: AI is on it. ready: read. failed: couldn't be read (it can
  -- still be used by hand). used: a load was made from it. dismissed.
  status text not null default 'reading'
    check (status in ('reading', 'ready', 'failed', 'used', 'dismissed')),
  -- What AI read off it (RateConExtraction), and why it couldn't.
  extraction jsonb,
  error text check (char_length(error) <= 500),
  load_id uuid,
  updated_at timestamptz not null default now(),
  unique (email_id, attachment_id),
  foreign key (organization_id, load_id)
    references public.loads (organization_id, id) on delete set null (load_id)
);

create index rate_con_inbox_org_idx
  on public.rate_con_inbox (organization_id, received_at desc);

alter table public.rate_con_inbox enable row level security;

grant select on public.rate_con_inbox to authenticated;
grant update (status, load_id) on public.rate_con_inbox to authenticated;

create policy "Members can see their rate con inbox"
  on public.rate_con_inbox for select
  to authenticated
  using ((select public.is_organization_member(organization_id)));

create policy "Members can mark rate cons used or dismissed"
  on public.rate_con_inbox for update
  to authenticated
  using ((select public.is_organization_member(organization_id)))
  with check (
    (select public.is_organization_member(organization_id))
    and status in ('used', 'dismissed', 'ready', 'failed')
  );

create function public.rate_con_inbox_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rate_con_inbox_touch
  before update on public.rate_con_inbox
  for each row execute function public.rate_con_inbox_touch();
