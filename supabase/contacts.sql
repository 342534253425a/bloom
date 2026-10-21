-- Bloom: people besides the partner (friends and family), each with a private chat. Run once in Supabase → SQL Editor.
-- The partner stays special (profiles.partner_id, couple_items); everyone else lives here.

-- ---------- Contacts ----------
-- One row per side: "owner has other as a friend / family". Each side chooses the kind on its own:
-- "family" is what opens the rest of Bloom to that person, "friend" is chat and calls.
create table if not exists public.contacts (
  owner uuid not null references public.profiles (id) on delete cascade,
  other uuid not null references public.profiles (id) on delete cascade,
  chat_key text not null,
  kind text not null default 'friend' check (kind in ('friend', 'family')),
  created_at timestamptz not null default now(),
  primary key (owner, other)
);

create index if not exists contacts_chat_key on public.contacts (chat_key);

alter table public.contacts enable row level security;

drop policy if exists "contacts: read own" on public.contacts;
create policy "contacts: read own" on public.contacts for select to authenticated
  using (owner = (select auth.uid()));

-- Adding, removing and changing the kind go through the functions below.
revoke insert, update, delete on public.contacts from authenticated;

-- Contacts may see each other's name (like the partner).
drop policy if exists "profiles: read self and partner" on public.profiles;
drop policy if exists "profiles: read self, partner and contacts" on public.profiles;
create policy "profiles: read self, partner and contacts" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or partner_id = (select auth.uid())
    or exists (select 1 from public.contacts c where c.owner = (select auth.uid()) and c.other = profiles.id)
  );

create or replace function public.my_chat_keys() returns setof text
language sql stable security definer set search_path = '' as $$
  select chat_key from public.contacts where owner = auth.uid()
$$;

/** Adds the person whose invite code this is (the same code as for pairing). Both see each other at once. */
create or replace function public.add_contact(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
  k text;
begin
  if me is null then raise exception 'not-signed-in'; end if;
  select id into them from public.profiles where invite_code = upper(trim(code));
  if them is null then raise exception 'code-not-found'; end if;
  if them = me then raise exception 'own-code'; end if;
  if exists (select 1 from public.profiles where id = me and partner_id = them) then raise exception 'is-partner'; end if;
  if exists (select 1 from public.contacts where owner = me and contacts.other = them) then return them; end if;
  select chat_key into k from public.contacts where owner = them and contacts.other = me;
  k := coalesce(k, md5(random()::text || clock_timestamp()::text) || md5(random()::text || me::text));
  insert into public.contacts (owner, other, chat_key) values (me, them, k) on conflict do nothing;
  insert into public.contacts (owner, other, chat_key) values (them, me, k) on conflict do nothing;
  return them;
end;
$$;

create or replace function public.remove_contact(person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.contacts where (owner = auth.uid() and other = person) or (owner = person and other = auth.uid());
end;
$$;

create or replace function public.set_contact_kind(person uuid, new_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if new_kind not in ('friend', 'family') then raise exception 'bad-kind'; end if;
  update public.contacts set kind = new_kind where owner = auth.uid() and other = person;
end;
$$;

revoke all on function public.my_chat_keys(), public.add_contact(text), public.remove_contact(uuid), public.set_contact_kind(uuid, text) from public, anon;
grant execute on function public.my_chat_keys(), public.add_contact(text), public.remove_contact(uuid), public.set_contact_kind(uuid, text) to authenticated;

-- ---------- Chat items with a contact (messages, reactions, read marks, calls) ----------
create table if not exists public.chat_items (
  chat_key text not null,
  id text not null,
  kind text not null,
  author uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (chat_key, id)
);

create index if not exists chat_items_kind on public.chat_items (chat_key, kind, created_at);

alter table public.chat_items enable row level security;

drop policy if exists "chat: read" on public.chat_items;
drop policy if exists "chat: add" on public.chat_items;
drop policy if exists "chat: change" on public.chat_items;
drop policy if exists "chat: remove" on public.chat_items;

create policy "chat: read" on public.chat_items for select to authenticated
  using (chat_key in (select public.my_chat_keys()));
create policy "chat: add" on public.chat_items for insert to authenticated
  with check (chat_key in (select public.my_chat_keys()) and author = (select auth.uid()));
create policy "chat: change" on public.chat_items for update to authenticated
  using (chat_key in (select public.my_chat_keys())) with check (chat_key in (select public.my_chat_keys()));
create policy "chat: remove" on public.chat_items for delete to authenticated
  using (chat_key in (select public.my_chat_keys()));

drop trigger if exists chat_touch on public.chat_items;
create trigger chat_touch before update on public.chat_items
for each row execute function public.couple_touch();

-- ---------- Files: photos, videos and voice in contact chats live under <chat_key>/... ----------
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
where id = 'couple';

drop policy if exists "couple files: read" on storage.objects;
drop policy if exists "couple files: add" on storage.objects;
drop policy if exists "couple files: change" on storage.objects;
drop policy if exists "couple files: remove" on storage.objects;

create policy "couple files: read" on storage.objects for select to authenticated
  using (bucket_id = 'couple' and ((storage.foldername(name))[1] = (select public.my_couple_key()) or (storage.foldername(name))[1] in (select public.my_chat_keys())));
create policy "couple files: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'couple' and ((storage.foldername(name))[1] = (select public.my_couple_key()) or (storage.foldername(name))[1] in (select public.my_chat_keys())));
create policy "couple files: change" on storage.objects for update to authenticated
  using (bucket_id = 'couple' and ((storage.foldername(name))[1] = (select public.my_couple_key()) or (storage.foldername(name))[1] in (select public.my_chat_keys())));
create policy "couple files: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'couple' and ((storage.foldername(name))[1] = (select public.my_couple_key()) or (storage.foldername(name))[1] in (select public.my_chat_keys())));

-- ---------- Live updates ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.contacts;
  exception when duplicate_object then null;
  end;
end;
$$;

-- ---------- Pushes for friends and family (messages and calls while Bloom is closed) ----------
create or replace function public.push_chat_hook()
returns trigger language plpgsql security definer set search_path = private, public, extensions as $$
declare cfg private.push_config;
begin
  select * into cfg from private.push_config where id = 1;
  if cfg.url is null then return new; end if;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object('type', 'chat', 'op', tg_op, 'record', to_jsonb(new), 'actor', auth.uid()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bloom-hook', cfg.hook_secret)
  );
  return new;
exception when others then
  return new; -- never block saving because of notifications
end $$;

drop trigger if exists chat_items_push on public.chat_items;
create trigger chat_items_push after insert on public.chat_items
  for each row execute function public.push_chat_hook();
