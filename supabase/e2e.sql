-- Bloom: end-to-end encrypted chats. Run once in Supabase → SQL Editor.
-- The server keeps only public keys and each person's private key locked with their PIN; it can't read messages.

-- Public key (JWK) next to the profile: the partner and contacts can read it (the profile rules already allow that).
alter table public.profiles add column if not exists e2e_public jsonb;
grant update (e2e_public) on public.profiles to authenticated;

-- The private key, encrypted on the device with a key made from the PIN. Only its owner can see or change it.
create table if not exists public.e2e_backups (
  user_id uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  wrapped text not null,
  salt text not null,
  iv text not null,
  iterations integer not null,
  public jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.e2e_backups enable row level security;

drop policy if exists "e2e backup: own" on public.e2e_backups;
create policy "e2e backup: own" on public.e2e_backups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
