create type public.portal_role as enum ('crew', 'operations', 'discipline', 'admin');
create type public.discipline_type as enum ('warning', 'infraction', 'suspension', 'termination');
create type public.loa_status as enum ('pending', 'approved', 'denied', 'withdrawn');
create type public.bot_event_status as enum ('pending', 'processing', 'processed', 'failed');

create table public.crew_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text unique,
  discord_username text,
  rp_name text not null default 'Crew member',
  rank_name text not null default 'Crew Member',
  portal_role public.portal_role not null default 'crew',
  discord_roles text[] not null default '{}',
  total_pay integer not null default 0 check (total_pay >= 0),
  monthly_quota integer not null default 4 check (monthly_quota >= 0),
  completed_flights integer not null default 0 check (completed_flights >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flights (
  id bigint generated always as identity primary key,
  code text not null,
  origin text not null,
  destination text not null,
  departure_at timestamptz not null,
  aircraft text not null,
  status text not null default 'scheduled' check (status in ('scheduled','boarding','completed','cancelled')),
  created_by uuid references public.crew_profiles(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.flight_allocations (
  id bigint generated always as identity primary key,
  flight_id bigint not null references public.flights(id) on delete cascade,
  user_id uuid not null references public.crew_profiles(id) on delete cascade,
  duty_group text not null check (duty_group in ('Supervisory Duties','Departmental Duties')),
  duty_role text not null,
  slot_number smallint not null check (slot_number > 0),
  attended boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (flight_id, user_id),
  unique (flight_id, duty_role, slot_number)
);

create table public.disciplinary_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.crew_profiles(id) on delete cascade,
  action_type public.discipline_type not null,
  reason text not null check (length(trim(reason)) > 0),
  issued_by uuid not null references public.crew_profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.loa_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.crew_profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text not null check (length(trim(reason)) > 0),
  status public.loa_status not null default 'pending',
  reviewed_by uuid references public.crew_profiles(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.bot_outbox (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('discipline.issued','loa.submitted','loa.approved','loa.denied')),
  aggregate_id bigint not null,
  payload jsonb not null,
  status public.bot_event_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index flights_departure_idx on public.flights(departure_at) where status in ('scheduled','boarding');
create index allocations_user_idx on public.flight_allocations(user_id, flight_id);
create index discipline_user_idx on public.disciplinary_actions(user_id, created_at desc);
create index loa_user_idx on public.loa_requests(user_id, created_at desc);
create index bot_outbox_pending_idx on public.bot_outbox(created_at) where status = 'pending';

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.has_portal_role(required_roles public.portal_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.crew_profiles p where p.id = (select auth.uid()) and p.portal_role = any(required_roles));
$$;
revoke all on function private.has_portal_role(public.portal_role[]) from public;
grant execute on function private.has_portal_role(public.portal_role[]) to authenticated;

create function public.handle_new_crew_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crew_profiles(id, discord_id, discord_username, rp_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'provider_id', new.raw_user_meta_data->>'sub'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Crew member')
  ) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_crew_user();

create function public.queue_portal_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_name text; event_payload jsonb;
begin
  if tg_table_name = 'disciplinary_actions' then
    event_name := 'discipline.issued';
    select jsonb_build_object('record_id', new.id, 'type', new.action_type, 'reason', new.reason,
      'target_discord_id', target.discord_id, 'target_name', target.rp_name,
      'moderator_discord_id', issuer.discord_id, 'moderator_name', issuer.rp_name)
    into event_payload from public.crew_profiles target, public.crew_profiles issuer
    where target.id = new.user_id and issuer.id = new.issued_by;
  else
    event_name := case when tg_op = 'INSERT' then 'loa.submitted' when new.status = 'approved' then 'loa.approved' else 'loa.denied' end;
    select jsonb_build_object('request_id', new.id, 'status', new.status, 'starts_on', new.starts_on,
      'ends_on', new.ends_on, 'reason', new.reason, 'review_note', new.review_note,
      'target_discord_id', p.discord_id, 'target_name', p.rp_name)
    into event_payload from public.crew_profiles p where p.id = new.user_id;
  end if;
  insert into public.bot_outbox(event_type, aggregate_id, payload) values(event_name, new.id, event_payload);
  return new;
end;
$$;
create trigger discipline_bot_event after insert on public.disciplinary_actions for each row execute function public.queue_portal_event();
create trigger loa_submitted_bot_event after insert on public.loa_requests for each row execute function public.queue_portal_event();
create trigger loa_reviewed_bot_event after update of status on public.loa_requests for each row
  when (old.status = 'pending' and new.status in ('approved','denied')) execute function public.queue_portal_event();

revoke all on function public.handle_new_crew_user() from public, anon, authenticated;
revoke all on function public.queue_portal_event() from public, anon, authenticated;

alter table public.crew_profiles enable row level security;
alter table public.flights enable row level security;
alter table public.flight_allocations enable row level security;
alter table public.disciplinary_actions enable row level security;
alter table public.loa_requests enable row level security;
alter table public.bot_outbox enable row level security;

create policy profiles_read_self_or_staff on public.crew_profiles for select to authenticated
using ((select auth.uid()) = id or private.has_portal_role(array['operations','discipline','admin']::public.portal_role[]));
create policy profiles_update_self_or_admin on public.crew_profiles for update to authenticated
using ((select auth.uid()) = id or private.has_portal_role(array['admin']::public.portal_role[]))
with check ((select auth.uid()) = id or private.has_portal_role(array['admin']::public.portal_role[]));
revoke update on public.crew_profiles from authenticated;
grant update (rp_name) on public.crew_profiles to authenticated;
create policy flights_read on public.flights for select to authenticated using (true);
create policy flights_insert on public.flights for insert to authenticated
with check (private.has_portal_role(array['operations','admin']::public.portal_role[]));
create policy flights_update on public.flights for update to authenticated
using (private.has_portal_role(array['operations','admin']::public.portal_role[]))
with check (private.has_portal_role(array['operations','admin']::public.portal_role[]));
create policy flights_delete on public.flights for delete to authenticated
using (private.has_portal_role(array['operations','admin']::public.portal_role[]));
create policy allocations_read on public.flight_allocations for select to authenticated using (true);
create policy allocations_join on public.flight_allocations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy allocations_leave on public.flight_allocations for delete to authenticated using ((select auth.uid()) = user_id or private.has_portal_role(array['operations','admin']::public.portal_role[]));
create policy discipline_read on public.disciplinary_actions for select to authenticated
using ((select auth.uid()) = user_id or private.has_portal_role(array['discipline','admin']::public.portal_role[]));
create policy discipline_insert on public.disciplinary_actions for insert to authenticated
with check (private.has_portal_role(array['discipline','admin']::public.portal_role[]));
create policy discipline_update on public.disciplinary_actions for update to authenticated
using (private.has_portal_role(array['discipline','admin']::public.portal_role[]))
with check (private.has_portal_role(array['discipline','admin']::public.portal_role[]));
create policy discipline_delete on public.disciplinary_actions for delete to authenticated
using (private.has_portal_role(array['discipline','admin']::public.portal_role[]));
create policy loa_read on public.loa_requests for select to authenticated
using ((select auth.uid()) = user_id or private.has_portal_role(array['operations','admin']::public.portal_role[]));
create policy loa_submit on public.loa_requests for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');
create policy loa_withdraw on public.loa_requests for update to authenticated
using (((select auth.uid()) = user_id and status = 'pending') or private.has_portal_role(array['operations','admin']::public.portal_role[]))
with check (((select auth.uid()) = user_id and status = 'withdrawn') or private.has_portal_role(array['operations','admin']::public.portal_role[]));

revoke all on public.bot_outbox from anon, authenticated;
