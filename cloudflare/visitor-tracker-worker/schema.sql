CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  referrer TEXT,
  landing_url TEXT,
  gclid TEXT,
  params TEXT,
  device TEXT,
  screen TEXT,
  language TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS sessions_started_at ON sessions (started_at);
CREATE INDEX IF NOT EXISTS sessions_visitor_id ON sessions (visitor_id);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  started_at INTEGER NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  scroll_pct INTEGER NOT NULL DEFAULT 0,
  events TEXT NOT NULL DEFAULT '[]',
  flags TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pages_session_id ON pages (session_id);
CREATE INDEX IF NOT EXISTS pages_started_at ON pages (started_at);

CREATE INDEX IF NOT EXISTS sessions_gclid ON sessions (gclid);

-- Filled in by contraption-ads/enrich_visits.py from the Google Ads click report.
CREATE TABLE IF NOT EXISTS ad_clicks (
  gclid TEXT PRIMARY KEY,
  found INTEGER NOT NULL DEFAULT 1,
  click_date TEXT,
  campaign_id TEXT,
  campaign TEXT,
  ad_group_id TEXT,
  ad_group TEXT,
  keyword TEXT,
  match_type TEXT,
  device TEXT,
  network TEXT,
  updated_at INTEGER NOT NULL
);
