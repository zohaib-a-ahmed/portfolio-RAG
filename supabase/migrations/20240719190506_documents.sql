create extension if not exists pg_net with schema extensions;
create extension if not exists vector with schema extensions;

create table documents (
  id bigint primary key generated always as identity,
  name text not null,
  storage_object_id uuid not null references storage.objects (id),
  created_at timestamp with time zone not null default now()
);

create view documents_with_storage_path
with (security_invoker=true)
as
  select documents.*, storage.objects.name as storage_object_path
  from documents
  join storage.objects
    on storage.objects.id = documents.storage_object_id;

create table document_sections (
  id bigint primary key generated always as identity,
  document_id bigint not null references documents (id),
  content text not null,
  embedding vector (384)
);

alter table document_sections
drop constraint document_sections_document_id_fkey,
add constraint document_sections_document_id_fkey
  foreign key (document_id)
  references documents(id)
  on delete cascade;

create index on document_sections using hnsw (embedding vector_ip_ops);
