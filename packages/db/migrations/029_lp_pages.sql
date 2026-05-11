-- 視聴期限付きLP（UTAGE風）
-- 友だち登録日からN日間 / 絶対日時の公開期間 / 両方のAND を条件にコンテンツ表示。
-- 期限切れ・未友だちは管理者指定の別URLへリダイレクト。

CREATE TABLE IF NOT EXISTS lp_pages (
  id                              TEXT PRIMARY KEY,
  line_account_id                 TEXT REFERENCES line_accounts(id) ON DELETE SET NULL,
  name                            TEXT NOT NULL,
  slug                            TEXT NOT NULL UNIQUE,

  content_type                    TEXT NOT NULL CHECK (content_type IN ('video', 'page')),
  video_url                       TEXT,
  body                            TEXT,

  access_window_mode              TEXT NOT NULL CHECK (access_window_mode IN ('absolute', 'relative', 'both', 'none')) DEFAULT 'none',
  absolute_starts_at              TEXT,
  absolute_ends_at                TEXT,
  relative_days_after_friend_add  INTEGER,

  expired_redirect_url            TEXT NOT NULL,
  not_friend_redirect_url         TEXT,

  is_active                       INTEGER NOT NULL DEFAULT 1,
  view_count                      INTEGER NOT NULL DEFAULT 0,

  created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_lp_pages_slug ON lp_pages (slug);
CREATE INDEX IF NOT EXISTS idx_lp_pages_account ON lp_pages (line_account_id);

CREATE TABLE IF NOT EXISTS lp_views (
  id              TEXT PRIMARY KEY,
  lp_page_id      TEXT NOT NULL REFERENCES lp_pages (id) ON DELETE CASCADE,
  friend_id       TEXT REFERENCES friends (id) ON DELETE SET NULL,
  line_user_id    TEXT,
  viewed_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  user_agent      TEXT,
  referrer        TEXT,
  access_result   TEXT NOT NULL CHECK (access_result IN ('allowed', 'expired', 'not_yet', 'not_friend', 'inactive')),
  reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_lp_views_page ON lp_views (lp_page_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_lp_views_friend ON lp_views (friend_id);
