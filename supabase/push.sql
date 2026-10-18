-- Bloom: Web Push (notifications when the app is closed).
-- Run once in the SQL editor after deploying the `push` Edge Function (verify JWT: off).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Devices that receive pushes, with a copy of each person's notification settings.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sub jsonb not null,
  tz text not null default 'UTC',
  lang text not null default 'en',
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push subs: own" on public.push_subscriptions;
create policy "push subs: own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reminders already delivered (by the app or by push), so nothing arrives twice.
create table if not exists public.push_sent (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;
drop policy if exists "push sent: own" on public.push_sent;
create policy "push sent: own" on public.push_sent for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Server-only settings: function URL, a shared secret for the hooks and the VAPID key pair.
create schema if not exists private;
create table if not exists private.push_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  hook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  vapid_public text,
  vapid_private text
);
insert into private.push_config (id, url)
values (1, 'https://ehvppploqbmtzvbulyic.supabase.co/functions/v1/push')
on conflict (id) do nothing;

-- Only the Edge Function (service role) can read or set the config.
create or replace function public.push_get_config()
returns table (hook_secret text, vapid_public text, vapid_private text)
language sql security definer set search_path = private, public as $$
  select hook_secret, vapid_public, vapid_private from private.push_config where id = 1;
$$;
create or replace function public.push_set_vapid(pub text, priv text)
returns void language sql security definer set search_path = private, public as $$
  update private.push_config set vapid_public = pub, vapid_private = priv where id = 1 and vapid_public is null;
$$;
revoke all on function public.push_get_config() from public, anon, authenticated;
revoke all on function public.push_set_vapid(text, text) from public, anon, authenticated;
grant execute on function public.push_get_config() to service_role;
grant execute on function public.push_set_vapid(text, text) to service_role;

-- Partner events: every change to a couple item is passed to the function with who made it.
create or replace function public.push_item_hook()
returns trigger language plpgsql security definer set search_path = private, public, extensions as $$
declare cfg private.push_config;
begin
  select * into cfg from private.push_config where id = 1;
  if cfg.url is null then return new; end if;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object('type', 'item', 'op', tg_op, 'record', to_jsonb(new), 'old', case when tg_op = 'UPDATE' then to_jsonb(old) end, 'actor', auth.uid()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bloom-hook', cfg.hook_secret)
  );
  return new;
exception when others then
  return new; -- never block saving because of notifications
end $$;

drop trigger if exists couple_items_push on public.couple_items;
create trigger couple_items_push after insert or update on public.couple_items
  for each row execute function public.push_item_hook();

-- Scheduled reminders: a tick every 5 minutes.
create or replace function public.push_tick()
returns void language plpgsql security definer set search_path = private, public, extensions as $$
declare cfg private.push_config;
begin
  select * into cfg from private.push_config where id = 1;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object('type', 'tick'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bloom-hook', cfg.hook_secret)
  );
  delete from public.push_sent where at < now() - interval '3 days';
end $$;
revoke all on function public.push_tick() from public, anon, authenticated;

select cron.unschedule('bloom-push-tick') where exists (select 1 from cron.job where jobname = 'bloom-push-tick');
select cron.schedule('bloom-push-tick', '*/5 * * * *', 'select public.push_tick()');
