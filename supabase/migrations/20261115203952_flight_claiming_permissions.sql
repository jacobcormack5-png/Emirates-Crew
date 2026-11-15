alter table public.portal_roles
  drop constraint portal_roles_permissions_valid;

alter table public.portal_roles
  drop constraint portal_roles_name_check;

alter table public.portal_roles
  add constraint portal_roles_name_check check (length(trim(name)) between 1 and 100);

alter table public.portal_roles
  add constraint portal_roles_permissions_valid check (
    permissions <@ array[
      'View allocations',
      'Submit absence',
      'View records',
      'View documentation',
      'View vacancies',
      'Claim flights',
      'Schedule flights',
      'Review absences',
      'Manage discipline'
    ]::text[]
  );

create function private.has_portal_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_profiles p
    left join public.portal_roles r on r.id = p.portal_role_id
    where p.id = (select auth.uid())
      and (p.portal_role = 'admin' or required_permission = any(coalesce(r.permissions, '{}')))
  );
$$;

revoke all on function private.has_portal_permission(text) from public;
grant execute on function private.has_portal_permission(text) to authenticated;

drop policy flights_insert on public.flights;
drop policy flights_update on public.flights;
drop policy flights_delete on public.flights;

create policy flights_insert on public.flights for insert to authenticated
with check (private.has_portal_permission('Schedule flights'));
create policy flights_update on public.flights for update to authenticated
using (private.has_portal_permission('Schedule flights'))
with check (private.has_portal_permission('Schedule flights'));
create policy flights_delete on public.flights for delete to authenticated
using (private.has_portal_permission('Schedule flights'));

create table public.flight_claims (
  flight_id bigint primary key references public.flights(id) on delete cascade,
  claimed_by uuid not null references public.crew_profiles(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.flight_claims enable row level security;
create policy flight_claims_read on public.flight_claims
for select to authenticated using (true);
create policy flight_claims_create on public.flight_claims
for insert to authenticated
with check (
  claimed_by = (select auth.uid())
  and private.has_portal_permission('Claim flights')
);
create policy flight_claims_release on public.flight_claims
for delete to authenticated
using (
  claimed_by = (select auth.uid())
  or private.has_portal_permission('Schedule flights')
);

grant select, insert, delete on public.flight_claims to authenticated;

insert into public.portal_roles(name, permissions, source)
values ('Dispatcher', array['Claim flights']::text[], 'manual')
on conflict (name) do update
set permissions = array(
  select distinct permission
  from unnest(public.portal_roles.permissions || array['Claim flights']::text[]) permission
);

update public.crew_profiles p
set portal_role_id = r.id
from public.portal_roles r
where p.portal_role = 'operations'
  and p.portal_role_id is null
  and r.name = 'Dispatcher';
