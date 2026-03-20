create table if not exists public.people (
  tree_id uuid not null references public.trees(id) on delete cascade,
  person_id text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  entity jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tree_id, person_id)
);

create table if not exists public.relationships (
  tree_id uuid not null references public.trees(id) on delete cascade,
  relationship_id text not null,
  src_person_id text not null,
  dst_person_id text not null,
  predicate text not null,
  edge jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tree_id, relationship_id),
  unique (tree_id, src_person_id, dst_person_id, predicate)
);

create table if not exists public.user_person_links (
  tree_id uuid not null references public.trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id),
  unique (tree_id, person_id)
);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_email text not null,
  action_type text not null,
  summary text not null,
  payload jsonb not null,
  target_person_id text,
  target_relationship_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
before update on public.people
for each row
execute function public.handle_updated_at();

drop trigger if exists relationships_set_updated_at on public.relationships;
create trigger relationships_set_updated_at
before update on public.relationships
for each row
execute function public.handle_updated_at();

alter table public.people enable row level security;
alter table public.relationships enable row level security;
alter table public.user_person_links enable row level security;
alter table public.change_requests enable row level security;

create or replace function public.is_tree_admin(p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.tree_members tm
    where tm.tree_id = p_tree_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;

create or replace function public.is_tree_editor(p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.tree_members tm
    where tm.tree_id = p_tree_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  );
$$;

create or replace function public.linked_viewer_person_id(p_tree_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select upl.person_id
  from public.user_person_links upl
  where upl.tree_id = p_tree_id
    and upl.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_person_in_editable_branch(p_tree_id uuid, p_person_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with recursive branch(person_id) as (
    select public.linked_viewer_person_id(p_tree_id)
    union
    select
      case
        when r.predicate = 'partner_of' and r.src_person_id = b.person_id then r.dst_person_id
        when r.predicate = 'partner_of' and r.dst_person_id = b.person_id then r.src_person_id
        when r.predicate in ('parent_of', 'guardian_of', 'step_parent_of') and r.src_person_id = b.person_id then r.dst_person_id
        else null
      end
    from branch b
    join public.relationships r
      on r.tree_id = p_tree_id
    where
      (
        r.predicate = 'partner_of'
        and (r.src_person_id = b.person_id or r.dst_person_id = b.person_id)
      )
      or (
        r.predicate in ('parent_of', 'guardian_of', 'step_parent_of')
        and r.src_person_id = b.person_id
      )
  )
  select exists(select 1 from branch where person_id = p_person_id and person_id is not null);
$$;

create or replace function public.can_edit_person_row(p_tree_id uuid, p_person_id text, p_owner_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_tree_admin(p_tree_id)
    or (
      public.is_tree_editor(p_tree_id)
      and public.is_person_in_editable_branch(p_tree_id, p_person_id)
      and (p_owner_user_id is null or p_owner_user_id = auth.uid())
    );
$$;

create or replace function public.ensure_tree_normalized(p_tree_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tree_graph jsonb;
  entity_row jsonb;
  edge_row jsonb;
begin
  if exists (select 1 from public.people where tree_id = p_tree_id limit 1) then
    return;
  end if;

  select graph into tree_graph
  from public.trees
  where id = p_tree_id;

  if tree_graph is null then
    return;
  end if;

  for entity_row in
    select value
    from jsonb_array_elements(coalesce(tree_graph -> 'entities', '[]'::jsonb))
  loop
    if entity_row ->> 'entityType' = 'Person' then
      insert into public.people (tree_id, person_id, owner_user_id, entity)
      values (
        p_tree_id,
        entity_row ->> 'id',
        nullif(entity_row #>> '{attrs,ownerUserId}', '')::uuid,
        entity_row
      )
      on conflict (tree_id, person_id) do update
      set owner_user_id = excluded.owner_user_id,
          entity = excluded.entity,
          updated_at = now();
    end if;
  end loop;

  for edge_row in
    select value
    from jsonb_array_elements(coalesce(tree_graph -> 'edges', '[]'::jsonb))
  loop
    insert into public.relationships (
      tree_id,
      relationship_id,
      src_person_id,
      dst_person_id,
      predicate,
      edge
    )
    values (
      p_tree_id,
      edge_row ->> 'id',
      edge_row ->> 'src',
      edge_row ->> 'dst',
      edge_row ->> 'predicate',
      edge_row
    )
    on conflict (tree_id, relationship_id) do update
    set src_person_id = excluded.src_person_id,
        dst_person_id = excluded.dst_person_id,
        predicate = excluded.predicate,
        edge = excluded.edge,
        updated_at = now();
  end loop;
end;
$$;

create or replace function public.set_tree_graph(p_tree_id uuid, p_graph jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trees
  set graph = p_graph,
      updated_at = now()
  where id = p_tree_id;
end;
$$;

drop policy if exists "members can read people" on public.people;
create policy "members can read people"
on public.people
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = people.tree_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "admins and scoped editors can manage people" on public.people;
create policy "admins and scoped editors can manage people"
on public.people
for all
to authenticated
using (public.can_edit_person_row(tree_id, person_id, owner_user_id))
with check (public.can_edit_person_row(tree_id, person_id, owner_user_id));

drop policy if exists "members can read relationships" on public.relationships;
create policy "members can read relationships"
on public.relationships
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = relationships.tree_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "admins and scoped editors can manage relationships" on public.relationships;
create policy "admins and scoped editors can manage relationships"
on public.relationships
for all
to authenticated
using (
  public.is_tree_admin(tree_id)
  or (
    public.is_tree_editor(tree_id)
    and public.is_person_in_editable_branch(tree_id, src_person_id)
    and public.is_person_in_editable_branch(tree_id, dst_person_id)
  )
)
with check (
  public.is_tree_admin(tree_id)
  or (
    public.is_tree_editor(tree_id)
    and public.is_person_in_editable_branch(tree_id, src_person_id)
    and public.is_person_in_editable_branch(tree_id, dst_person_id)
  )
);

drop policy if exists "users can read own links" on public.user_person_links;
create policy "users can read own links"
on public.user_person_links
for select
to authenticated
using (user_id = auth.uid() or public.is_tree_admin(tree_id));

drop policy if exists "users and admins can manage own links" on public.user_person_links;
create policy "users and admins can manage own links"
on public.user_person_links
for all
to authenticated
using (user_id = auth.uid() or public.is_tree_admin(tree_id))
with check (user_id = auth.uid() or public.is_tree_admin(tree_id));

drop policy if exists "members can submit change requests" on public.change_requests;
create policy "members can submit change requests"
on public.change_requests
for insert
to authenticated
with check (
  requester_user_id = auth.uid()
  and exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = change_requests.tree_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "admins can read change requests" on public.change_requests;
create policy "admins can read change requests"
on public.change_requests
for select
to authenticated
using (public.is_tree_admin(tree_id) or requester_user_id = auth.uid());

drop policy if exists "admins can review change requests" on public.change_requests;
create policy "admins can review change requests"
on public.change_requests
for update
to authenticated
using (public.is_tree_admin(tree_id))
with check (public.is_tree_admin(tree_id));
