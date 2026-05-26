create table if not exists ops_triage (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id)
);

create table if not exists admin_preferences (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_ops_triage_org_source on ops_triage (organization_id, source_type, source_id);
create index if not exists idx_admin_preferences_org_user on admin_preferences (organization_id, user_id);
