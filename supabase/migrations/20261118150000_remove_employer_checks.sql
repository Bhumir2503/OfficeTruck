-- Removing an entry from the previous-employer contact log (one logged by
-- mistake, say). Nothing in a DQ file is hard-deleted, so a removed entry
-- is marked removed, with who and when: it drops out of the log, the
-- export and the item's completion, and stays in the file's history.
--
--   * Owners and admins only, once per entry, and not after the driver
--     has left (the file is read-only then).
--   * Removing is the only change an entry can take.

alter table public.dq_employer_checks
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users (id) on delete set null,
  add constraint dq_employer_checks_removed
    check ((removed_at is null) = (removed_by is null));

create function public.dq_employer_checks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  removing boolean := new.removed_at is not null;
begin
  perform public.dq_refuse_if_frozen(old.driver_id);
  if old.removed_at is not null then
    raise exception 'That entry was already removed.'
      using errcode = '42501', hint = 'removed';
  end if;
  -- Nothing else about an entry changes.
  new := old;
  if removing then
    new.removed_at := now();
    new.removed_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger dq_employer_checks_before_update
  before update on public.dq_employer_checks
  for each row execute function public.dq_employer_checks_before_update();

grant update (removed_at) on public.dq_employer_checks to authenticated;

create policy "Owners and admins can remove employer checks"
  on public.dq_employer_checks for update
  to authenticated
  using ((select public.can_manage_dq(organization_id)) and removed_at is null)
  with check ((select public.can_manage_dq(organization_id)));
