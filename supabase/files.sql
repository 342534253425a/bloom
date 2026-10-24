-- Bloom: any kind of file in chats (documents, archives, folders sent as .zip). Run once in Supabase → SQL Editor.
-- The size limit stays 50 MB per file; access rules are unchanged (only the people of a chat can read its files).
update storage.buckets set allowed_mime_types = null, file_size_limit = 52428800 where id = 'couple';
