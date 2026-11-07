-- Adaptive Academic Planner: per-user tables with row level security.
-- Ids are app-generated text; every table is keyed by (user_id, id) and restricted to its owner.

create table if not exists app_state (
  user_id uuid primary key references auth.users on delete cascade,
  now timestamptz not null,
  anchor date not null,
  plan_version integer not null default 1
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  timezone text not null,
  wake_time text not null,
  bed_time text not null,
  wind_down_min integer not null,
  preferred_windows jsonb not null default '[]',
  max_hours_per_day numeric not null,
  session_min integer not null,
  session_target integer not null,
  session_max integer not null,
  break_min integer not null,
  free_days integer[] not null default '{}',
  ai_default boolean not null default true
);

create table if not exists assignments (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  title text not null,
  course text not null default '',
  type text not null check (type in ('assignment', 'project', 'exam')),
  due_at timestamptz not null,
  estimate_hours numeric not null check (estimate_hours > 0),
  difficulty smallint not null check (difficulty between 1 and 3),
  priority smallint not null check (priority between 1 and 3),
  description text not null default '',
  percent_complete numeric not null default 0 check (percent_complete between 0 and 100),
  remaining_override numeric,
  ai_enabled boolean,
  status text not null check (status in ('active', 'completed', 'at_risk')),
  primary key (user_id, id)
);

create table if not exists subtasks (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  assignment_id text not null,
  title text not null,
  order_idx integer not null,
  estimate_hours numeric not null,
  percent_complete numeric not null default 0,
  source text not null check (source in ('ai', 'template', 'manual')),
  primary key (user_id, id)
);

create table if not exists calendar_events (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  source text not null check (source in ('simulated', 'google')),
  external_id text,
  title text not null,
  kind text not null check (kind in ('class', 'work', 'social', 'other')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  rule jsonb,
  read_only boolean not null default true,
  primary key (user_id, id)
);

create table if not exists study_sessions (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  assignment_id text not null,
  subtask_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('scheduled', 'completed', 'partial', 'missed', 'cancelled')),
  minutes_done integer not null default 0,
  pinned boolean not null default false,
  plan_version integer not null,
  external_id text,
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['app_state','user_settings','assignments','subtasks','calendar_events','study_sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
