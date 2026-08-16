# Staging 環境で LP 実機確認：staging 用 LIFF 新規作成 + LP seed

## Status (2026-05-17 時点)

✅ Step 1: staging 用 LIFF (`2009591417-a8Isja5j`) 作成済（ユーザー手動）
✅ Step 2: staging Worker の `LIFF_URL` secret 投入済
✅ Step 3a: staging Worker の `API_KEY` secret 投入（本番と同値）
✅ Step 3b: staging に LP `test1` (id `99959044-...`) を seed
✅ Step 4: staging用 LIFF ラッパURL で Flex 送信（messageId `44c19d43-...`）
✅ 追加送信: `slug=7e24661a` のLPで Flex 送信（messageId `d3f47ca1-...`、2026-05-17）

直近の送信は完了。次のアクションをユーザーに確認中。

## Context

直前のテストで本番ドメイン版は LIFF ラッパ経由で動作確認済み。次にステージング Worker（`https://line-harness-staging.kei-01261026.workers.dev`）でも同様の検証をしたい。staging ドメインで生URL送信したところ:

1. **「ページが見つかりません」表示**: staging D1 (`line-crm-staging`) に slug `test1` の LP 行が無いため、`apps/worker/src/index.ts:448-457` の 404 HTML が返る。
2. **Safari で開かれた**: LIFF ラッパURL でない生URLは LINE 内蔵ブラウザに入る保証が無い（LINEクライアント設定や端末挙動次第）。

両方を解消するため、**staging 専用 LIFF を新規作成し、staging D1 に LP を seed し、新LIFFラッパURLで Flex を再送**する。本番運用には触らない。

## Approach

### Step 1: 【完了】staging 用 LIFF アプリ作成

ユーザー側で LINE Developers Console での作成が完了:

- **新 LIFF ID**: `2009591417-a8Isja5j`
- **LIFFラッパURL**: `https://liff.line.me/2009591417-a8Isja5j`
- Endpoint URL は staging Worker (`https://line-harness-staging.kei-01261026.workers.dev`) を指す前提

### Step 2: staging Worker の env に新 LIFF URL を設定

```bash
echo "https://liff.line.me/2009591417-a8Isja5j" | npx wrangler secret put LIFF_URL --env staging
```

参照箇所:
- `apps/worker/src/index.ts:466-468` — `env.LIFF_URL` から正規表現で LIFF ID を抽出してインラインJSに埋め込む
- `apps/worker/src/index.ts:462-464` — `lp.line_account_id` が非NULLで該当行の `line_accounts.liff_id` が設定されていればそちらが優先

staging の `line_accounts` 表に該当行があり `liff_id` がセットされている場合は、その値を新LIFF IDに更新する（後述 Step 3 で考慮）。

### Step 3: staging D1 に LP データを seed

#### 3a. 本番から行を取得

```bash
npx wrangler d1 execute line-crm --env production --remote \
  --command "SELECT * FROM lp_pages WHERE slug='test1'"
```

#### 3b. staging の line_accounts と liff_id 状況を確認

```bash
npx wrangler d1 execute line-crm-staging --env staging --remote \
  --command "SELECT id, name, channel_id, liff_id FROM line_accounts"
```

- staging に同じ `line_account_id` が無ければ:
  - (i) LP を `line_account_id = NULL` で挿入し、`env.LIFF_URL` フォールバック経路 (`apps/worker/src/index.ts:466-468`) に頼る
  - (ii) もしくは staging の既存 line_accounts のいずれかの id を使う
- staging に該当 line_accounts がある場合は `UPDATE line_accounts SET liff_id='<NEW_LIFF_ID>' WHERE id='<acc_id>'` を実行

#### 3c. lp_pages を INSERT

3a の結果に基づき、新しい `id` で `INSERT INTO lp_pages (...) VALUES (...)` を staging に実行。スキーマは `packages/db/migrations/029_lp_pages.sql:5-47` 参照。

代替経路として MCP `create_lp_page`（`packages/mcp-server/src/tools/create-lp-page.ts:5-82`）を staging API_URL に向ければ POST で作成可能。ただし MCP 再起動が必要なので curl 直接POST が早い:

```bash
curl -sS -X POST https://line-harness-staging.kei-01261026.workers.dev/api/lp-pages \
  -H "Authorization: Bearer <STAGING_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "...", "slug": "test1", "contentType": "video", "videoUrl": "...", "accessWindowMode": "none", "expiredRedirectUrl": "..." }'
```

staging API_KEY は staging Worker secrets で別管理されている想定。`wrangler secret list --env staging` で確認するか、無ければ `wrangler secret put API_KEY --env staging` で投入（本番と同じ値を使うか、新規発行）。

### Step 4: 新 LIFF ラッパURL で Flex を再送

```bash
LP_URL="https://liff.line.me/2009591417-a8Isja5j/lp/test1"
```

Flex JSON 構造は直近送信（messageId `62953573-...`）を踏襲し、`action.uri` のみ差し替え。配信API は引き続き **本番 Worker** (`https://line-harness.kei-01261026.workers.dev/api/friends/{friendId}/messages`)、Bearer は本番 `LINE_HARNESS_API_KEY`、friendId は `09382cd1-e5d5-453e-ad2d-82d1e2adf52f`、altText は「LP実機確認（ステージング・新LIFF）」。

### Step 5: 実機確認

1. オーナー端末で Flex 受信 → 「LPを開く」タップ
2. LIFF ラッパURL なので **LINE 内蔵ブラウザで開く**ことが保証される
3. LIFF が `liff.state` 付きで `/lp/test1` に着地 → `liff.init` → check-access → LP表示
4. ステージング DB の LP データが正しく描画されることを確認

## Critical Files Referenced

- `apps/worker/wrangler.toml:57-75` — staging 環境設定（変更しない）
- `apps/worker/src/index.ts:441-575` — `/lp/:slug` ハンドラ（変更しない）
  - 462-468行: liff_id 解決ロジック
- `apps/worker/src/routes/lp-pages.ts:66-132` — LP 作成 POST API スキーマ
- `packages/db/migrations/029_lp_pages.sql:5-47` — lp_pages テーブル定義
- `packages/mcp-server/src/tools/create-lp-page.ts:5-82` — MCP 経由作成（代替経路）

## Verification

1. **新 LIFF 作成完了**: LINE Developers Console で staging 用 LIFF が visible、Endpoint URL が staging Worker
2. **env 設定確認**: `wrangler secret list --env staging` で `LIFF_URL` が更新済み（値は表示されないが listing には出る）
3. **LP seed 確認**:
   ```bash
   npx wrangler d1 execute line-crm-staging --env staging --remote \
     --command "SELECT id, slug, name, is_active FROM lp_pages WHERE slug='test1'"
   ```
4. **Flex 送信成功**: curl 応答が `{ "success": true, "data": { "messageId": "..." } }`
5. **実機**: 「LPを開く」タップで LINE 内蔵ブラウザが開き、LP本体が表示される（404 にならない）
6. **任意**: `lp_views` 行が staging に追加されていること
   ```bash
   npx wrangler d1 execute line-crm-staging --env staging --remote \
     --command "SELECT id, line_user_id, accessed_at, access_result FROM lp_views ORDER BY accessed_at DESC LIMIT 5"
   ```

## Risks / Notes

- LIFF Endpoint URL の反映には数分のキャッシュ遅延がある場合がある
- staging Worker の secrets を更新したら再デプロイは不要（secret は次のリクエストから反映）。ただし `[env.staging.vars]` で wrangler.toml に書く場合はデプロイ必要
- staging LINE Login チャネルが本番と同じ場合、LIFF 認証は本番友だち状態でOK。別チャネルなら staging 友だちが必要

## Out of Scope（次タスク候補）

- staging D1 への friends / line_accounts seed（必要なら別タスク）
- LP HTML の watchdog／エラー可視化
- `/api/lp-pages` レスポンスへ `liffUrl` フィールド追加
