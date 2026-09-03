begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'phase23-a@example.test', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'phase23-b@example.test', '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000003', 'phase23-c@example.test', '{}'::jsonb),
  ('40000000-0000-4000-8000-000000000004', 'phase23-d@example.test', '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('10000000-0000-4000-8000-000000000001', 'Phase 23 A'),
  ('20000000-0000-4000-8000-000000000002', 'Phase 23 B'),
  ('30000000-0000-4000-8000-000000000003', 'Phase 23 C'),
  ('40000000-0000-4000-8000-000000000004', 'Phase 23 D');

insert into public.projects (id, owner_id, title, active_pdb_id, updated_at) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Phase 23 A', '1CRN', '2026-01-01 00:00:00+00'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Phase 23 B', '4HHB', '2026-01-01 00:00:00+00'),
  ('c0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'Phase 23 C', null, '2026-01-01 00:00:00+00'),
  ('d0000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'Phase 23 D', null, '2026-01-01 00:00:00+00');

insert into public.conversations (id, project_id, title, updated_at) values
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Conversation A', '2026-01-01 00:00:00+00'),
  ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Conversation B', '2026-01-01 00:00:00+00'),
  ('cc000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Conversation C', '2026-01-01 00:00:00+00');

select lives_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'assistant', repeat('x', 8000))$$,
  'messages accept exactly 8,000 characters'
);
select throws_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'assistant', repeat('x', 8001))$$,
  '23514', null, 'messages reject 8,001 characters'
);
select ok(
  (select updated_at > '2026-01-01 00:00:00+00' from public.conversations
    where id = 'aa000000-0000-4000-8000-000000000001'),
  'inserting a message updates conversation activity'
);

select ok(
  not has_function_privilege('authenticated',
    'public.claim_assistant_request(uuid,uuid,text,text,uuid,text,numeric,numeric)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.claim_assistant_request(uuid,uuid,text,text,uuid,text,numeric,numeric)', 'EXECUTE'),
  'claim RPC is executable only by service_role'
);
select ok(
  not has_function_privilege('authenticated',
    'public.finalize_assistant_request(text,uuid,text,boolean,text,text,integer,integer,integer,numeric,integer,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.finalize_assistant_request(text,uuid,text,boolean,text,text,integer,integer,integer,numeric,integer,text,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'finalize RPC is executable only by service_role'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_requests', 'SELECT')
  and not has_table_privilege('authenticated', 'public.knowledge_chunks', 'SELECT')
  and not has_table_privilege('authenticated', 'public.external_evidence_cache', 'SELECT')
  and not has_table_privilege('authenticated', 'public.external_evidence_metrics', 'SELECT'),
  'browser roles cannot read accounting, corpus, cache or metrics'
);
select ok(
  has_table_privilege('authenticated', 'public.conversations', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'browser access is limited to conversation CRUD and message reads'
);

set local role service_role;

select is(
  (select count(*) from generate_series(1, 6) AS attempt
    cross join lateral public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'rate-' || attempt, 'Question ' || attempt,
      'aa000000-0000-4000-8000-000000000001', 'openai/gpt-5-mini', 1.00, 0.05
    ) AS claim
    where claim.allowed and claim.status = 'running'),
  6::bigint, 'exactly six new requests are admitted in sixty seconds'
);

select results_eq(
  $$select allowed, status, error_code from public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'rate-7', 'Seventh question', 'aa000000-0000-4000-8000-000000000001',
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  $$values (false, 'rate_limited'::text, 'RATE_LIMITED'::text)$$,
  'the seventh new request is rate limited'
);

select lives_ok(
  $$select * from public.finalize_assistant_request(
      'rate-1', '10000000-0000-4000-8000-000000000001', 'completed', true,
      'provider-1', 'openai/gpt-5-mini', 10, 5, 15, 0.0042, 1200, null,
      'fa000000-0000-4000-8000-000000000001', 'Verified answer', '[]'::jsonb, '[]'::jsonb)$$,
  'completion persists and settles in one RPC'
);
select is(
  (select content from public.messages
    where id = 'fa000000-0000-4000-8000-000000000001'),
  'Verified answer', 'finalization atomically persists the assistant answer'
);
select results_eq(
  $$select status, cost_usd, reserved_cost_usd, provider_request_id
    from public.ai_requests where request_id = 'rate-1'$$,
  $$values ('completed'::text, 0.004200::numeric, 0.000000::numeric, 'provider-1'::text)$$,
  'finalization reconciles actual cost and releases the reservation'
);
select results_eq(
  $$select allowed, status from public.claim_assistant_request(
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'rate-1', 'Replay', 'aa000000-0000-4000-8000-000000000001',
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  $$values (true, 'completed'::text)$$,
  'a completed replay consumes neither rate nor budget'
);

select lives_ok(
  $$select * from public.claim_assistant_request(
      'b0000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'release-before-provider', 'Release me', 'bb000000-0000-4000-8000-000000000002',
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  'a request can be reserved before provider invocation'
);
select lives_ok(
  $$select * from public.finalize_assistant_request(
      'release-before-provider', '20000000-0000-4000-8000-000000000002',
      'failed', false, null, 'openai/gpt-5-mini', null, null, null, null, 20,
      'Provider was not called', null, null, null, null)$$,
  'failure before provider invocation finalizes cleanly'
);
select results_eq(
  $$select cost_usd, reserved_cost_usd from public.ai_requests
    where request_id = 'release-before-provider'$$,
  $$values (0.000000::numeric, 0.000000::numeric)$$,
  'failure before provider invocation releases the full reservation'
);

select * from public.claim_assistant_request(
  'b0000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'charge-missing-usage', 'Charge reserve', 'bb000000-0000-4000-8000-000000000002',
  'openai/gpt-5-mini', 1.00, 0.05
);
select * from public.finalize_assistant_request(
  'charge-missing-usage', '20000000-0000-4000-8000-000000000002',
  'failed', true, 'provider-missing-usage', 'openai/gpt-5-mini', null, null, null,
  null, 30, 'No terminal usage event', null, null, null, null
);
select is(
  (select cost_usd from public.ai_requests where request_id = 'charge-missing-usage'),
  0.050000::numeric, 'provider consumption without usage charges the reservation'
);

insert into public.ai_requests (
  project_id, conversation_id, user_id, request_id, model, status,
  cost_usd, reserved_cost_usd, budget_date, completed_at, created_at
) values (
  'b0000000-0000-4000-8000-000000000002', 'bb000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002', 'today-spend', 'openai/gpt-5-mini',
  'completed', 0.92, 0, (timezone('UTC', now()))::date, now(), now() - interval '1 hour'
);
select results_eq(
  $$select allowed, status, error_code from public.claim_assistant_request(
      'b0000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'budget-rejected', 'Over budget', 'bb000000-0000-4000-8000-000000000002',
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  $$values (false, 'budget_exceeded'::text, 'BUDGET_EXCEEDED'::text)$$,
  'budget is enforced per user and UTC date'
);

insert into public.ai_requests (
  project_id, conversation_id, user_id, request_id, model, status,
  cost_usd, reserved_cost_usd, budget_date, completed_at, created_at
) values (
  'c0000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003', 'yesterday-spend', 'openai/gpt-5-mini',
  'completed', 0.99, 0, (timezone('UTC', now()))::date - 1, now(), now() - interval '1 hour'
);
select results_eq(
  $$select allowed, status from public.claim_assistant_request(
      'c0000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000003',
      'new-utc-day', 'New UTC day', 'cc000000-0000-4000-8000-000000000003',
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  $$values (true, 'running'::text)$$,
  'spend from the previous UTC date does not consume todays budget'
);

insert into public.ai_requests (
  project_id, conversation_id, user_id, request_id, model, status,
  provider_called, reserved_cost_usd, budget_date, expires_at, created_at
) values
  ('c0000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000003', 'expired-not-called', 'openai/gpt-5-mini',
   'running', false, 0.05, (timezone('UTC', now()))::date, now() - interval '1 second', now() - interval '6 minutes'),
  ('c0000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000003', 'expired-called', 'openai/gpt-5-mini',
   'running', true, 0.05, (timezone('UTC', now()))::date, now() - interval '1 second', now() - interval '6 minutes');
select * from public.claim_assistant_request(
  'c0000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  'expiration-sweep', 'Sweep expired reservations', 'cc000000-0000-4000-8000-000000000003',
  'openai/gpt-5-mini', 1.00, 0.05
);
select results_eq(
  $$select request_id, cost_usd, reserved_cost_usd from public.ai_requests
    where request_id in ('expired-called', 'expired-not-called') order by request_id$$,
  $$values
    ('expired-called'::text, 0.050000::numeric, 0.000000::numeric),
    ('expired-not-called'::text, 0.000000::numeric, 0.000000::numeric)$$,
  'expired reservations charge only calls that reached the provider'
);

select results_eq(
  $$select allowed, status, conversation_id is not null
    from public.claim_assistant_request(
      'd0000000-0000-4000-8000-000000000004',
      '40000000-0000-4000-8000-000000000004',
      'new-conversation', repeat('New title ', 20), null,
      'openai/gpt-5-mini', 1.00, 0.05)$$,
  $$values (true, 'running'::text, true)$$,
  'an admitted first message atomically creates a conversation'
);
select ok(
  (select char_length(c.title) <= 80 from public.conversations c
    join public.ai_requests r on r.conversation_id = c.id
    where r.request_id = 'new-conversation'),
  'a first-message conversation title is limited to 80 characters'
);
select is(
  (select count(*) from public.messages where request_id = 'new-conversation' and sender = 'user'),
  1::bigint, 'the admitted user question is persisted exactly once'
);

insert into public.knowledge_ingestion_runs (
  id, corpus_version, embedding_model, embedding_dimensions, status, source_count, chunk_count
) values (
  'd0000000-0000-4000-8000-000000000004', '2.3.0', 'gte-small', 384, 'running', 1, 1
);
select is(
  public.replace_knowledge_source(
    'd0000000-0000-4000-8000-000000000004', '2.3.0',
    '{"id":"test-source","title":"Test","publisher":"BioFold","url":"https://example.test/source","license":"MIT","retrievedAt":"2026-09-02","contentPath":"knowledge/test.md","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'index', 0, 'title', 'Deterministic marker', 'locator', 'Section',
      'content', 'deterministicmarker evidence', 'wordCount', 2,
      'checksum', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'embedding', (select jsonb_agg(0::numeric) from generate_series(1, 384))
    ))
  ),
  1, 'a source and its 384-dimensional embedding are replaced transactionally'
);
select is(
  (select count(*) from public.hybrid_search_knowledge(
    'deterministicmarker', null, 6, 1, 1, 50, 0.35)
    where source_id = 'test-source'),
  1::bigint, 'full-text retrieval remains available without an embedding'
);

reset role;
select * from finish();
rollback;
