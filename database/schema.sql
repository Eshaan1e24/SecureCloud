-- Run this whole file once in Supabase: SQL Editor > New query > paste > Run.

-- 1. Private storage bucket
insert into storage.buckets (id, name, public) values ('securecloud-files', 'securecloud-files', false)
on conflict (id) do update set public = false;

-- 2. Metadata table
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size >= 0),
  mime_type text not null,
  file_extension text not null,
  category text not null check (category in ('document','spreadsheet','presentation','image')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists files_user_created_idx on public.files (user_id, created_at desc);

-- 3. Row Level Security: users may touch only their own rows (the API uses the service key, which bypasses RLS,
--    and additionally filters by user_id on every query)
alter table public.files enable row level security;
drop policy if exists "read own files" on public.files;
drop policy if exists "insert own files" on public.files;
drop policy if exists "delete own files" on public.files;
create policy "read own files" on public.files for select to authenticated using (user_id = auth.uid());
create policy "insert own files" on public.files for insert to authenticated with check (user_id = auth.uid());
create policy "delete own files" on public.files for delete to authenticated using (user_id = auth.uid());

-- 4. Statistics helper, callable only by the backend (service role)
create or replace function public.file_stats(p_user uuid)
returns table(category text, cnt bigint, bytes bigint) language sql stable as $$
  select category, count(*), coalesce(sum(file_size), 0) from public.files where user_id = p_user group by category
$$;
revoke execute on function public.file_stats(uuid) from public, anon, authenticated;
grant execute on function public.file_stats(uuid) to service_role;

-- No storage policies are created on purpose: browsers cannot access objects directly; only the backend can.
