-- Backfill: give every admin a row in `profiles` so the shared profile
-- editor (ProfilePage) can persist bio/hobbies/avatar_url.
--
-- Why it's needed: admin accounts (created by the admin-create-user edge
-- function with role='admin') only get a row in `admins`. getProfile()
-- fabricated a pseudo-profile from admins, so the profile form rendered fine,
-- but updateProfile() ran UPDATE profiles ... where id = x, which matched ZERO
-- rows. PostgREST returns 200 for a no-op update, so the UI toasted "Perfil
-- guardado" while actually saving nothing (photo included).
--
-- This mirrors http backfill + the frontend guard in ProfilePage.getProfileFromDB.

insert into public.profiles (id, username, full_name, avatar_url, first_login)
select a.id, a.username, a.full_name, a.avatar_url, false
from public.admins a
where not exists (select 1 from public.profiles p where p.id = a.id)
on conflict (id) do nothing;

-- Keep first_login in sync: admins have already been through the password
-- setup (admins.first_login = false). A freshly materialized profiles row
-- must not route them back into the first-login flow.
update public.profiles p
set first_login = false, updated_at = now()
where p.first_login = true
  and exists (select 1 from public.admins a where a.id = p.id);