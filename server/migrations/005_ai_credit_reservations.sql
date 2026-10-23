create table if not exists ai_credit_reservations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  usage_id text references ai_usage(id) on delete set null,
  amount integer not null,
  balance_after integer not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_credit_reservations_status_check
    check (status in ('reserved', 'settled', 'refunded'))
);

create index if not exists idx_ai_credit_reservations_user_status
  on ai_credit_reservations (organization_id, user_id, status, created_at desc);

create unique index if not exists idx_ai_credit_reservations_usage
  on ai_credit_reservations (usage_id)
  where usage_id is not null;
