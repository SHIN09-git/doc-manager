-- P1 production schema draft for PostgreSQL.
-- The P0 JSON store remains the default for local development.

create table if not exists migration_versions (
  id text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  avatar_url text not null default '',
  password_hash text not null,
  email_verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_login_at timestamptz,
  disabled_at timestamptz
);

alter table users add column if not exists email_verified_at timestamptz;

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null,
  plan text not null default 'free',
  created_by text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists memberships (
  id text primary key,
  organization_id text not null references organizations(id),
  user_id text not null references users(id),
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null,
  unique (organization_id, user_id)
);

create table if not exists organization_invitations (
  id text primary key,
  organization_id text not null references organizations(id),
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null,
  invited_by text not null references users(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table if not exists documents (
  id text primary key,
  organization_id text not null references organizations(id),
  owner_id text not null references users(id),
  title text not null,
  type text not null default 'custom',
  folder_id text,
  content text not null default '',
  source text not null default 'cloud',
  local_id text,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

alter table documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table documents add column if not exists version integer not null default 1;

create table if not exists writer_profiles (
  id text primary key,
  organization_id text not null references organizations(id),
  owner_id text not null references users(id),
  name text not null,
  handle text not null,
  category text not null,
  description text not null default '',
  enabled boolean not null default true,
  summary_md text not null default '',
  skill_json jsonb not null default '{}'::jsonb,
  quality_report jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (organization_id, handle)
);

alter table writer_profiles add column if not exists version integer not null default 1;

create table if not exists writer_versions (
  id text primary key,
  writer_profile_id text not null references writer_profiles(id),
  version integer not null,
  summary_md text not null default '',
  skill_json jsonb not null default '{}'::jsonb,
  quality_report jsonb not null default '{}'::jsonb,
  created_by text not null references users(id),
  created_at timestamptz not null
);

create table if not exists api_keys (
  id text primary key,
  organization_id text not null references organizations(id),
  user_id text not null references users(id),
  provider text not null,
  scope text not null default 'organization',
  encrypted_key text not null,
  key_hint text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  disabled_at timestamptz
);

create table if not exists ai_usage (
  id text primary key,
  organization_id text not null references organizations(id),
  user_id text not null references users(id),
  provider text not null,
  model text not null,
  task_type text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost numeric not null default 0,
  status text not null,
  error text,
  created_at timestamptz not null
);

create table if not exists ops_triage (
  id text primary key,
  organization_id text not null references organizations(id),
  source_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_by text references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, source_type, source_id)
);

create table if not exists admin_preferences (
  id text primary key,
  organization_id text not null references organizations(id),
  user_id text not null references users(id),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, user_id)
);

create table if not exists audit_logs (
  id text primary key,
  organization_id text references organizations(id),
  user_id text references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists idx_documents_org_updated on documents (organization_id, updated_at desc);
create index if not exists idx_writer_profiles_org_handle on writer_profiles (organization_id, handle);
create index if not exists idx_writer_versions_profile on writer_versions (writer_profile_id, version desc);
create index if not exists idx_ai_usage_org_created on ai_usage (organization_id, created_at desc);
create index if not exists idx_ops_triage_org_source on ops_triage (organization_id, source_type, source_id);
create index if not exists idx_admin_preferences_org_user on admin_preferences (organization_id, user_id);
create index if not exists idx_audit_logs_org_created on audit_logs (organization_id, created_at desc);
create index if not exists idx_invitations_org_email on organization_invitations (organization_id, email);

create table if not exists email_verifications (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists password_resets (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists email_deliveries (
  id text primary key,
  user_id text references users(id),
  email text not null,
  template text not null,
  provider text not null,
  status text not null,
  attempts integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists login_attempts (
  id text primary key,
  email text not null,
  ip_hash text not null,
  success boolean not null default false,
  created_at timestamptz not null
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists rate_limits (
  id text primary key,
  organization_id text references organizations(id),
  user_id text references users(id),
  scope text not null,
  date text not null,
  count integer not null default 1,
  updated_at timestamptz not null
);

create table if not exists system_events (
  id text primary key,
  organization_id text references organizations(id),
  user_id text references users(id),
  level text not null,
  type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create table if not exists payment_webhooks (
  id text primary key,
  provider text not null,
  event_id text not null,
  organization_id text references organizations(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null,
  unique (provider, event_id)
);

create index if not exists idx_email_verifications_user on email_verifications (user_id, expires_at desc);
create index if not exists idx_password_resets_user on password_resets (user_id, expires_at desc);
create index if not exists idx_email_deliveries_user_created on email_deliveries (user_id, created_at desc);
create index if not exists idx_login_attempts_email_created on login_attempts (email, created_at desc);
create index if not exists idx_sessions_user on sessions (user_id, expires_at desc);
create index if not exists idx_system_events_org_created on system_events (organization_id, created_at desc);
