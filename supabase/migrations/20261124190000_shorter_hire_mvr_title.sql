-- A shorter name for the hiring MVR. Each state's record is its own item and
-- already shows the state after the name ("· TX"), so "from each state that
-- licensed the driver" only made the row wrap.
update public.dq_requirement_templates
set title = 'Driving record (MVR), past 3 years'
where code = 'hire_mvr';
