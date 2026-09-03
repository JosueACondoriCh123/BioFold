begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@example.test', '{}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 'owner-b@example.test', '{}'::jsonb);

insert into public.profiles (id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'Owner A'),
  ('20000000-0000-4000-8000-000000000002', 'Owner B');

insert into public.projects (id, owner_id, title, active_pdb_id)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Project A', '1CRN'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Project B', '4HHB');

insert into public.project_events (
  project_id, activity_id, command, origin, status, evidence, input
)
values
  ('a0000000-0000-4000-8000-000000000001', 'activity-a', 'load_structure', 'human', 'success', 'observed', '{"pdbId":"1CRN"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000002', 'activity-b', 'load_structure', 'human', 'success', 'observed', '{"pdbId":"4HHB"}'::jsonb);

insert into public.conversations (id, project_id, title)
values
  ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Conversation A'),
  ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Conversation B');

insert into public.messages (conversation_id, sender, content)
values
  ('aa000000-0000-4000-8000-000000000001', 'user', 'Question A'),
  ('aa000000-0000-4000-8000-000000000001', 'assistant', 'Answer A'),
  ('bb000000-0000-4000-8000-000000000002', 'user', 'Question B');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select results_eq(
  'select count(*) from public.projects',
  array[1::bigint],
  'owner A sees only their project'
);

select results_eq(
  'select count(*) from public.profiles',
  array[1::bigint],
  'owner A sees only their profile'
);

select results_eq(
  $$with changed as (
      update public.projects set title = 'Blocked change'
      where id = 'b0000000-0000-4000-8000-000000000002'
      returning 1
    ) select count(*) from changed$$,
  array[0::bigint],
  'owner A cannot update owner B project'
);

select lives_ok(
  $$insert into public.projects (owner_id, title)
    values ('10000000-0000-4000-8000-000000000001', 'Second A project')$$,
  'owner A can insert a project with the valid workspace default'
);

select throws_ok(
  $$insert into public.projects (owner_id, title)
    values ('20000000-0000-4000-8000-000000000002', 'Spoofed project')$$,
  '42501',
  'new row violates row-level security policy for table "projects"',
  'owner A cannot insert a project for owner B'
);

select results_eq(
  'select count(*) from public.project_events',
  array[1::bigint],
  'owner A sees only activity from their project'
);

select lives_ok(
  $$insert into public.project_events (
      project_id, activity_id, command, origin, status, evidence, input
    ) values (
      'a0000000-0000-4000-8000-000000000001',
      'activity-a-2',
      'set_representation',
      'human',
      'success',
      'observed',
      '{"style":"stick","colorScheme":"spectrum"}'::jsonb
    )$$,
  'owner A can append activity to their project'
);

select throws_ok(
  $$insert into public.project_events (
      project_id, activity_id, command, origin, status, evidence, input
    ) values (
      'b0000000-0000-4000-8000-000000000002',
      'spoofed-activity',
      'reset_workspace',
      'human',
      'success',
      'observed',
      '{"scope":"view"}'::jsonb
    )$$,
  '42501',
  'new row violates row-level security policy for table "project_events"',
  'owner A cannot append activity to owner B project'
);

select results_eq(
  'select count(*) from public.messages',
  array[2::bigint],
  'owner A sees user and assistant messages only in their conversation'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'user', 'Another question')$$,
  '42501',
  'permission denied for table messages',
  'browser clients cannot write messages directly'
);

reset role;
set local role service_role;

select lives_ok(
  $$insert into public.messages (conversation_id, request_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'request-idempotent', 'user', 'Idempotent question')$$,
  'the trusted server can persist the first durable request message'
);

select throws_ok(
  $$insert into public.messages (conversation_id, request_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'request-idempotent', 'user', 'Duplicate question')$$,
  '23505',
  'duplicate key value violates unique constraint "uq_messages_conversation_request_sender"',
  'the same request cannot persist the same sender twice'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.messages (conversation_id, sender, content)
    values ('aa000000-0000-4000-8000-000000000001', 'assistant', 'Spoofed answer')$$,
  '42501',
  'permission denied for table messages',
  'browser clients cannot insert assistant messages'
);

select throws_ok(
  $$delete from public.messages
    where conversation_id = 'aa000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table messages',
  'browser clients cannot delete append-only messages'
);

set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';

select results_eq(
  'select count(*) from public.projects',
  array[1::bigint],
  'owner B sees only their project'
);

select results_eq(
  'select count(*) from public.project_events',
  array[1::bigint],
  'owner B sees only their project activity'
);

reset role;
set local role anon;

select throws_ok(
  'select count(*) from public.projects',
  '42501',
  'permission denied for table projects',
  'anonymous clients cannot read private projects'
);

reset role;

select ok(
  not has_function_privilege(
    'authenticated',
    'public.hybrid_search_knowledge(text,extensions.vector,integer,double precision,double precision,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'service_role',
    'public.hybrid_search_knowledge(text,extensions.vector,integer,double precision,double precision,integer)',
    'EXECUTE'
  ),
  'hybrid retrieval is executable only by the trusted server role'
);

select * from finish();
rollback;
