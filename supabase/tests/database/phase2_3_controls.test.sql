begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- ----------------------------------------------------------------------------
-- Test Fixtures Setup
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'user-a@example.test', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'user-b@example.test', '{}'::jsonb);

insert into public.profiles (id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'User A'),
  ('20000000-0000-4000-8000-000000000002', 'User B');

insert into public.projects (id, owner_id, title, active_pdb_id, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Project A', '1CRN', '2026-01-01 00:00:00+00'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Project B', '4HHB', '2026-01-01 00:00:00+00');

insert into public.conversations (id, project_id, title, updated_at)
values
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Conversation A', '2026-01-01 00:00:00+00'),
  ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Conversation B', '2026-01-01 00:00:00+00');

insert into public.structure_metadata (pdb_id, title, hit_count, cached_at, expires_at)
values
  ('1CRN', 'Crambin', 0, now(), now() + interval '7 days');

-- ----------------------------------------------------------------------------
-- 1 & 2: Message Length Limit (8,000 chars allowed, 8,001 rejected)
-- ----------------------------------------------------------------------------
select lives_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'user', repeat('x', 8000))$$,
  'messages table accepts a message with exactly 8,000 characters'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'user', repeat('x', 8001))$$,
  '23514',
  'new row for relation "messages" violates check constraint "messages_content_check"',
  'messages table rejects content exceeding 8,000 characters'
);

-- ----------------------------------------------------------------------------
-- 3, 4, 5 & 6: Recency Triggers (conversations & projects updated_at)
-- ----------------------------------------------------------------------------
select ok(
  (select updated_at > '2026-01-01 00:00:00+00' from public.conversations where id = 'aa000000-0000-4000-8000-000000000001'),
  'inserting a message updates parent conversation updated_at'
);

select ok(
  (select updated_at > '2026-01-01 00:00:00+00' from public.projects where id = 'a0000000-0000-4000-8000-000000000001'),
  'inserting a message updates parent project updated_at'
);

select lives_ok(
  $$insert into public.project_events (
      project_id, activity_id, command, origin, status, evidence, input
    ) values (
      'b0000000-0000-4000-8000-000000000002', 'act-b-recency', 'load_structure', 'human', 'success', 'observed', '{"pdbId":"4HHB"}'::jsonb
    )$$,
  'project event inserted successfully'
);

select ok(
  (select updated_at > '2026-01-01 00:00:00+00' from public.projects where id = 'b0000000-0000-4000-8000-000000000002'),
  'inserting a project event updates parent project updated_at'
);

-- ----------------------------------------------------------------------------
-- 7 & 8: claim_assistant_request normal claim & reservation
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select results_eq(
  $$select allowed, status, reserved_cost_usd
    from public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'req-test-1',
      'aa000000-0000-4000-8000-000000000001',
      'test-model'
    )$$,
  $$values (true, 'running', 0.050000::numeric(10,6))$$,
  'claim_assistant_request succeeds with running status and 0.05 USD reservation'
);

select ok(
  exists (
    select 1 from public.ai_requests
    where user_id = '10000000-0000-4000-8000-000000000001'
      and request_id = 'req-test-1'
      and status = 'running'
      and expires_at > clock_timestamp()
  ),
  'ai_requests stores expiration timestamp for running request'
);

-- ----------------------------------------------------------------------------
-- 9: Idempotency conflict for concurrent running request
-- ----------------------------------------------------------------------------
select results_eq(
  $$select allowed, status, error_code
    from public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'req-test-1',
      'aa000000-0000-4000-8000-000000000001',
      'test-model'
    )$$,
  $$values (false, 'conflict', 'CONFLICT')$$,
  'duplicate claim of running request returns conflict'
);

-- ----------------------------------------------------------------------------
-- 10 & 11: Rate limiting (6 in 60s allowed, 7th rate_limited)
-- ----------------------------------------------------------------------------
-- Perform requests 2, 3, 4, 5, 6
select lives_ok(
  $$select public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      'req-test-' || g, 'aa000000-0000-4000-8000-000000000001', 'test-model'
    ) from generate_series(2, 6) as g$$,
  'requests 2 through 6 succeed within the rate limit window'
);

-- 7th request must be rejected with rate_limited
select results_eq(
  $$select allowed, status, error_code
    from public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'req-test-7-excess',
      'aa000000-0000-4000-8000-000000000001',
      'test-model'
    )$$,
  $$values (false, 'rate_limited', 'RATE_LIMITED')$$,
  '7th request in 60s window returns rate_limited'
);

-- ----------------------------------------------------------------------------
-- 12: Daily Budget Quota (USD 1.00 / day)
-- ----------------------------------------------------------------------------
reset role;

-- Simulate prior completed spending of $0.98 for User B
insert into public.ai_requests (
  project_id, user_id, request_id, model, status, cost_usd, reserved_cost_usd, created_at
) values (
  'b0000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'req-b-prior-spend',
  'prior-model',
  'completed',
  0.980000,
  0.000000,
  clock_timestamp() - interval '1 hour'
);

-- Switch to User B to test daily budget
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';

-- User B now tries to claim with standard $0.05 reservation ($0.98 + $0.05 = $1.03 > $1.00)
select results_eq(
  $$select allowed, status, error_code
    from public.claim_assistant_request(
      'b0000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'req-b-budget-check',
      'bb000000-0000-4000-8000-000000000002',
      'test-model'
    )$$,
  $$values (false, 'budget_exceeded', 'BUDGET_EXCEEDED')$$,
  'claim exceeding USD 1.00 daily budget is rejected with budget_exceeded'
);

-- ----------------------------------------------------------------------------
-- 13: Expiration of Stale Running Requests
-- ----------------------------------------------------------------------------
reset role;

insert into public.ai_requests (
  project_id, user_id, request_id, model, status, reserved_cost_usd, expires_at, created_at
) values (
  'b0000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'req-b-stale',
  'test-model',
  'running',
  0.050000,
  clock_timestamp() - interval '10 seconds', -- Expired
  clock_timestamp() - interval '10 minutes'
);

-- Trigger claim which executes auto-expiration
select public.claim_assistant_request(
  'b0000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'req-b-after-expire',
  'bb000000-0000-4000-8000-000000000002',
  'test-model'
);

select results_eq(
  $$select status, reserved_cost_usd
    from public.ai_requests
    where request_id = 'req-b-stale'$$,
  $$values ('expired', 0.000000::numeric(10,6))$$,
  'stale running request past expires_at is auto-expired and its reservation is released'
);

-- ----------------------------------------------------------------------------
-- 14: Security Isolation on claim_assistant_request
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select results_eq(
  $$select allowed, status, error_code
    from public.claim_assistant_request(
      'b0000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'req-spoof',
      'bb000000-0000-4000-8000-000000000002',
      'test-model'
    )$$,
  $$values (false, 'forbidden', 'AUTH_FORBIDDEN')$$,
  'user A cannot claim an assistant request on behalf of user B'
);

-- ----------------------------------------------------------------------------
-- 15 & 16: finalize_assistant_request Normal Settlement & Reservation Release
-- ----------------------------------------------------------------------------
select results_eq(
  $$select success, status, final_cost_usd, duration_ms
    from public.finalize_assistant_request(
      'req-test-1',
      '10000000-0000-4000-8000-000000000001',
      'completed',
      'test-model',
      120,
      80,
      200,
      0.004200,
      1500,
      null
    )$$,
  $$values (true, 'completed', 0.004200::numeric(10,6), 1500)$$,
  'finalize_assistant_request settles cost, token usage, and completed status'
);

select results_eq(
  $$select reserved_cost_usd, cost_usd
    from public.ai_requests
    where user_id = '10000000-0000-4000-8000-000000000001' and request_id = 'req-test-1'$$,
  $$values (0.000000::numeric(10,6), 0.004200::numeric(10,6))$$,
  'finalizing a request releases reserved_cost_usd to 0.000000'
);

-- ----------------------------------------------------------------------------
-- 17 & 18: finalize_assistant_request Validation & Multi-Tenant Protection
-- ----------------------------------------------------------------------------
select throws_ok(
  $$select public.finalize_assistant_request(
      'req-test-1',
      '10000000-0000-4000-8000-000000000001',
      'invalid_status_xyz'
    )$$,
  '22023',
  'Invalid final status: invalid_status_xyz',
  'finalize_assistant_request rejects invalid status'
);

select throws_ok(
  $$select public.finalize_assistant_request(
      'req-b-prior-spend',
      '20000000-0000-4000-8000-000000000002',
      'completed'
    )$$,
  '42501',
  'Cannot finalize request for another user',
  'user A cannot finalize user B assistant request'
);

-- ----------------------------------------------------------------------------
-- 19, 20 & 21: Structure Cache Metrics & Observability View
-- ----------------------------------------------------------------------------
reset role;

select lives_ok(
  $$select public.record_structure_cache_access('1CRN', 'rcsb', 'hit', 45, null);
    select public.record_structure_cache_access('1CRN', 'rcsb', 'miss', 120, null);
    select public.record_structure_cache_access('1CRN', 'uniprot', 'error', 300, 'Upstream 503');$$,
  'record_structure_cache_access successfully logs telemetry'
);

select results_eq(
  $$select hit_count from public.structure_metadata where pdb_id = '1CRN'$$,
  array[1],
  'cache hit increments hit_count in structure_metadata'
);

select results_eq(
  $$select service, total_requests, total_hits, total_misses, total_errors
    from public.v_structure_cache_stats
    where service = 'rcsb'$$,
  $$values ('rcsb', 2::bigint, 1::bigint, 1::bigint, 0::bigint)$$,
  'v_structure_cache_stats aggregates cache hits, misses, and errors'
);

-- ----------------------------------------------------------------------------
-- 22, 23, 24 & 25: Knowledge Ingestion RPCs & Privilege Protection
-- ----------------------------------------------------------------------------
select results_eq(
  $$select public.ingest_knowledge_source(
      'test-source-v1', 'Test Source Title', 'BioFold', 'https://example.test/source',
      'MIT', '2026-09-02'::date, 'hash123', 'knowledge/test.md'
    )$$,
  array['test-source-v1'],
  'ingest_knowledge_source inserts knowledge source'
);

select ok(
  public.ingest_knowledge_chunk(
    'test-source-v1', 0, 'Chunk Zero', 'Molecular coordinates and distances.', 'Sec 1', 15, null
  ) is not null,
  'ingest_knowledge_chunk inserts chunk and returns UUID'
);

select ok(
  public.ingest_knowledge_batch('{
    "sources": [{
      "id": "batch-source-1", "title": "Batch Title", "publisher": "BioFold",
      "url": "https://example.test/batch", "license": "MIT", "retrieved_at": "2026-09-02",
      "sha256": "batch123"
    }],
    "chunks": [{
      "source_id": "batch-source-1", "chunk_index": 0, "title": "Batch Chunk",
      "content": "Batch content test.", "token_count": 8
    }]
  }'::jsonb) = 1,
  'ingest_knowledge_batch atomically ingests manifest sources and chunks'
);

set local role authenticated;
select ok(
  not has_function_privilege('authenticated', 'public.ingest_knowledge_chunk(text,integer,text,text,text,integer,extensions.vector)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.ingest_knowledge_chunk(text,integer,text,text,text,integer,extensions.vector)', 'EXECUTE'),
  'ingest_knowledge_chunk is executable only by service_role'
);

select * from finish();
rollback;
