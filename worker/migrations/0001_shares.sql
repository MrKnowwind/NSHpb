CREATE TABLE shares (
  code TEXT PRIMARY KEY,
  roster TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX shares_expiry ON shares (expires_at);
