do $$
declare
  tree_row record;
begin
  for tree_row in
    select id
    from public.trees
  loop
    perform public.ensure_tree_normalized(tree_row.id);
  end loop;
end
$$;

create or replace function public.ensure_tree_normalized(p_tree_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

drop function if exists public.set_tree_graph(uuid, jsonb);

alter table public.trees
drop column if exists graph;
