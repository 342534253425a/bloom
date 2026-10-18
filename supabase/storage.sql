-- Bloom: private file storage for the couple (voice messages, photos, pronunciation recordings).
-- Files live under <couple_key>/... and only the two partners can read or write them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'couple', 'couple', false, 20971520,
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

drop policy if exists "couple files: read" on storage.objects;
drop policy if exists "couple files: add" on storage.objects;
drop policy if exists "couple files: change" on storage.objects;
drop policy if exists "couple files: remove" on storage.objects;

create policy "couple files: read" on storage.objects for select to authenticated
  using (bucket_id = 'couple' and (storage.foldername(name))[1] = (select public.my_couple_key()));
create policy "couple files: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'couple' and (storage.foldername(name))[1] = (select public.my_couple_key()));
create policy "couple files: change" on storage.objects for update to authenticated
  using (bucket_id = 'couple' and (storage.foldername(name))[1] = (select public.my_couple_key()));
create policy "couple files: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'couple' and (storage.foldername(name))[1] = (select public.my_couple_key()));
