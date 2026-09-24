-- OAuth sign-in attempts in flight, keyed by the "state" parameter. Short-lived.
CREATE TABLE oauth_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- One OAuth session (tokens + DPoP key) per account. client_origin is the
-- origin whose client_id the grant belongs to, so background jobs refresh it
-- with the same client.
CREATE TABLE oauth_session (
  did TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  client_origin TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Cross-request locks, so two requests never refresh the same tokens at once.
CREATE TABLE mutex (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Browser sign-ins. id is the SHA-256 of the cookie value, never the value.
CREATE TABLE web_session (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX web_session_did ON web_session (did);

-- Drafts waiting to go out. Images live in R2 under scheduled/<id>/<n>.
CREATE TABLE scheduled_post (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  kind TEXT NOT NULL,
  -- The Draft as JSON, image blobs left out. Thread progress and reserved
  -- record keys are written back here as publishing goes.
  draft TEXT NOT NULL,
  summary TEXT NOT NULL,
  post_count INTEGER NOT NULL,
  image_count INTEGER NOT NULL,
  -- When the writer wants it out.
  publish_at INTEGER NOT NULL,
  -- scheduled | publishing | published | failed
  status TEXT NOT NULL,
  -- publish_at, or later while backing off after a failure.
  next_attempt_at INTEGER NOT NULL,
  -- Set while a run is publishing it; an expired lease can be taken over.
  lease_until INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX scheduled_post_due ON scheduled_post (status, next_attempt_at);
CREATE INDEX scheduled_post_did ON scheduled_post (did, publish_at);
