# LP 読み込み中スピナー問題：LIFF ラッパURL で再送テスト

## Context

前タスク（LP 機能 + 実機確認用 Flex 送信）は配信成功までは完了したが、オーナー端末で「LPを開く」ボタンをタップすると `https://line-harness.kei-01261026.workers.dev/lp/test1` がいつまでも「読み込み中…」のままになる。原因は LIFF の初期化／ログインがハングしている可能性が高い。

LP のインライン JS（`apps/worker/src/index.ts:540-568`）は以下の順で動作する:
1. `liff.init({ liffId })`
2. `liff.isLoggedIn()` が false なら `liff.login({ redirectUri: location.href })`
3. `/api/lp-pages/by-slug/:slug` → `/api/lp-pages/:id/check-access` を fetch
4. 結果に応じて render / redirect

LINE のメッセージから **生の HTTPS URL** で開くと LIFF コンテキスト（`liff.state` クエリ）が確立されないまま `liff.login` が走り、リダイレクト後も同じ生URL に戻ってきて二度目もログイン未確立、というループに陥る。これが「ずっとぐるぐる」の正体と推測。

最小修正としては **LINE メッセージ内の LP リンクを LIFF ラッパURL (`https://liff.line.me/{LIFF_ID}/lp/test1`) に差し替えて再送**するだけで解消する見込み。コード変更は今回行わない（ユーザー指示）。

## Approach

1. LIFF Endpoint URL が `https://line-harness.kei-01261026.workers.dev`（ルート）になっていることをユーザーに確認してもらう（現状ユーザー回答からは「ベースURL + LIFF ID = `2009591417-cNMUKb3E`」と読める）。**もし「`/lp/test1` まで含めた具体 URL を Endpoint に登録している」状態であれば、LIFF ラッパURL は `https://liff.line.me/2009591417-cNMUKb3E`（path なし）で開く。** 設定形態に応じて差し込む URL を切り替える。
2. オーナー宛に Flex を**もう一通**送る。ボタンの `action.uri` を LIFF ラッパURL に変更し、テスト配信バナーは引き続き付与。
3. ユーザーが LINE 端末でタップ → LIFF が `liff.state` 付きで `/lp/test1` に到達 → 認証済み状態で `liff.init` 完了 → check-access 200 → コンテンツ表示、を確認する。

## Concrete Steps

### Step 1: Endpoint URL 構成の確認

ユーザーに LINE Developers Console > LIFF (`2009591417-cNMUKb3E`) > Endpoint URL の値を確認してもらう。以下の 2 パターンで送信URLが変わる:

- パターン A: Endpoint URL = `https://line-harness.kei-01261026.workers.dev`
  → 送信 URL: `https://liff.line.me/2009591417-cNMUKb3E/lp/test1`
- パターン B: Endpoint URL = `https://line-harness.kei-01261026.workers.dev/lp/test1`
  → 送信 URL: `https://liff.line.me/2009591417-cNMUKb3E`

汎用性と将来の複数 LP を考えるとパターン A が推奨。

### Step 2: 修正版 Flex を送信

`apps/worker/src/index.ts:441-575` には触らず、curl で本番 API（`POST /api/friends/{friendId}/messages`）に直接送る。

- friendId: `09382cd1-e5d5-453e-ad2d-82d1e2adf52f`（前タスクで確定）
- API base: `https://line-harness.kei-01261026.workers.dev`
- Bearer: `.mcp.json` の `LINE_HARNESS_API_KEY`

Flex は前回送信したものを踏襲し、ボタンの `action.uri` のみ LIFF ラッパURL に差し替える。altText は「LP実機確認のお願い（リトライ）」として前回と区別する。

### Step 3: 実機確認

1. オーナー端末の LINE トークに新しい Flex が届く
2. 「LPを開く」タップ → LIFF が起動 → `/lp/test1?liff.state=...` に着地
3. `「啓太公式LINE」` をフォロー済みなので `check-access` が `allowed=true` を返す
4. ページに LP コンテンツ（または `expired_redirect_url` への遷移）が表示される

## Critical Files Referenced

- `apps/worker/src/index.ts:441-575` — LP HTML テンプレート（今回は変更しない、構造把握用）
- `apps/worker/src/routes/lp-pages.ts:119-126` — `publicUrl` は生URL を返す（将来 `liffUrl` 追加を別タスクで検討）
- `apps/worker/src/routes/lp-pages.ts:215-261` — check-access のレスポンス仕様

## Verification

1. curl の応答が `{ success: true, data: { messageId: "..." } }`
2. LINE 通知が届き、Flex のボタンが見える
3. ボタンタップ後、ブラウザURL が `https://line-harness.kei-01261026.workers.dev/lp/test1?liff.state=...` に遷移し、LP 本体（タイトル + 動画/Markdown）が表示される
4. 任意: `lp_views` 行が追加されていること
   ```bash
   npx wrangler d1 execute line-crm --env production --remote \
     --command "SELECT id, line_user_id, accessed_at, access_result FROM lp_views ORDER BY accessed_at DESC LIMIT 5"
   ```

## Out of Scope（次タスク候補）

- LP HTML の watchdog タイマー／可視化エラー追加（直接URL でも自力リカバリ可能にする）
- `/api/lp-pages` レスポンスに `liffUrl` フィールドを追加し、配信フローを標準化
- MCP `create_lp_page` / `send_message` を本番MCPロード後にクリーンに呼び出せるようにする手順整備
