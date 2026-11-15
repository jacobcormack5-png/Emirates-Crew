create table public.portal_roles (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) between 2 and 50),
  permissions text[] not null default '{}',
  created_by uuid not null references public.crew_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_roles_permissions_valid check (
    permissions <@ array[
      'View allocations',
      'Submit absence',
      'View records',
      'View documentation',
      'View vacancies',
      'Schedule flights',
      'Review absences',
      'Manage discipline'
    ]::text[]
  )
);

alter table public.crew_profiles
  add column portal_role_id bigint references public.portal_roles(id) on delete set null;

create index crew_profiles_portal_role_id_idx on public.crew_profiles(portal_role_id);

alter table public.portal_roles enable row level security;

create policy portal_roles_read on public.portal_roles
for select to authenticated
using (true);

create policy portal_roles_insert_admin on public.portal_roles
for insert to authenticated
with check (
  private.has_portal_role(array['admin']::public.portal_role[])
  and created_by = (select auth.uid())
);

create policy portal_roles_update_admin on public.portal_roles
for update to authenticated
using (private.has_portal_role(array['admin']::public.portal_role[]))
with check (private.has_portal_role(array['admin']::public.portal_role[]));

create policy portal_roles_delete_admin on public.portal_roles
for delete to authenticated
using (private.has_portal_role(array['admin']::public.portal_role[]));

grant select on public.portal_roles to authenticated;
grant insert (name, permissions, created_by), update (name, permissions), delete on public.portal_roles to authenticated;
grant usage, select on sequence public.portal_roles_id_seq to authenticated;

create function public.assign_portal_role(target_user uuid, new_role_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_portal_role(array['admin']::public.portal_role[]) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if new_role_id is not null and not exists (
    select 1 from public.portal_roles where id = new_role_id
  ) then
    raise exception 'Portal role not found' using errcode = '23503';
  end if;
  update public.crew_profiles set portal_role_id = new_role_id where id = target_user;
end;
$$;

revoke all on function public.assign_portal_role(uuid, bigint) from public, anon;
grant execute on function public.assign_portal_role(uuid, bigint) to authenticated;

insert into public.portal_roles(name, permissions, created_by)
select
  'Crew Member',
  array['View allocations','Submit absence','View records','View documentation','View vacancies']::text[],
  p.id
from public.crew_profiles p
where p.portal_role = 'admin'
order by p.created_at
limit 1
on conflict (name) do nothing;

update public.crew_profiles p
set portal_role_id = r.id
from public.portal_roles r
where r.name = 'Crew Member' and p.portal_role_id is null;
