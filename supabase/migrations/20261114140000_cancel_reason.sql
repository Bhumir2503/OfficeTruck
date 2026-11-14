-- Canceling a load takes a reason. It's kept on the load while it stays
-- canceled, and written into the status history.

alter table public.loads
  add column cancel_reason text check (char_length(cancel_reason) <= 500);

-- A load moving to canceled needs a reason; one leaving canceled (reopened)
-- drops it. Loads canceled before this keep no reason.
create function public.loads_cancel_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancel_reason := nullif(trim(new.cancel_reason), '');
    if new.cancel_reason is null then
      raise exception 'Give a reason for canceling the load.'
        using errcode = '23514', hint = 'cancel_reason';
    end if;
  elsif new.status <> 'cancelled' then
    new.cancel_reason := null;
  end if;
  return new;
end;
$$;

create trigger loads_cancel_reason
  before update on public.loads
  for each row execute function public.loads_cancel_reason();

-- The status log now records the cancel reason as the change's detail.
create or replace function public.loads_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := coalesce(current_setting('officetruck.status_reason', true), '');
begin
  if new.status is distinct from old.status then
    insert into public.load_events (organization_id, load_id, kind, from_status, to_status, detail)
    values (
      new.organization_id, new.id,
      case when reason in ('dispatched', 'unassigned', 'reopened') then reason else 'status' end,
      old.status, new.status,
      coalesce(
        nullif(current_setting('officetruck.status_detail', true), ''),
        case when new.status = 'cancelled' then new.cancel_reason end
      )
    );
  end if;
  return new;
end;
$$;
