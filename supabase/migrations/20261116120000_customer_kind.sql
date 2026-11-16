-- Customers. A carrier may book through brokers, or directly with the
-- shipper. Both are billed the same way (terms, invoices, payment history),
-- so they share the brokers table and differ only by kind. A direct shipper
-- has no broker authority, so it has no MC number to check with FMCSA.

alter table public.brokers
  add column kind text not null default 'broker'
    check (kind in ('broker', 'shipper'));

alter table public.brokers
  add constraint brokers_shipper_has_no_mc
    check (kind = 'broker' or mc_number is null);
