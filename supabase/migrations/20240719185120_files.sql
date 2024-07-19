create schema private;

-- Create the 'files' bucket
insert into storage.buckets (id, name)
values ('files', 'files')
on conflict do nothing;

-- Create a policy to allow all operations on the 'files' bucket
create policy "Allow all operations on files bucket"
on storage.objects for all using (bucket_id = 'files');
