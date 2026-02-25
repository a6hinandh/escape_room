create extension if not exists pgcrypto;

create table teams (
  id uuid primary key default gen_random_uuid(),
  team_id text unique,
  email text unique,
  active boolean default false,
  terminated boolean default false,
  deactivated boolean default false,
  document_url text,
  final_key text,
  session_start timestamptz,
  session_end timestamptz,
  attempts int default 0,
  completed boolean default false,
  completion_time timestamptz
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  team_id text,
  submitted_key text,
  correct boolean,
  created_at timestamptz default now()
);

create table broadcast (
  id uuid primary key default gen_random_uuid(),
  message text,
  created_at timestamptz default now()
);

create table settings (
  id int primary key default 1,
  final_key text
);

insert into settings (id, final_key) values (1, 'ESCAPE123');
