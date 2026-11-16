-- Company logo, for invoices, and reminders on unpaid invoices.
--
--   * The logo lives in the public organization-logos bucket at
--     <organization id>/<file>, so invoices and the packet PDF can load it
--     from its URL. File names are random. Owners and admins set it, like
--     the rest of the company profile.
--   * A reminder re-sends an unpaid invoice's packet; how many went out and
--     when the last did are kept on the invoice.

-- ------------------------------------------------------------- Logo -----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  2097152, -- 2 MB; the app uploads a PNG of at most 800px, far below this.
  array['image/png']
)
on conflict (id) do nothing;

-- The organization a logo belongs to, from the first folder of its path.
create function public.logo_organization(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy "Owners and admins can upload their logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'organization-logos'
    and (select public.organization_role(public.logo_organization(name))) in ('owner', 'admin')
  );

create policy "Owners and admins can remove their logo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and (select public.organization_role(public.logo_organization(name))) in ('owner', 'admin')
  );

-- Listing a folder needs select; reads of the image itself go through the
-- public URL.
create policy "Members can list their logo files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and (select public.is_organization_member(public.logo_organization(name)))
  );

alter table public.organizations
  add column logo_url text check (char_length(logo_url) <= 500);

grant update (logo_url) on public.organizations to authenticated;

-- -------------------------------------------------------- Reminders -----

alter table public.invoices
  add column reminder_count integer not null default 0,
  add column last_reminded_at timestamptz;

-- Records a reminder the app has just emailed for an unpaid invoice.
create function public.record_invoice_reminder(target_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = target_invoice for update;
  if i.id is null or not public.is_organization_member(i.organization_id) then
    raise exception 'That invoice doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if i.status <> 'sent' then
    raise exception 'Only an unpaid invoice gets a reminder.' using errcode = '22023', hint = 'not_sent';
  end if;
  update public.invoices
  set reminder_count = reminder_count + 1, last_reminded_at = now()
  where id = target_invoice;
end;
$$;

revoke execute on function public.record_invoice_reminder(uuid) from public, anon;
grant execute on function public.record_invoice_reminder(uuid) to authenticated;
