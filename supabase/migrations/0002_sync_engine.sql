-- Junction sync engine schema (PROJ-6 + PROJ-9)
-- Run this in Supabase SQL Editor AFTER 0001_initial_schema.sql.
-- Idempotent and destructive: drops PROJ-2 scaffolding tables that no
-- code reads or writes (replaced by the engine's flat hash-keyed model).

------------------------------------------------------------
-- Drop PROJ-2 scaffolding (bookmarks/folders/conflict_log)
-- These tables were placeholder schemas before the engine was
-- architected. Nothing reads or writes to them. Cascading drops
-- remove their RLS policies, indexes and triggers.
------------------------------------------------------------
drop table if exists public.conflict_log cascade;
drop table if exists public.bookmarks cascade;
drop table if exists public.folders cascade;

------------------------------------------------------------
-- bookmarks_cloud
-- The merged state of all bookmarks across all browsers for one user.
-- One row per (user, bookmark_hash). The hash is SHA-256[:32] of
-- urlNormalized + folderPath + rootKey, computed by the engine.
------------------------------------------------------------
create table public.bookmarks_cloud (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bookmark_hash text not null,
  url text not null,
  url_normalized text not null,
  title text not null,
  folder_path text not null,
  root_key text not null check (root_key in ('toolbar', 'unfiled', 'mobile', 'menu')),
  source_browsers text[] not null default '{}',
  date_added timestamptz,
  date_modified timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, bookmark_hash)
);

alter table public.bookmarks_cloud enable row level security;

create policy "Bookmarks cloud: owner select"
  on public.bookmarks_cloud for select using (auth.uid() = user_id);

create policy "Bookmarks cloud: owner insert"
  on public.bookmarks_cloud for insert with check (auth.uid() = user_id);

create policy "Bookmarks cloud: owner update"
  on public.bookmarks_cloud for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Bookmarks cloud: owner delete"
  on public.bookmarks_cloud for delete using (auth.uid() = user_id);

create index idx_bookmarks_cloud_user_id on public.bookmarks_cloud(user_id);
create index idx_bookmarks_cloud_user_root on public.bookmarks_cloud(user_id, root_key);

------------------------------------------------------------
-- bookmark_snapshots
-- The last-known state of each browser, used as the common ancestor
-- for the next sync's 3-way diff. Exactly one row per (user, browser).
-- Replaced by upsert on every successful sync.
------------------------------------------------------------
create table public.bookmark_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  browser_id text not null check (browser_id in ('safari', 'firefox', 'zen', 'chrome', 'arc', 'brave', 'edge', 'dia')),
  snapshot_json jsonb not null,
  sync_run_id uuid not null,
  captured_at timestamptz not null default now(),
  unique (user_id, browser_id)
);

alter table public.bookmark_snapshots enable row level security;

create policy "Bookmark snapshots: owner select"
  on public.bookmark_snapshots for select using (auth.uid() = user_id);

create policy "Bookmark snapshots: owner insert"
  on public.bookmark_snapshots for insert with check (auth.uid() = user_id);

create policy "Bookmark snapshots: owner update"
  on public.bookmark_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Bookmark snapshots: owner delete"
  on public.bookmark_snapshots for delete using (auth.uid() = user_id);

create index idx_bookmark_snapshots_user on public.bookmark_snapshots(user_id);

------------------------------------------------------------
-- conflict_log (PROJ-9 schema)
-- One row per real conflict. Inserted by the sync engine when two
-- browsers independently modified the same bookmark since the last
-- sync. Status drives the UI filter (open / restored / dismissed).
------------------------------------------------------------
create table public.conflict_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bookmark_hash text not null,
  winner_version jsonb not null,
  loser_version jsonb not null,
  winner_browser_id text not null,
  loser_browser_id text not null,
  sync_run_id uuid not null,
  status text not null default 'open' check (status in ('open', 'restored', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  restore_origin_id uuid references public.conflict_log(id) on delete set null
);

alter table public.conflict_log enable row level security;

create policy "Conflict log: owner select"
  on public.conflict_log for select using (auth.uid() = user_id);

create policy "Conflict log: owner insert"
  on public.conflict_log for insert with check (auth.uid() = user_id);

-- Updates only allowed for status transitions (open -> restored/dismissed).
create policy "Conflict log: owner update status"
  on public.conflict_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Conflict log: owner delete"
  on public.conflict_log for delete using (auth.uid() = user_id);

create index idx_conflict_log_user_status_created
  on public.conflict_log(user_id, status, created_at desc);
create index idx_conflict_log_user_winner
  on public.conflict_log(user_id, winner_browser_id);
create index idx_conflict_log_user_loser
  on public.conflict_log(user_id, loser_browser_id);
create index idx_conflict_log_user_hash
  on public.conflict_log(user_id, bookmark_hash);

------------------------------------------------------------
-- schema_version bump
------------------------------------------------------------
insert into public.schema_version (version) values (2)
on conflict (version) do nothing;
