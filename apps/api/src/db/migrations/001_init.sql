-- Layers that never overwrite: what the model said, what the validators said and what the
-- reviewer did are separate rows. The final invoice is derived from them, never stored over them.

create table documents (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  media_type  text not null,
  sha256      text not null,
  size_bytes  integer not null,
  storage_key text not null,
  created_at  timestamptz not null default now()
);

create table extractions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documents (id),
  model          text not null,
  prompt_version text not null,
  -- The provider response exactly as received.
  raw            jsonb,
  -- The model's structured output, and the same after normalization (cents, compact IBAN).
  output         jsonb,
  invoice        jsonb,
  notices        jsonb not null default '[]',
  error          text,
  stop_reason    text,
  input_tokens   integer not null,
  output_tokens  integer not null,
  latency_ms     integer not null,
  created_at     timestamptz not null default now()
);

create table validation_results (
  id            uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references extractions (id),
  findings      jsonb not null,
  created_at    timestamptz not null default now()
);

create table review_events (
  id            bigint generated always as identity primary key,
  document_id   uuid not null references documents (id),
  extraction_id uuid not null references extractions (id),
  type          text not null check (type in ('edit', 'approve', 'reject')),
  field         text,
  old_value     jsonb,
  new_value     jsonb,
  note          text,
  reviewer      text not null,
  created_at    timestamptz not null default now(),
  check ((type = 'edit') = (field is not null)),
  check (type <> 'reject' or note is not null)
);

create index review_events_document on review_events (document_id, id);
create index extractions_document on extractions (document_id, created_at);

create table vendors (
  id     text primary key,
  name   text not null,
  tax_id text,
  iban   text
);

-- Enforced by the database, not by convention: no code path can rewrite history.
create function refuse_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % refused', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger extractions_append_only before update or delete on extractions
  for each row execute function refuse_change();
create trigger extractions_no_truncate before truncate on extractions
  for each statement execute function refuse_change();
create trigger validation_results_append_only before update or delete on validation_results
  for each row execute function refuse_change();
create trigger validation_results_no_truncate before truncate on validation_results
  for each statement execute function refuse_change();
create trigger review_events_append_only before update or delete on review_events
  for each row execute function refuse_change();
create trigger review_events_no_truncate before truncate on review_events
  for each statement execute function refuse_change();
