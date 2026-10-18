-- Bloom: one table holds every synced row. Run this once in Supabase → SQL Editor.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;

create policy "records: read own" on public.records for select to authenticated using ((select auth.uid()) = user_id);
create policy "records: insert own" on public.records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "records: update own" on public.records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "records: delete own" on public.records for delete to authenticated using ((select auth.uid()) = user_id);

-- The server clock decides the order of changes, so devices with wrong clocks still sync correctly.
create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

-- Lets a signed-in person delete their own account (and, by cascade, all their rows).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
