-- LP「複数ブロック自由構成」化
-- video_url + body の 2 カラムから、blocks JSON 配列へ拡張する。
-- 既存カラム video_url / body は後方互換のため残し、blocks 保存時にアプリ層で再同期する。
-- 既存行は SQL 内で自動変換（冪等：blocks IS NULL ガード）。

ALTER TABLE lp_pages ADD COLUMN blocks TEXT;

-- 動画あり & 本文あり → [video, markdown]
UPDATE lp_pages
   SET blocks = json_array(
         json_object('id', lower(hex(randomblob(8))), 'type', 'video',    'url',  video_url),
         json_object('id', lower(hex(randomblob(8))), 'type', 'markdown', 'text', body)
       )
 WHERE blocks IS NULL
   AND video_url IS NOT NULL AND trim(video_url) <> ''
   AND body      IS NOT NULL AND trim(body)      <> '';

-- 動画のみ → [video]
UPDATE lp_pages
   SET blocks = json_array(
         json_object('id', lower(hex(randomblob(8))), 'type', 'video', 'url', video_url)
       )
 WHERE blocks IS NULL
   AND video_url IS NOT NULL AND trim(video_url) <> ''
   AND (body IS NULL OR trim(body) = '');

-- 本文のみ → [markdown]
UPDATE lp_pages
   SET blocks = json_array(
         json_object('id', lower(hex(randomblob(8))), 'type', 'markdown', 'text', body)
       )
 WHERE blocks IS NULL
   AND body IS NOT NULL AND trim(body) <> ''
   AND (video_url IS NULL OR trim(video_url) = '');

-- どちらも空 → 空配列（理論上は発生しないが防御的に）
UPDATE lp_pages SET blocks = '[]' WHERE blocks IS NULL;
