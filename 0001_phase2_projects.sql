-- JH AI Creator: Phase 2 schema (NOT APPLIED. Review before running.)
-- Review against any existing schema first. Never run on production without approval.
-- Idempotent where practical.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) <= 200),
  aspect text not null default '16:9' check (aspect in ('16:9','9:16','1:1')),
  fps int not null default 30 check (fps in (24,30,60)),
  data jsonb not null default '{}'::jsonb,   -- editor snapshot (see src/features/editor/types.ts)
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text not null,               -- private bucket path: <user_id>/<project_id>/<file>
  file_type text not null check (file_type in ('video','image','audio')),
  file_size bigint not null check (file_size >= 0),
  declaration text not null default 'unverified'
    check (declaration in ('own','ai','licensed','public_domain','third_party','unverified')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.timeline_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('video','audio','text')),
  position int not null default 0,
  muted boolean not null default false
);

create table if not exists public.timeline_clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  track_id uuid not null references public.timeline_tracks(id) on delete cascade,
  asset_id uuid references public.project_assets(id) on delete set null,
  start_sec numeric not null check (start_sec >= 0),
  in_sec numeric not null check (in_sec >= 0),
  out_sec numeric not null check (out_sec > in_sec),
  effects jsonb not null default '{}'::jsonb,
  text_content text
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_assets_project on public.project_assets(project_id);
create index if not exists idx_tracks_project on public.timeline_tracks(project_id);
create index if not exists idx_clips_project on public.timeline_clips(project_id);

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

-- Row Level Security: users only touch their own rows; child rows must also
-- belong to a project the user owns.
do $$
declare t text; cond text;
begin
  foreach t in array array['projects','project_assets','timeline_tracks','timeline_clips'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    if t = 'projects' then
      cond := 'user_id = (select auth.uid())';
    else
      cond := format(
        'user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = %I.project_id and p.user_id = (select auth.uid()))', t);
    end if;
    execute format('create policy owner_all on public.%I for all to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;
end $$;

-- Private storage bucket. Files live under <user_id>/..., accessed via signed URLs only.
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', false)
on conflict (id) do nothing;

drop policy if exists media_owner_all on storage.objects;
create policy media_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
