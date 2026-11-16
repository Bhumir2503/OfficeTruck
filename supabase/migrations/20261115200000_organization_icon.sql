-- A square icon for the organization, shown in the sidebar switcher and
-- organization lists. Optional: without one, the icon fits the logo in the
-- square, then falls back to the first letter of the name.
--
-- It lives in the organization-logos bucket next to the logo, in its own
-- folder: <organization id>/icon/<file>. The logo moves to
-- <organization id>/logo/<file> from now on, so replacing one never removes
-- the other. The bucket's policies read the organization from the first
-- folder, so they already cover both.

alter table public.organizations
  add column icon_url text check (char_length(icon_url) <= 500);

grant update (icon_url) on public.organizations to authenticated;
