-- Public Gate Sites — /public-gate/* が参照する外部サイトのゲート設定
-- (site_key, 必須タグ, 戻り先オリジン許可リスト) を管理画面から編集可能にする
CREATE TABLE public_gate_sites (
  id TEXT PRIMARY KEY,
  site_key TEXT UNIQUE NOT NULL,
  required_tag_id TEXT NOT NULL REFERENCES tags(id),
  allowed_return_origins TEXT NOT NULL, -- JSON配列文字列 (string[])
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
