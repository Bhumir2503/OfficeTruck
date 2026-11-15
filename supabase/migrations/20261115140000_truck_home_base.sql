-- Where a truck starts from when it has no earlier load: the yard, or the
-- driver's home. Empty (deadhead) miles to a load's first pickup are
-- estimated from the truck's last delivery, or from here.

alter table public.trucks
  add column home_base text check (char_length(trim(home_base)) between 1 and 200);
