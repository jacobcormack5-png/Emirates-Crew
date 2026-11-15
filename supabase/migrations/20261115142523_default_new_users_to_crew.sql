create or replace function public.handle_new_crew_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crew_profiles(
    id,
    discord_id,
    discord_username,
    rp_name,
    rank_name,
    portal_role,
    discord_roles
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'provider_id', new.raw_user_meta_data->>'sub'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(
      new.raw_user_meta_data->'custom_claims'->>'global_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      'Crew member'
    ),
    'Crew Member',
    'crew'::public.portal_role,
    '{}'::text[]
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_crew_user() from public, anon, authenticated;
