-- A signed BOL means the freight is on the truck, and a signed POD means
-- it's been delivered, so uploading them moves the load along:
--
--   * a BOL on a dispatched load moves it to loaded (shown as In transit)
--   * a POD on a dispatched or loaded load moves it to delivered
--
-- Only forward, and only from those statuses: a BOL uploaded while a load
-- is still booked (planning) or after it's delivered changes nothing. The
-- move is logged with the reason, like any status change. Done in the
-- database so it works however the file arrives: the office, or later the
-- driver app.

create function public.load_documents_move_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  next_status text;
begin
  select status into current_status from public.loads where id = new.load_id for update;

  if new.kind = 'bol' and current_status = 'dispatched' then
    next_status := 'loaded';
  elsif new.kind = 'pod' and current_status in ('dispatched', 'loaded') then
    next_status := 'delivered';
  end if;

  if next_status is not null then
    perform set_config('officetruck.status_detail',
      case when new.kind = 'bol' then 'BOL uploaded' else 'POD uploaded' end, true);
    update public.loads set status = next_status where id = new.load_id;
    perform set_config('officetruck.status_detail', '', true);
  end if;

  return null;
end;
$$;

revoke execute on function public.load_documents_move_status() from public, anon, authenticated;

create trigger load_documents_move_status
  after insert on public.load_documents
  for each row execute function public.load_documents_move_status();
