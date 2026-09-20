-- Runway schema. Idempotent: safe to run repeatedly.
-- All money is INTEGER PAISE in BIGINT (1 rupee = 100 paise). Never floats.
-- Sign convention: transactions.amount_paise < 0 is a debit, > 0 a credit.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,            -- stored lower-case
  password_hash TEXT NOT NULL,
  is_demo       BOOLEAN NOT NULL DEFAULT false,  -- demo account is read-only
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imports (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename              TEXT NOT NULL,
  row_count             INTEGER NOT NULL,
  inserted_count        INTEGER NOT NULL DEFAULT 0,
  closing_balance_paise BIGINT,
  closing_balance_date  DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  import_id      BIGINT REFERENCES imports(id) ON DELETE CASCADE,
  txn_date       DATE NOT NULL,
  description    TEXT NOT NULL,
  amount_paise   BIGINT NOT NULL CHECK (amount_paise <> 0),
  balance_paise  BIGINT,
  category       TEXT NOT NULL DEFAULT 'uncategorised',
  is_transfer    BOOLEAN NOT NULL DEFAULT false,
  is_outlier     BOOLEAN NOT NULL DEFAULT false,
  row_hash       TEXT NOT NULL,
  -- makes re-uploading the same (or an overlapping) statement idempotent
  UNIQUE (user_id, row_hash)
);
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions (user_id, txn_date);

CREATE TABLE IF NOT EXISTS scheduled_items (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('income', 'bill')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),  -- always positive; `kind` gives the sign
  next_date    DATE NOT NULL,                             -- first (or any) occurrence; recurrence expands from it
  recurrence   TEXT NOT NULL CHECK (recurrence IN ('once', 'weekly', 'monthly')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_user ON scheduled_items (user_id);

CREATE TABLE IF NOT EXISTS scenarios (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  params     JSONB NOT NULL,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scen_user ON scenarios (user_id, created_at DESC);
