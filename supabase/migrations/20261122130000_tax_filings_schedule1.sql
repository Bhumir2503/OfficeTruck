-- 2290 returns, as they're actually filed: the yearly return in summer,
-- plus another one for each month a truck is first put on the road later
-- in the tax year. So a tax year can have several returns. Each return's
-- stamped Schedule 1 (one document listing every VIN on it) is kept on the
-- return, in the private truck-documents bucket under "<organization>/2290/",
-- whose policies already key on the organization folder.

-- Drop the one-return-per-year rule, whatever Postgres named it.
do $$
declare
  rule text;
begin
  select con.conname into rule
  from pg_constraint con
  where con.conrelid = 'public.heavy_vehicle_tax_filings'::regclass
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by att.attname)
      from pg_attribute att
      where att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    ) = array['organization_id', 'tax_year'];
  if rule is null then
    raise exception 'No one-per-year rule found on heavy_vehicle_tax_filings';
  end if;
  execute format(
    'alter table public.heavy_vehicle_tax_filings drop constraint %I', rule
  );
end
$$;

create index if not exists heavy_vehicle_tax_filings_year_idx
  on public.heavy_vehicle_tax_filings (organization_id, tax_year);

alter table public.heavy_vehicle_tax_filings
  add column schedule1_path text check (char_length(schedule1_path) <= 300),
  add column schedule1_name text
    check (char_length(trim(schedule1_name)) between 1 and 200),
  add column schedule1_type text check (schedule1_type in (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
  )),
  -- All three or none, and only in the organization's 2290 folder.
  add constraint heavy_vehicle_tax_filings_schedule1_complete check (
    (schedule1_path is null) = (schedule1_name is null)
    and (schedule1_path is null) = (schedule1_type is null)
  ),
  add constraint heavy_vehicle_tax_filings_schedule1_in_folder check (
    schedule1_path is null
    or schedule1_path like organization_id::text || '/2290/%'
  );

-- A return recorded by mistake can be deleted; its truck list already goes
-- with it (on delete cascade). Nothing else points at returns.
grant delete on public.heavy_vehicle_tax_filings to authenticated;

create policy "Owners and admins can delete 2290 filings"
  on public.heavy_vehicle_tax_filings for delete
  to authenticated
  using ((select public.organization_role(organization_id)) in ('owner', 'admin'));
