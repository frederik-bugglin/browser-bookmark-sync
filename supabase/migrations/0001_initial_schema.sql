-- Junction initial schema
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run)
-- Idempotent: safe to re-run, drops are wrapped in IF EXISTS where it matters.

------------------------------------------------------------
-- Extensions
------------------------------------------------------------
create extension if not exists "uuid-ossp";

------------------------------------------------------------
-- schema_version (single-row table for migration safety)
------------------------------------------------------------
create table if not exists public.schema_version (
  version int primary key
);

insert into public.schema_version (version)
values (1)
on conflict (version) do nothing;

alter table public.schema_version enable row level security;

create policy "Anyone authenticated can read schema_version"
  on public.schema_version for select
  to authenticated
  using (true);

------------------------------------------------------------
-- folders
------------------------------------------------------------
create table if not exists public.folders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  path_normalized text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folders enable row level security;

create policy "Folders: owner select"
  on public.folders for select using (auth.uid() = user_id);

create policy "Folders: owner insert"
  on public.folders for insert with check (auth.uid() = user_id);

create policy "Folders: owner update"
  on public.folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Folders: owner delete"
  on public.folders for delete using (auth.uid() = user_id);

create index if not exists idx_folders_user_id on public.folders(user_id);
create index if not exists idx_folders_parent_id on public.folders(parent_id);
create unique index if not exists ux_folders_user_path on public.folders(user_id, path_normalized);

------------------------------------------------------------
-- bookmarks
------------------------------------------------------------
create table if not exists public.bookmarks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  url_normalized text not null,
  title text not null,
  folder_id uuid references public.folders(id) on delete set null,
  source_browser text,
  last_synced_by_device uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookmarks enable row level security;

create policy "Bookmarks: owner select"
  on public.bookmarks for select using (auth.uid() = user_id);

create policy "Bookmarks: owner insert"
  on public.bookmarks for insert with check (auth.uid() = user_id);

create policy "Bookmarks: owner update"
  on public.bookmarks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Bookmarks: owner delete"
  on public.bookmarks for delete using (auth.uid() = user_id);

create index if not exists idx_bookmarks_user_id on public.bookmarks(user_id);
create index if not exists idx_bookmarks_url_normalized on public.bookmarks(url_normalized);
create index if not exists idx_bookmarks_folder_id on public.bookmarks(folder_id);
create unique index if not exists ux_bookmarks_user_url_folder
  on public.bookmarks(user_id, url_normalized, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid));

------------------------------------------------------------
-- devices
------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;

create policy "Devices: owner select"
  on public.devices for select using (auth.uid() = user_id);

create policy "Devices: owner insert"
  on public.devices for insert with check (auth.uid() = user_id);

create policy "Devices: owner update"
  on public.devices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Devices: owner delete"
  on public.devices for delete using (auth.uid() = user_id);

create index if not exists idx_devices_user_id on public.devices(user_id);

------------------------------------------------------------
-- conflict_log
------------------------------------------------------------
create table if not exists public.conflict_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bookmark_id uuid references public.bookmarks(id) on delete set null,
  browser_a text not null,
  browser_b text not null,
  version_a jsonb not null,
  version_b jsonb not null,
  winner text not null check (winner in ('a', 'b')),
  resolved_at timestamptz not null default now()
);

alter table public.conflict_log enable row level security;

create policy "Conflict log: owner select"
  on public.conflict_log for select using (auth.uid() = user_id);

create policy "Conflict log: owner insert"
  on public.conflict_log for insert with check (auth.uid() = user_id);

create policy "Conflict log: owner delete"
  on public.conflict_log for delete using (auth.uid() = user_id);

-- No update policy: conflict log entries are immutable once written.

create index if not exists idx_conflict_log_user_id on public.conflict_log(user_id);
create index if not exists idx_conflict_log_resolved_at on public.conflict_log(resolved_at desc);

------------------------------------------------------------
-- updated_at triggers
------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_folders_updated_at on public.folders;
create trigger trg_folders_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_bookmarks_updated_at on public.bookmarks;
create trigger trg_bookmarks_updated_at
  before update on public.bookmarks
  for each row execute function public.set_updated_at();
