create or replace function hybrid_search(
  query_text text,
  query_embedding vector(384),
  match_count int,
  full_text_weight float = 1,
  semantic_weight float = 1,
  rrf_k int = 50
)
returns setof document_sections
language sql
as $$
with full_text as (
  select
    id,
    document_id,
    row_number() over(order by ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery(query_text)) desc) as rank_ix
  from
    document_sections
  where
    to_tsvector('english', content) @@ websearch_to_tsquery(query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select
    id,
    document_id,
    row_number() over (order by embedding <#> query_embedding) as rank_ix
  from
    document_sections
  order by rank_ix
  limit least(match_count, 30) * 2
)
select
  document_sections.*
from
  full_text
  full outer join semantic
    on full_text.id = semantic.id
  join document_sections
    on coalesce(full_text.id, semantic.id) = document_sections.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30)
$$;