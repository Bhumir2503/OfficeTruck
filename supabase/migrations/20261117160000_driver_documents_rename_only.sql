-- Renaming a driver document should change only its file name. Supabase
-- grants every signed-in user update on new tables by default, so the
-- column grant in 20261117150000 didn't narrow anything: owners and admins
-- could also change a document's kind, path or other fields. Take the
-- table-wide update away and grant it on the file name alone.

revoke update on public.driver_documents from authenticated;
grant update (file_name) on public.driver_documents to authenticated;
