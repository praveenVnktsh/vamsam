create extension if not exists pgcrypto;

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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

create table if not exists public.preapproved_emails (
  email text primary key,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  email text primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  target_email text not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
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
alter table public.preapproved_emails enable row level security;
alter table public.access_requests enable row level security;
alter table public.invite_links enable row level security;

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

drop policy if exists "admins can read preapproved emails" on public.preapproved_emails;
create policy "admins can read preapproved emails"
on public.preapproved_emails
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

drop policy if exists "admins can manage preapproved emails" on public.preapproved_emails;
create policy "admins can manage preapproved emails"
on public.preapproved_emails
for all
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

drop policy if exists "users can read own access request" on public.access_requests;
create policy "users can read own access request"
on public.access_requests
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "admins can read access requests" on public.access_requests;
create policy "admins can read access requests"
on public.access_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

drop policy if exists "admins can update access requests" on public.access_requests;
create policy "admins can update access requests"
on public.access_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

create or replace function public.is_preapproved_email(request_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.preapproved_emails
    where lower(email) = lower(request_email)
  );
$$;

revoke all on function public.is_preapproved_email(text) from public;
grant execute on function public.is_preapproved_email(text) to anon, authenticated;

create or replace function public.submit_access_request(request_email text)
returns public.access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(request_email));
  request_row public.access_requests;
begin
  insert into public.access_requests (email, status, requested_at)
  values (normalized_email, 'pending', now())
  on conflict (email)
  do update set
    status = 'pending',
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning * into request_row;

  return request_row;
end;
$$;

revoke all on function public.submit_access_request(text) from public;
grant execute on function public.submit_access_request(text) to anon, authenticated;

create or replace function public.create_invite_link(
  request_email text,
  request_role text default 'viewer',
  request_expires_hours integer default 168
)
returns table(
  token text,
  target_email text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(request_email));
  generated_token text := encode(gen_random_bytes(24), 'hex');
  generated_hash text := encode(digest(generated_token, 'sha256'), 'hex');
  selected_tree_id uuid;
begin
  if not exists (
    select 1
    from public.tree_members tm
    where tm.user_id = auth.uid()
      and tm.role = 'admin'
  ) then
    raise exception 'Only admins can create invite links.';
  end if;

  select tm.tree_id
  into selected_tree_id
  from public.tree_members tm
  where tm.user_id = auth.uid()
    and tm.role = 'admin'
  order by tm.created_at asc
  limit 1;

  if selected_tree_id is null then
    raise exception 'No admin tree found for this account.';
  end if;

  insert into public.invite_links (
    tree_id,
    target_email,
    role,
    token_hash,
    expires_at,
    created_by
  )
  values (
    selected_tree_id,
    normalized_email,
    request_role,
    generated_hash,
    now() + make_interval(hours => greatest(request_expires_hours, 1)),
    auth.uid()
  );

  insert into public.preapproved_emails (email, role)
  values (normalized_email, request_role)
  on conflict (email)
  do update set role = excluded.role;

  return query
  select
    generated_token,
    normalized_email,
    request_role,
    now() + make_interval(hours => greatest(request_expires_hours, 1));
end;
$$;

revoke all on function public.create_invite_link(text, text, integer) from public;
grant execute on function public.create_invite_link(text, text, integer) to authenticated;

create or replace function public.get_invite_link(token text)
returns table(
  target_email text,
  role text,
  expires_at timestamptz,
  tree_name text
)
language sql
security definer
set search_path = public
as $$
  select
    il.target_email,
    il.role,
    il.expires_at,
    t.name
  from public.invite_links il
  join public.trees t on t.id = il.tree_id
  where il.token_hash = encode(digest(token, 'sha256'), 'hex')
    and il.used_at is null
    and il.expires_at > now();
$$;

revoke all on function public.get_invite_link(text) from public;
grant execute on function public.get_invite_link(text) to anon, authenticated;

create or replace function public.redeem_invite_link(token text)
returns table(
  tree_id uuid,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.invite_links;
  auth_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into invite_row
  from public.invite_links
  where token_hash = encode(digest(token, 'sha256'), 'hex')
    and used_at is null
    and expires_at > now()
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite link is invalid or expired.';
  end if;

  if lower(invite_row.target_email) <> auth_email then
    raise exception 'This invite is for a different email address.';
  end if;

  insert into public.tree_members (tree_id, user_id, role)
  values (invite_row.tree_id, auth.uid(), invite_row.role)
  on conflict (tree_id, user_id)
  do update set role = excluded.role;

  update public.invite_links
  set used_at = now()
  where id = invite_row.id;

  update public.access_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where lower(email) = auth_email;

  return query
  select invite_row.tree_id, invite_row.role;
end;
$$;

revoke all on function public.redeem_invite_link(text) from public;
grant execute on function public.redeem_invite_link(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('person-photos', 'person-photos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated users can upload photos" on storage.objects;
drop policy if exists "public can read photos" on storage.objects;
drop policy if exists "authenticated users can read photos" on storage.objects;
drop policy if exists "authenticated users can update photos" on storage.objects;

create policy "authenticated users can upload photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'person-photos');

create policy "authenticated users can read photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'person-photos');

create policy "authenticated users can update photos"
on storage.objects
for update
to authenticated
using (bucket_id = 'person-photos')
with check (bucket_id = 'person-photos');
