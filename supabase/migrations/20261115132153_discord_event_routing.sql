alter table public.bot_outbox drop constraint if exists bot_outbox_event_type_check;
alter table public.bot_outbox add constraint bot_outbox_event_type_check check (event_type in (
  'discipline.issued', 'discipline.removed',
  'loa.submitted', 'loa.approved', 'loa.denied',
  'allocation.bid', 'allocation.withdrawn',
  'flight.scheduled', 'flight.deleted'
));

create or replace function public.queue_portal_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_name text;
  event_payload jsonb;
  row_id bigint;
  record_data jsonb;
begin
  record_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := (record_data->>'id')::bigint;
  if tg_table_name = 'disciplinary_actions' then
    event_name := case when tg_op = 'DELETE' then 'discipline.removed' else 'discipline.issued' end;
    select jsonb_build_object(
      'record_id', row_id, 'type', record_data->>'action_type', 'reason', record_data->>'reason',
      'target_discord_id', target.discord_id, 'target_name', target.rp_name,
      'moderator_discord_id', issuer.discord_id, 'moderator_name', issuer.rp_name
    ) into event_payload
    from public.crew_profiles target, public.crew_profiles issuer
    where target.id = (record_data->>'user_id')::uuid
      and issuer.id = (record_data->>'issued_by')::uuid;
  elsif tg_table_name = 'loa_requests' then
    event_name := case when tg_op = 'INSERT' then 'loa.submitted' when new.status = 'approved' then 'loa.approved' else 'loa.denied' end;
    select jsonb_build_object(
      'request_id', new.id, 'status', new.status, 'starts_on', new.starts_on,
      'ends_on', new.ends_on, 'reason', new.reason, 'review_note', new.review_note,
      'target_discord_id', p.discord_id, 'target_name', p.rp_name
    ) into event_payload from public.crew_profiles p where p.id = new.user_id;
  elsif tg_table_name = 'flight_allocations' then
    event_name := case when tg_op = 'DELETE' then 'allocation.withdrawn' else 'allocation.bid' end;
    select jsonb_build_object(
      'allocation_id', row_id, 'target_discord_id', p.discord_id, 'target_name', p.rp_name,
      'role', record_data->>'duty_role', 'flight_id', f.id, 'flight_code', f.code,
      'departure_at', f.departure_at
    ) into event_payload
    from public.crew_profiles p, public.flights f
    where p.id = (record_data->>'user_id')::uuid
      and f.id = (record_data->>'flight_id')::bigint;
  else
    event_name := case when tg_op = 'DELETE' then 'flight.deleted' else 'flight.scheduled' end;
    select jsonb_build_object(
      'flight_id', row_id, 'flight_code', record_data->>'code', 'origin', record_data->>'origin',
      'destination', record_data->>'destination', 'departure_at', record_data->>'departure_at',
      'created_by_discord_id', p.discord_id, 'created_by_name', p.rp_name,
      'allocations_channel_id', '1551715442974916749'
    ) into event_payload
    from (values (1)) as seed(value)
    left join public.crew_profiles p on p.id = nullif(record_data->>'created_by', '')::uuid;
  end if;

  insert into public.bot_outbox(event_type, aggregate_id, payload)
  values(event_name, row_id, coalesce(event_payload, '{}'::jsonb));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists discipline_removed_bot_event on public.disciplinary_actions;
create trigger discipline_removed_bot_event after delete on public.disciplinary_actions
for each row execute function public.queue_portal_event();

drop trigger if exists allocation_bid_bot_event on public.flight_allocations;
create trigger allocation_bid_bot_event after insert on public.flight_allocations
for each row execute function public.queue_portal_event();

drop trigger if exists allocation_withdrawn_bot_event on public.flight_allocations;
create trigger allocation_withdrawn_bot_event after delete on public.flight_allocations
for each row execute function public.queue_portal_event();

drop trigger if exists flight_scheduled_bot_event on public.flights;
create trigger flight_scheduled_bot_event after insert on public.flights
for each row execute function public.queue_portal_event();

drop trigger if exists flight_deleted_bot_event on public.flights;
create trigger flight_deleted_bot_event after delete on public.flights
for each row execute function public.queue_portal_event();
