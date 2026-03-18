create extension if not exists pgcrypto;

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  graph jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tree_members (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (tree_id, user_id)
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trees_set_updated_at on public.trees;
create trigger trees_set_updated_at
before update on public.trees
for each row
execute function public.handle_updated_at();

alter table public.trees enable row level security;
alter table public.tree_members enable row level security;

create policy "trees are readable by members"
on public.trees
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = trees.id
      and tm.user_id = auth.uid()
  )
);

create policy "admins and editors can update trees"
on public.trees
for update
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = trees.id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = trees.id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

create policy "authenticated users can create trees"
on public.trees
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "members can read memberships" on public.tree_members;
drop policy if exists "admins can manage memberships" on public.tree_members;

create policy "users can read their own memberships"
on public.tree_members
for select
to authenticated
using (user_id = auth.uid());

create policy "users can create their own memberships"
on public.tree_members
for insert
to authenticated
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('person-photos', 'person-photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload photos" on storage.objects;
drop policy if exists "public can read photos" on storage.objects;
drop policy if exists "authenticated users can update photos" on storage.objects;

create policy "authenticated users can upload photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'person-photos');

create policy "public can read photos"
on storage.objects
for select
to public
using (bucket_id = 'person-photos');

create policy "authenticated users can update photos"
on storage.objects
for update
to authenticated
using (bucket_id = 'person-photos')
with check (bucket_id = 'person-photos');
