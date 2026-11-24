-- 1AGE Cash: PostgreSQL schema for sandbox-only, wallet-free credits.
-- Apply using a privileged migration role before starting the server.
-- Production requires independent financial, privacy, processor and security review.
CREATE TABLE IF NOT EXISTS cash_accounts (
  owner_id TEXT PRIMARY KEY,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cash_orders (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES cash_accounts(owner_id),
  request_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK(currency='usd'),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','paid','partially_refunded','refunded')),
  granted_minor INTEGER NOT NULL DEFAULT 0 CHECK(granted_minor >= 0),
  refunded_minor INTEGER NOT NULL DEFAULT 0 CHECK(refunded_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_key),
  CHECK(refunded_minor <= amount_cents)
);
CREATE TABLE IF NOT EXISTS cash_ledger (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES cash_accounts(owner_id),
  delta_minor BIGINT NOT NULL CHECK(delta_minor <> 0),
  kind TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_ledger_owner_history
  ON cash_ledger(owner_id, id DESC);
CREATE TABLE IF NOT EXISTS cash_stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
