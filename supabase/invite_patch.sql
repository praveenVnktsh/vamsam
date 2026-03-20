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

alter table public.invite_links enable row level security;

drop policy if exists "admins can manage invite links" on public.invite_links;
create policy "admins can manage invite links"
on public.invite_links
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

create table if not exists public.preapproved_emails (
  email text primary key,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.preapproved_emails enable row level security;

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
  where il.token_hash = token
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
  where token_hash = token
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

  return query
  select invite_row.tree_id, invite_row.role;
end;
$$;

revoke all on function public.redeem_invite_link(text) from public;
grant execute on function public.redeem_invite_link(text) to authenticated;
