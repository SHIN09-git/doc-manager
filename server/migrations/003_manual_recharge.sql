alter table organizations add column if not exists plan_expires_at timestamptz;

create table if not exists manual_payment_orders (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  package_id text not null,
  package_type text not null,
  title text not null,
  amount_cny numeric not null default 0,
  credits integer not null default 0,
  plan text not null default '',
  duration_days integer not null default 0,
  payment_channel text not null,
  payer_note text not null default '',
  proof_text text not null default '',
  status text not null default 'pending',
  reviewed_by text references users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists credit_accounts (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists credit_ledger (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  order_id text references manual_payment_orders(id) on delete set null,
  usage_id text references ai_usage(id) on delete set null,
  direction text not null,
  amount integer not null,
  balance_after integer not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_payment_orders_org_status on manual_payment_orders (organization_id, status, created_at desc);
create index if not exists idx_credit_accounts_org_user on credit_accounts (organization_id, user_id);
create index if not exists idx_credit_ledger_org_created on credit_ledger (organization_id, created_at desc);
