begin;

alter table app.users
  add column if not exists password_hash text;

create table if not exists app.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_token_idx on app.auth_sessions(token_hash);
create index if not exists auth_sessions_expiry_idx on app.auth_sessions(expires_at);

commit;
