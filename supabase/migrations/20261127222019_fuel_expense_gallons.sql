-- A fuel expense on a load can say how many gallons and in which state, so
-- the receipt also counts on the IFTA page: its truck is the load's truck.
-- Both or neither, and only on fuel. Existing expenses are left as they are.
--
-- The driver app's add_my_expense() doesn't send them yet; its expenses keep
-- saving without them.

alter table public.load_expenses
  add column gallons numeric(9, 3)
    check (gallons > 0 and gallons <= 10000),
  add column jurisdiction text
    check (public.is_ifta_jurisdiction(jurisdiction)),
  add constraint load_expenses_fuel_details check (
    (gallons is null) = (jurisdiction is null)
    and (gallons is null or kind = 'fuel')
  );

-- The IFTA page reads a quarter's fuel with gallons.
create index load_expenses_ifta_idx
  on public.load_expenses (organization_id, spent_on)
  where gallons is not null;
