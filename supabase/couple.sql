-- Bloom: pairing two accounts and everything they share. Run once in Supabase → SQL Editor.

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  partner_id uuid references public.profiles (id) on delete set null,
  couple_key text,
  paired_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read self and partner" on public.profiles;
drop policy if exists "profiles: create self" on public.profiles;
drop policy if exists "profiles: update self" on public.profiles;

create policy "profiles: read self and partner" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or partner_id = (select auth.uid()));
create policy "profiles: create self" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- People may only change their own name; pairing goes through the functions below.
revoke insert, update on public.profiles from authenticated;
grant insert (id, name) on public.profiles to authenticated;
grant update (name, updated_at) on public.profiles to authenticated;

create or replace function public.my_couple_key() returns text
language sql stable security definer set search_path = '' as $$
  select couple_key from public.profiles where id = auth.uid()
$$;

create or replace function public.pair_with(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
  k text;
begin
  if me is null then raise exception 'not-signed-in'; end if;
  select id into other from public.profiles where invite_code = upper(trim(code));
  if other is null then raise exception 'code-not-found'; end if;
  if other = me then raise exception 'own-code'; end if;
  if exists (
    select 1 from public.profiles
    where id in (me, other) and partner_id is not null and partner_id not in (me, other)
  ) then raise exception 'already-paired'; end if;
  k := md5(random()::text || clock_timestamp()::text) || md5(random()::text || me::text);
  update public.profiles set partner_id = other, couple_key = k, paired_at = now(), updated_at = now() where id = me;
  update public.profiles set partner_id = me, couple_key = k, paired_at = now(), updated_at = now() where id = other;
  return other;
end;
$$;

create or replace function public.unpair() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  select partner_id into other from public.profiles where id = me;
  update public.profiles set partner_id = null, couple_key = null, paired_at = null, updated_at = now()
    where id = me or (other is not null and id = other);
end;
$$;

create or replace function public.new_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
begin
  update public.profiles set invite_code = code, updated_at = now() where id = auth.uid();
  return code;
end;
$$;

revoke all on function public.pair_with(text), public.unpair(), public.new_invite_code(), public.my_couple_key() from public, anon;
grant execute on function public.pair_with(text), public.unpair(), public.new_invite_code(), public.my_couple_key() to authenticated;

-- ---------- Shared items (chat, effects, garden, pair habits, answers, watch settings…) ----------
create table if not exists public.couple_items (
  couple_key text not null,
  id text not null,
  kind text not null,
  author uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (couple_key, id)
);

create index if not exists couple_items_kind on public.couple_items (couple_key, kind, created_at);

alter table public.couple_items enable row level security;

drop policy if exists "couple: read" on public.couple_items;
drop policy if exists "couple: add" on public.couple_items;
drop policy if exists "couple: change" on public.couple_items;
drop policy if exists "couple: remove" on public.couple_items;

create policy "couple: read" on public.couple_items for select to authenticated
  using (couple_key = (select public.my_couple_key()));
create policy "couple: add" on public.couple_items for insert to authenticated
  with check (couple_key = (select public.my_couple_key()) and author = (select auth.uid()));
create policy "couple: change" on public.couple_items for update to authenticated
  using (couple_key = (select public.my_couple_key())) with check (couple_key = (select public.my_couple_key()));
create policy "couple: remove" on public.couple_items for delete to authenticated
  using (couple_key = (select public.my_couple_key()));

create or replace function public.couple_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists couple_touch on public.couple_items;
create trigger couple_touch before update on public.couple_items
for each row execute function public.couple_touch();

-- ---------- Live updates ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end;
$$;
