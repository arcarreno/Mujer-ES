-- =====================================================
-- 1. PROFILES — Datos extra del usuario
-- =====================================================

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  full_name text not null,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_blocked
  on public.profiles(blocked_until)
  where blocked_until is not null;

-- =====================================================
-- 2. ADMINS — Tabla separada para administradores
-- =====================================================

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  phone text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admins_username_idx on public.admins (username);

-- =====================================================
-- 3. TRIGGER — Crear profile o admin automáticamente al registrarse
-- =====================================================

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 4. HELPER — is_admin() con security definer
-- (necesario para evitar infinite recursion en RLS)
-- =====================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admins where id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- =====================================================
-- 5. RLS — Row Level Security en profiles
-- =====================================================

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);

-- =====================================================
-- 6. RLS — Row Level Security en admins
-- =====================================================

alter table public.admins enable row level security;

drop policy if exists "admins_select_admin" on public.admins;
create policy "admins_select_admin"
  on public.admins for select
  using (public.is_admin() or auth.uid() = id);

drop policy if exists "admins_insert_admin" on public.admins;
create policy "admins_insert_admin"
  on public.admins for insert
  with check (public.is_admin());

drop policy if exists "admins_update_admin" on public.admins;
create policy "admins_update_admin"
  on public.admins for update
  using (public.is_admin() or auth.uid() = id);

drop policy if exists "admins_delete_admin" on public.admins;
create policy "admins_delete_admin"
  on public.admins for delete
  using (public.is_admin());

-- =====================================================
-- 7. CONVERSATIONS — Chat user ↔ admin
-- =====================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  participants jsonb not null default '[]',
  type text not null default 'user_admin' check (type in ('user_admin', 'admin_admin')),
  state text not null default 'bot' check (state in ('bot', 'waiting_human', 'human', 'admin_to_admin', 'closed')),
  assigned_admin_id uuid references auth.users,
  bot_step int not null default 0,
  last_message_at timestamptz default now(),
  unread_user int not null default 0,
  unread_admin int not null default 0,
  created_at timestamptz not null default now(),
  constraint conv_type_user check (
    (type = 'user_admin' and user_id is not null) or
    (type = 'admin_admin' and user_id is null)
  )
);

create unique index if not exists uniq_user_conversation
  on public.conversations (user_id)
  where type = 'user_admin';

create index if not exists idx_conv_participants on public.conversations using gin(participants);
create index if not exists idx_conv_state on public.conversations(state);
create index if not exists idx_conv_last_msg on public.conversations(last_message_at desc);

alter table public.conversations enable row level security;

drop policy if exists "user reads own conv" on public.conversations;
create policy "user reads own conv" on public.conversations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user creates own conv" on public.conversations;
create policy "user creates own conv" on public.conversations
  for insert to authenticated
  with check (auth.uid() = user_id and type = 'user_admin');

drop policy if exists "user updates own conv" on public.conversations;
create policy "user updates own conv" on public.conversations
  for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "admins read all convs" on public.conversations;
create policy "admins read all convs" on public.conversations
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update all convs" on public.conversations;
create policy "admins update all convs" on public.conversations
  for update to authenticated
  using (public.is_admin());

drop policy if exists "admins read admin convs" on public.conversations;
create policy "admins read admin convs" on public.conversations
  for select to authenticated
  using (
    type = 'admin_admin'
    and auth.uid() = any(participants)
    and public.is_admin()
  );

drop policy if exists "admins create admin convs" on public.conversations;
create policy "admins create admin convs" on public.conversations
  for insert to authenticated
  with check (
    type = 'admin_admin'
    and auth.uid() = any(participants)
    and public.is_admin()
  );

-- =====================================================
-- 8. MESSAGES — Mensajes del chat
-- =====================================================

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references auth.users not null,
  sender_role text not null check (sender_role in ('user', 'admin', 'bot', 'system')),
  content text not null check (length(content) between 1 and 500),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conv_time on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_created on public.messages(created_at);
create index if not exists idx_messages_unread on public.messages(conversation_id, read) where read = false;

alter table public.messages enable row level security;

drop policy if exists "user reads own messages" on public.messages;
create policy "user reads own messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

drop policy if exists "user sends own messages" on public.messages;
create policy "user sends own messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'user'
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

drop policy if exists "admins read all messages" on public.messages;
create policy "admins read all messages" on public.messages
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins send messages" on public.messages;
create policy "admins send messages" on public.messages
  for insert to authenticated
  with check (
    sender_role in ('admin', 'bot', 'system')
    and public.is_admin()
  );

drop policy if exists "admins read admin chat messages" on public.messages;
create policy "admins read admin chat messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.type = 'admin_admin'
      and auth.uid() = any(c.participants)
    )
  );

drop policy if exists "admins send in admin chat" on public.messages;
create policy "admins send in admin chat" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'admin'
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.type = 'admin_admin'
      and auth.uid() = any(c.participants)
    )
  );

-- =====================================================
-- 9. FORM_RESPONSES — Para formulario
-- =====================================================

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  form_type text not null,
  responses jsonb not null,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_form_responses_user on public.form_responses(user_id);
create index if not exists idx_form_responses_type on public.form_responses(form_type);

alter table public.form_responses enable row level security;

drop policy if exists "user reads own responses" on public.form_responses;
create policy "user reads own responses" on public.form_responses
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user inserts own responses" on public.form_responses;
create policy "user inserts own responses" on public.form_responses
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "admins read all responses" on public.form_responses;
create policy "admins read all responses" on public.form_responses
  for select to authenticated
  using (public.is_admin());

-- =====================================================
-- 10. COURSES — Cursos publicados por admin
-- =====================================================

create table if not exists public.courses (
  id uuid default extensions.gen_random_uuid() primary key,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  modality text not null check (modality in ('virtual', 'presencial')),
  published boolean not null default false,
  concluded boolean not null default false,
  created_by uuid references auth.users on delete set null,
  max_enrollments integer,
  latitude double precision,
  longitude double precision,
  location_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courses_published on public.courses(published);
create index if not exists idx_courses_created_at on public.courses(created_at desc);

alter table public.courses enable row level security;

drop policy if exists "admins manage courses" on public.courses;
create policy "admins manage courses" on public.courses
  for all to authenticated
  using (public.is_admin());

drop policy if exists "public read published courses" on public.courses;
create policy "public read published courses" on public.courses
  for select to anon, authenticated
  using (published = true);

-- =====================================================
-- 11. COURSE ENROLLMENTS — Inscripciones a cursos
-- =====================================================

create table if not exists public.course_enrollments (
  id uuid default extensions.gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  course_id uuid references public.courses on delete cascade not null,
  enrolled_at timestamptz not null default now(),
  qr_code text,
  access_code text,
  attended boolean not null default false,
  attended_at timestamptz,
  unique(user_id, course_id)
);

create index if not exists idx_enrollments_course on public.course_enrollments(course_id);
create index if not exists idx_enrollments_user on public.course_enrollments(user_id);
create unique index if not exists idx_enrollments_qr on public.course_enrollments(qr_code) where qr_code is not null;
create unique index if not exists idx_enrollments_access_code on public.course_enrollments(access_code, course_id) where access_code is not null;

alter table public.course_enrollments enable row level security;

drop policy if exists "users read own enrollments" on public.course_enrollments;
create policy "users read own enrollments" on public.course_enrollments
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users enroll themselves" on public.course_enrollments;
create policy "users enroll themselves" on public.course_enrollments
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users unenroll themselves" on public.course_enrollments;
create policy "users unenroll themselves" on public.course_enrollments
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins read all enrollments" on public.course_enrollments;
create policy "admins read all enrollments" on public.course_enrollments
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update enrollments" on public.course_enrollments;
create policy "admins update enrollments" on public.course_enrollments
  for update to authenticated
  using (public.is_admin());

-- =====================================================
-- 12. SECURITY QUESTIONS — Recuperación de contraseña
-- =====================================================

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

-- =====================================================
-- 13. ADMIN SECURITY QUESTIONS — Recuperación de admin
-- =====================================================

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

-- =====================================================
-- 14. PASSWORD RESET TOKENS — Tokens de recuperación
-- =====================================================

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  token text,
  expires_at timestamptz not null,
  used boolean not null default false,
  attempt_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_token_idx
  on public.password_reset_tokens (token);

alter table public.password_reset_tokens enable row level security;

-- =====================================================
-- 15. TRIGGERS — Updated_at automático
-- =====================================================

-- Courses updated_at trigger
create or replace function public.update_courses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_courses_updated_at on public.courses;
create trigger update_courses_updated_at
  before update on public.courses
  for each row execute procedure public.update_courses_updated_at();

-- =====================================================
-- 16. AUTO-BORRADO — Mensajes con más de 2 días
-- =====================================================

create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-old-messages',
  '0 3 * * *',
  $$ delete from public.messages where created_at < now() - interval '2 days'; $$
);

-- =====================================================
-- 17. REALTIME — Habilitar suscripciones WebSocket
-- =====================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.admins;

-- =====================================================
-- ✅ LISTO — Verificar que todo creó correctamente
-- =====================================================

select 'profiles' as tabla, count(*) as registros from public.profiles
union all
select 'admins', count(*) from public.admins
union all
select 'conversations', count(*) from public.conversations
union all
select 'messages', count(*) from public.messages
union all
select 'form_responses', count(*) from public.form_responses
union all
select 'courses', count(*) from public.courses
union all
select 'course_enrollments', count(*) from public.course_enrollments
union all
select 'security_questions', count(*) from public.security_questions
union all
select 'admin_security_questions', count(*) from public.admin_security_questions
union all
select 'password_reset_tokens', count(*) from public.password_reset_tokens;
