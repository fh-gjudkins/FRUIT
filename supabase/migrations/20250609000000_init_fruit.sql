-- Fruit: nested buckets, tasks, checklists, timer sessions, task event log
-- Apply in Supabase SQL editor or via CLI: supabase db push

create extension if not exists "pgcrypto";

-- Buckets (nested labels like DEV > Project > Sub)
create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.buckets (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buckets_no_self_parent check (parent_id is distinct from id)
);

create index buckets_user_parent_idx on public.buckets (user_id, parent_id);

-- Tasks live in a bucket
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid references public.buckets (id) on delete set null,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_bucket_idx on public.tasks (user_id, bucket_id);

-- Optional checklist per task
create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  position int not null default 0
);

create index task_checklist_task_idx on public.task_checklist_items (task_id, position);

-- Logged focus time (Pomodoro or manual); optional link to task
create table public.timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  source text not null default 'pomodoro' check (source in ('pomodoro', 'manual')),
  note text
);

create index timer_sessions_user_idx on public.timer_sessions (user_id);
create index timer_sessions_task_idx on public.timer_sessions (task_id);

-- Append-only style event log per task
create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index task_events_task_created_idx on public.task_events (task_id, created_at desc);

-- Touch updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger buckets_set_updated_at
before update on public.buckets
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- Server-side task log (created / updated / timer hooks)
create or replace function public.log_task_event_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, event_type, payload)
    values (
      new.user_id,
      new.id,
      'created',
      jsonb_build_object(
        'title', new.title,
        'bucket_id', new.bucket_id
      )
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.task_events (user_id, task_id, event_type, payload)
    values (
      new.user_id,
      new.id,
      'updated',
      jsonb_build_object(
        'title', jsonb_build_object('from', old.title, 'to', new.title),
        'description', case when old.description is distinct from new.description
          then jsonb_build_object('changed', true) else null end,
        'bucket_id', case when old.bucket_id is distinct from new.bucket_id
          then jsonb_build_object('from', old.bucket_id, 'to', new.bucket_id) else null end
      )
    );
    return new;
  end if;
  return new;
end;
$$;

create trigger tasks_log_events_ai
after insert on public.tasks
for each row execute function public.log_task_event_from_task();

create trigger tasks_log_events_au
after update on public.tasks
for each row execute function public.log_task_event_from_task();

create or replace function public.log_task_event_from_timer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_user uuid;
begin
  if new.task_id is null then
    return new;
  end if;

  select user_id into t_user from public.tasks where id = new.task_id;
  if t_user is null or t_user <> new.user_id then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, event_type, payload)
    values (
      new.user_id,
      new.task_id,
      'timer_started',
      jsonb_build_object(
        'timer_session_id', new.id,
        'source', new.source,
        'started_at', new.started_at
      )
    );
    return new;
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
    insert into public.task_events (user_id, task_id, event_type, payload)
    values (
      new.user_id,
      new.task_id,
      'timer_stopped',
      jsonb_build_object(
        'timer_session_id', new.id,
        'source', new.source,
        'started_at', new.started_at,
        'ended_at', new.ended_at,
        'duration_seconds', new.duration_seconds
      )
    );
    return new;
  end if;
  return new;
end;
$$;

create trigger timer_sessions_log_ai
after insert on public.timer_sessions
for each row execute function public.log_task_event_from_timer();

create trigger timer_sessions_log_au
after update on public.timer_sessions
for each row execute function public.log_task_event_from_timer();

create or replace function public.enforce_task_bucket_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.bucket_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.buckets b
    where b.id = new.bucket_id and b.user_id = new.user_id
  ) then
    raise exception 'bucket does not belong to user';
  end if;
  return new;
end;
$$;

create trigger tasks_enforce_bucket_bi
before insert on public.tasks
for each row execute function public.enforce_task_bucket_owner();

create trigger tasks_enforce_bucket_bu
before update on public.tasks
for each row execute function public.enforce_task_bucket_owner();

create or replace function public.enforce_timer_task_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.task_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.tasks t
    where t.id = new.task_id and t.user_id = new.user_id
  ) then
    raise exception 'task does not belong to user';
  end if;
  return new;
end;
$$;

create trigger timer_sessions_enforce_task_bi
before insert on public.timer_sessions
for each row execute function public.enforce_timer_task_owner();

create trigger timer_sessions_enforce_task_bu
before update on public.timer_sessions
for each row execute function public.enforce_timer_task_owner();

-- RLS
alter table public.buckets enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.timer_sessions enable row level security;
alter table public.task_events enable row level security;

-- Buckets
create policy buckets_select_own on public.buckets
  for select using (auth.uid() = user_id);
create policy buckets_insert_own on public.buckets
  for insert with check (auth.uid() = user_id);
create policy buckets_update_own on public.buckets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy buckets_delete_own on public.buckets
  for delete using (auth.uid() = user_id);

-- Tasks (UPDATE needs SELECT per Postgres RLS)
create policy tasks_select_own on public.tasks
  for select using (auth.uid() = user_id);
create policy tasks_insert_own on public.tasks
  for insert with check (auth.uid() = user_id);
create policy tasks_update_own on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_delete_own on public.tasks
  for delete using (auth.uid() = user_id);

-- Checklist: task must belong to user
create policy checklist_select on public.task_checklist_items
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );
create policy checklist_insert on public.task_checklist_items
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );
create policy checklist_update on public.task_checklist_items
  for update using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );
create policy checklist_delete on public.task_checklist_items
  for delete using (
    exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );

-- Timer sessions
create policy timer_select_own on public.timer_sessions
  for select using (auth.uid() = user_id);
create policy timer_insert_own on public.timer_sessions
  for insert with check (auth.uid() = user_id);
create policy timer_update_own on public.timer_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy timer_delete_own on public.timer_sessions
  for delete using (auth.uid() = user_id);

-- Task events: read own; insert when task is yours (checklist / client-side extras)
create policy task_events_select on public.task_events
  for select using (auth.uid() = user_id);
create policy task_events_insert on public.task_events
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );

-- Sum completed timer duration for tasks in this bucket and all nested buckets
create or replace function public.bucket_timer_totals()
returns table (bucket_id uuid, total_seconds bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive sub as (
    select b.id as root_id, b.id as node_id
    from public.buckets b
    where b.user_id = auth.uid()
    union all
    select s.root_id, c.id
    from sub s
    join public.buckets c on c.parent_id = s.node_id and c.user_id = auth.uid()
  ),
  agg as (
    select s.root_id as bucket_id, coalesce(sum(ts.duration_seconds), 0)::bigint as secs
    from sub s
    join public.tasks t on t.bucket_id = s.node_id and t.user_id = auth.uid()
    join public.timer_sessions ts
      on ts.task_id = t.id
     and ts.user_id = auth.uid()
     and ts.ended_at is not null
     and ts.duration_seconds is not null
    group by s.root_id
  )
  select b.id as bucket_id, coalesce(a.secs, 0)::bigint as total_seconds
  from public.buckets b
  left join agg a on a.bucket_id = b.id
  where b.user_id = auth.uid();
$$;

grant execute on function public.bucket_timer_totals() to authenticated;
