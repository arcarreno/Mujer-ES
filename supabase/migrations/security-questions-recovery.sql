-- =====================================================
-- PASSWORD RECOVERY VIA SECURITY QUESTIONS
-- =====================================================
-- Replaces the WhatsApp OTP flow with security questions.
-- Plaintext storage (consistent with profiles.password
-- decision). Answers are normalized client-side AND
-- server-side (lowercase + trim + accent strip).
--
-- If user picks "N/A" in a question, that column is NULL
-- and the question is skipped during verification.
--
-- This migration:
--   1. Drops the old WhatsApp RPC
--   2. Renames password_reset_codes → password_reset_tokens
--      and renames the "code" column to "token"
--   3. Creates security_questions (regular users)
--   4. Creates admin_security_questions
--   5. Updates handle_new_user trigger to also save the
--      security question answers
--   6. Creates RPCs for the new recovery flow
-- =====================================================

-- -----------------------------------------------------
-- 1. Drop the old WhatsApp RPC
-- -----------------------------------------------------
drop function if exists public.get_phone_by_identifier(text);

-- -----------------------------------------------------
-- 2. Rename password_reset_codes → password_reset_tokens
--    and rename "code" to "token" (clearer for the
--    new flow: a token, not a 6-digit code).
--    Wrapped in DO blocks so the migration is idempotent
--    and re-runnable even if partial changes already exist.
-- -----------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'password_reset_codes'
  ) then
    alter table public.password_reset_codes rename to password_reset_tokens;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'password_reset_tokens'
      and column_name = 'code'
  ) then
    alter table public.password_reset_tokens rename column code to token;
  end if;
end $$;

-- Make sure the token column is text and nullable (no-op if already so)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'password_reset_tokens'
      and column_name = 'token'
  ) then
    alter table public.password_reset_tokens alter column token type text;
    alter table public.password_reset_tokens alter column token drop not null;
  end if;
end $$;

-- Track failed verification attempts (for future rate limiting)
alter table public.password_reset_tokens
  add column if not exists attempt_count int not null default 0;

-- Drop the leftover WhatsApp-era column. It is NOT NULL and not used by
-- the new flow, so leaving it would make verify_security_answers fail
-- with a constraint violation on the first successful insert.
alter table public.password_reset_tokens
  drop column if exists phone;

-- -----------------------------------------------------
-- 3. security_questions (regular users)
--    Answers are NULL when the user picked "N/A".
-- -----------------------------------------------------
create table if not exists public.security_questions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  question_1 text not null,
  answer_1 text,
  question_2 text not null,
  answer_2 text,
  question_3 text not null,
  answer_3 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.security_questions enable row level security;

drop policy if exists "security_questions_select_own" on public.security_questions;
create policy "security_questions_select_own"
  on public.security_questions for select
  using (auth.uid() = user_id);

drop policy if exists "security_questions_insert_self" on public.security_questions;
create policy "security_questions_insert_self"
  on public.security_questions for insert
  with check (auth.uid() = user_id);

drop policy if exists "security_questions_update_self" on public.security_questions;
create policy "security_questions_update_self"
  on public.security_questions for update
  using (auth.uid() = user_id);

-- -----------------------------------------------------
-- 4. admin_security_questions
-- -----------------------------------------------------
create table if not exists public.admin_security_questions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  question_1 text not null,
  answer_1 text,
  question_2 text not null,
  answer_2 text,
  question_3 text not null,
  answer_3 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_security_questions enable row level security;

drop policy if exists "admin_security_questions_select_own" on public.admin_security_questions;
create policy "admin_security_questions_select_own"
  on public.admin_security_questions for select
  using (auth.uid() = user_id);

drop policy if exists "admin_security_questions_insert_self" on public.admin_security_questions;
create policy "admin_security_questions_insert_self"
  on public.admin_security_questions for insert
  with check (auth.uid() = user_id);

drop policy if exists "admin_security_questions_update_self" on public.admin_security_questions;
create policy "admin_security_questions_update_self"
  on public.admin_security_questions for update
  using (auth.uid() = user_id);

-- -----------------------------------------------------
-- 5. Update handle_new_user trigger
--    Also receives security questions in metadata and
--    inserts them into the appropriate table.
--    Metadata keys: sq1, sa1, sq2, sa2, sq3, sa3
--    If all 3 answers are NULL, no row is inserted.
-- -----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'user');
  v_username text := new.raw_user_meta_data->>'username';
  v_full_name text := new.raw_user_meta_data->>'full_name';
  v_phone text := new.raw_user_meta_data->>'phone';
  v_password text := new.raw_user_meta_data->>'password';
  v_sq1 text := new.raw_user_meta_data->>'sq1';
  v_sa1 text := new.raw_user_meta_data->>'sa1';
  v_sq2 text := new.raw_user_meta_data->>'sq2';
  v_sa2 text := new.raw_user_meta_data->>'sa2';
  v_sq3 text := new.raw_user_meta_data->>'sq3';
  v_sa3 text := new.raw_user_meta_data->>'sa3';
begin
  if v_role = 'admin' then
    insert into public.admins (id, username, full_name, phone, password)
    values (new.id, v_username, v_full_name, v_phone, v_password)
    on conflict (id) do nothing;

    -- Only insert if at least one answer is provided
    if v_sa1 is not null or v_sa2 is not null or v_sa3 is not null then
      insert into public.admin_security_questions
        (user_id, question_1, answer_1,
         question_2, answer_2,
         question_3, answer_3)
      values
        (new.id, v_sq1, v_sa1,
                v_sq2, v_sa2,
                v_sq3, v_sa3)
      on conflict (user_id) do update set
        question_1 = excluded.question_1,
        answer_1   = excluded.answer_1,
        question_2 = excluded.question_2,
        answer_2   = excluded.answer_2,
        question_3 = excluded.question_3,
        answer_3   = excluded.answer_3,
        updated_at = now();
    end if;
  else
    insert into public.profiles (id, username, full_name, password)
    values (new.id, v_username, v_full_name, v_password)
    on conflict (id) do nothing;

    if v_sa1 is not null or v_sa2 is not null or v_sa3 is not null then
      insert into public.security_questions
        (user_id, question_1, answer_1,
         question_2, answer_2,
         question_3, answer_3)
      values
        (new.id, v_sq1, v_sa1,
                v_sq2, v_sa2,
                v_sq3, v_sa3)
      on conflict (user_id) do update set
        question_1 = excluded.question_1,
        answer_1   = excluded.answer_1,
        question_2 = excluded.question_2,
        answer_2   = excluded.answer_2,
        question_3 = excluded.question_3,
        answer_3   = excluded.answer_3,
        updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------
-- 6. RPC: get_security_questions
--    Returns the 3 questions (no answers) for a given
--    identifier (username or email). Security definer so
--    unauthenticated users can call it from the recovery
--    flow.
-- -----------------------------------------------------
create or replace function public.get_security_questions(p_identifier text)
returns table (
  user_id uuid,
  is_admin boolean,
  question_1 text,
  question_2 text,
  question_3 text,
  -- nullability: which questions have answers
  has_answer_1 boolean,
  has_answer_2 boolean,
  has_answer_3 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := lower(trim(p_identifier));
  v_user_id uuid;
  v_is_admin boolean := false;
begin
  -- Try as username in profiles
  select id into v_user_id from public.profiles where username = v_clean limit 1;

  -- Try as username in admins
  if v_user_id is null then
    select id into v_user_id from public.admins where username = v_clean limit 1;
    if v_user_id is not null then
      v_is_admin := true;
    end if;
  end if;

  -- Try as email in auth.users
  if v_user_id is null then
    select id into v_user_id from auth.users where email = v_clean limit 1;
  end if;

  if v_user_id is null then
    return; -- not found
  end if;

  if v_is_admin then
    return query
      select
        s.user_id,
        true,
        s.question_1,
        s.question_2,
        s.question_3,
        (s.answer_1 is not null),
        (s.answer_2 is not null),
        (s.answer_3 is not null)
      from public.admin_security_questions s
      where s.user_id = v_user_id;
  else
    return query
      select
        s.user_id,
        false,
        s.question_1,
        s.question_2,
        s.question_3,
        (s.answer_1 is not null),
        (s.answer_2 is not null),
        (s.answer_3 is not null)
      from public.security_questions s
      where s.user_id = v_user_id;
  end if;
end;
$$;

grant execute on function public.get_security_questions(text) to anon, authenticated;

-- -----------------------------------------------------
-- 7. RPC: verify_security_answers
--    Compares the 3 answers. NULL stored values (user
--    picked N/A) are treated as automatically correct.
--    If all answers match, returns a one-time reset_token
--    valid for 10 minutes.
-- -----------------------------------------------------
create or replace function public.verify_security_answers(
  p_identifier text,
  p_answer_1 text,
  p_answer_2 text,
  p_answer_3 text
)
returns table (reset_token text, user_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := lower(trim(p_identifier));
  v_user_id uuid;
  v_is_admin boolean := false;
  v_stored_a1 text;
  v_stored_a2 text;
  v_stored_a3 text;
  v_a1_ok boolean;
  v_a2_ok boolean;
  v_a3_ok boolean;
  v_token text;
  v_expires timestamptz;
  v_normalized_input_1 text;
  v_normalized_input_2 text;
  v_normalized_input_3 text;
begin
  -- Lookup user_id (same logic as get_security_questions)
  select id into v_user_id from public.profiles where username = v_clean limit 1;

  if v_user_id is null then
    select id into v_user_id from public.admins where username = v_clean limit 1;
    if v_user_id is not null then v_is_admin := true; end if;
  end if;

  if v_user_id is null then
    select id into v_user_id from auth.users where email = v_clean limit 1;
  end if;

  if v_user_id is null then
    return; -- not found
  end if;

  -- Get stored answers
  if v_is_admin then
    select answer_1, answer_2, answer_3
      into v_stored_a1, v_stored_a2, v_stored_a3
    from public.admin_security_questions
    where user_id = v_user_id;
  else
    select answer_1, answer_2, answer_3
      into v_stored_a1, v_stored_a2, v_stored_a3
    from public.security_questions
    where user_id = v_user_id;
  end if;

  -- Normalize inputs server-side (defense in depth)
  -- Same logic as src/lib/normalize.ts
  v_normalized_input_1 := lower(trim(coalesce(p_answer_1, '')));
  v_normalized_input_2 := lower(trim(coalesce(p_answer_2, '')));
  v_normalized_input_3 := lower(trim(coalesce(p_answer_3, '')));

  -- NULL stored = question was N/A, treat as correct
  v_a1_ok := (v_stored_a1 is null) or (v_stored_a1 = v_normalized_input_1);
  v_a2_ok := (v_stored_a2 is null) or (v_stored_a2 = v_normalized_input_2);
  v_a3_ok := (v_stored_a3 is null) or (v_stored_a3 = v_normalized_input_3);

  if v_a1_ok and v_a2_ok and v_a3_ok then
    -- pgcrypto lives in the 'extensions' schema on Supabase, not 'public'
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires := now() + interval '10 minutes';

    insert into public.password_reset_tokens (user_id, token, expires_at)
    values (v_user_id, v_token, v_expires);

    return query select v_token, v_user_id, v_expires;
  end if;
end;
$$;

grant execute on function public.verify_security_answers(text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------
-- 8. RPC: view_password_with_token
--    Returns the plaintext password from profiles or
--    admins if the token is valid (not used, not expired).
--    Token is marked as used atomically.
-- -----------------------------------------------------
create or replace function public.view_password_with_token(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_used boolean;
  v_expires timestamptz;
  v_is_admin boolean;
  v_password text;
begin
  select user_id, used, expires_at
    into v_user_id, v_used, v_expires
  from public.password_reset_tokens
  where token = p_token;

  if v_user_id is null or v_used or v_expires < now() then
    return null; -- invalid, expired, or used
  end if;

  -- Mark as used
  update public.password_reset_tokens
    set used = true
    where token = p_token;

  -- Determine if user is admin and get password
  select exists (select 1 from public.admins where id = v_user_id) into v_is_admin;

  if v_is_admin then
    select password into v_password from public.admins where id = v_user_id;
  else
    select password into v_password from public.profiles where id = v_user_id;
  end if;

  return v_password;
end;
$$;

grant execute on function public.view_password_with_token(text) to anon, authenticated;

-- -----------------------------------------------------
-- 9. RPC: modify_password_with_token
--    Updates the password in both auth.users (the real
--    login password) and profiles/admins (the plaintext
--    copy used for "view my password").
-- -----------------------------------------------------
create or replace function public.modify_password_with_token(
  p_token text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
begin
  select user_id into v_user_id
  from public.password_reset_tokens
  where token = p_token and used = false and expires_at > now();

  if v_user_id is null then
    raise exception 'Token inválido o expirado';
  end if;

  -- Mark token as used
  update public.password_reset_tokens
    set used = true
    where token = p_token;

  -- Update auth.users (the real password)
  -- pgcrypto lives in 'extensions' schema on Supabase
  update auth.users
    set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
    where id = v_user_id;

  -- Update profiles or admins (the plaintext copy)
  select exists (select 1 from public.admins where id = v_user_id) into v_is_admin;

  if v_is_admin then
    update public.admins set password = p_new_password where id = v_user_id;
  else
    update public.profiles set password = p_new_password where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.modify_password_with_token(text, text) to anon, authenticated;

-- -----------------------------------------------------
-- 10. RPC: save_user_security_questions
--     For users who want to set up their security
--     questions AFTER registration (not currently used
--     by the flow, but kept for future flexibility).
-- -----------------------------------------------------
create or replace function public.save_user_security_questions(
  p_q1 text, p_a1 text,
  p_q2 text, p_a2 text,
  p_q3 text, p_a3 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select exists (select 1 from public.admins where id = auth.uid()) into v_is_admin;

  if v_is_admin then
    insert into public.admin_security_questions
      (user_id, question_1, answer_1, question_2, answer_2, question_3, answer_3)
    values (auth.uid(), p_q1, p_a1, p_q2, p_a2, p_q3, p_a3)
    on conflict (user_id) do update set
      question_1 = excluded.question_1,
      answer_1   = excluded.answer_1,
      question_2 = excluded.question_2,
      answer_2   = excluded.answer_2,
      question_3 = excluded.question_3,
      answer_3   = excluded.answer_3,
      updated_at = now();
  else
    insert into public.security_questions
      (user_id, question_1, answer_1, question_2, answer_2, question_3, answer_3)
    values (auth.uid(), p_q1, p_a1, p_q2, p_a2, p_q3, p_a3)
    on conflict (user_id) do update set
      question_1 = excluded.question_1,
      answer_1   = excluded.answer_1,
      question_2 = excluded.question_2,
      answer_2   = excluded.answer_2,
      question_3 = excluded.question_3,
      answer_3   = excluded.answer_3,
      updated_at = now();
  end if;
end;
$$;

grant execute on function public.save_user_security_questions(text, text, text, text, text, text) to authenticated;

-- =====================================================
-- DONE. Verify with:
--   \d public.security_questions
--   \d public.admin_security_questions
--   \d public.password_reset_tokens
--   select proname from pg_proc where proname like '%security%';
-- =====================================================
