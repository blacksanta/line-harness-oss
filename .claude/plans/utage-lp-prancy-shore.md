# UTAGE風 視聴期限付きLP 実装プラン

---

## 🔑 直近: Cloudflare API トークン受領 → Secrets/Vars 登録 → PR #1 マージ

### 進捗

- ✅ Step 1〜3: `wrangler.toml` / `deploy-worker.yml` / `deploy-pages.yml` 編集 → commit `27e6608` push 済
- ✅ Cloudflare API トークン受領（チャット経由）
- ⏳ Step 4: GitHub Secrets/Variables 登録 ← **今これ**
- ⏳ Step 5: (済) feature ブランチ push (commit `27e6608`)
- ⏳ Step 6: PR #1 を main にマージ
- ⏳ Step 7: Actions 起動確認
- ⏳ Step 8: 本番URL反映確認
- ⏳ Step 9: LP 実機テスト

### 今からやること (Plan承認後)

1. **Secrets / Variables を gh コマンドで登録** (6コマンド):
   - `gh secret set CLOUDFLARE_API_TOKEN` (受領したトークン)
   - `gh secret set CLOUDFLARE_ACCOUNT_ID` = `fe67ee32ff09d65511ba69bfd049bef5`
   - `gh variable set NEXT_PUBLIC_API_URL` = `https://line-harness.kei-01261026.workers.dev`
   - `gh variable set VITE_LIFF_ID` = `2009591417-cNMUKb3E`
   - `gh variable set VITE_BOT_BASIC_ID` = `@505svjog`
   - `gh variable set VITE_CALENDAR_CONNECTION_ID` = `` (空)
2. `gh secret list` / `gh variable list` で確認
3. **PR #1 を main にマージ** (`gh pr merge 1 --merge`)
4. **Actions の実行を `gh run watch` でフォロー** (タイムアウト10分)
5. 完了したら本番URL（`https://line-harness-admin-134f68c9.pages.dev/lp-pages`）と Worker (`/api/lp-pages`) を curl で確認
6. 結果をユーザーに報告

### ⚠️ セキュリティ注意

- 受領したトークンはこのチャットログに平文で残る → タスク完了後、Cloudflare Dashboard でローテート推奨
- トークンは GitHub Secret 登録時のみ使用し、それ以外の場所には保存しない
- このプランファイル / メモリ / git にトークン文字列を書き込まない

---

## 🎯 親タスク: main push = 本番デプロイ の CI/CD 整備 + PR #1 マージ + 実機テスト

### Context

これまで preview URL (`feature-expiring-lp-pages.line-harness-admin-134f68c9.pages.dev`) を介していたが、URLが長くて混乱の元 + 本番URLとの整合が取れない。「main = 本番」というシンプルな構造に揃えたい。

GitHub Actions で Worker / Pages 両方を main push 起動で自動デプロイ → 今後は PR をマージするだけで本番に反映される状態にする。

### 現状把握

| 項目 | 状態 |
|---|---|
| `.github/workflows/deploy-worker.yml` | 存在するが `command: deploy` が `--env production` 未指定（dev扱い） + secrets/vars 未設定で動かない |
| Pages 用 workflow | **無い** |
| GitHub Secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 未設定 |
| GitHub Variables | `VITE_LIFF_ID`, `VITE_BOT_BASIC_ID`, `VITE_CALENDAR_CONNECTION_ID` 未設定 |
| `apps/web/.env.production` | ローカル存在（`NEXT_PUBLIC_API_URL=...`）、`.gitignore` 対象なのでCIに渡らない → workflow 内で env 注入が必要 |
| `apps/worker/wrangler.toml` | `[env.production]` の `account_id` / `database_id` がプレースホルダ（`YOUR_ACCOUNT_ID` 等） |
| PR #1 | OPEN、`MERGEABLE` / `CLEAN` |

### キー判断: シークレット vs 識別子

OSS public リポジトリ (`blacksanta/line-harness-oss`) だが:
- **シークレット** = `CLOUDFLARE_API_TOKEN`, `LINE_CHANNEL_ACCESS_TOKEN` 等 → GitHub Secretsに格納、絶対コミットしない
- **識別子** = `account_id` (`fe67ee32ff09d65511ba69bfd049bef5`), `database_id` (`0a68f5ef-...`), Worker URL → API token無しでは何もできない、コミットしてもセキュリティ上問題なし

→ `[env.production]` の識別子は実値をコミット、これで CI 側のロジックが超シンプルになる。

### 実装ステップ

#### Step 1. `apps/worker/wrangler.toml` の `[env.production]` を実値にする

```diff
 [env.production]
-account_id = "YOUR_ACCOUNT_ID"
+account_id = "fe67ee32ff09d65511ba69bfd049bef5"

 [[env.production.d1_databases]]
 binding = "DB"
 database_name = "line-crm"
-database_id = "YOUR_D1_DATABASE_ID"
+database_id = "0a68f5ef-7ece-4b9a-9837-c3a8e87d9f6f"
```

Top-level (`[default]`) はプレースホルダのまま（OSSフォーク者が `pnpm setup-line-harness` で書き換える前提）。

#### Step 2. `.github/workflows/deploy-worker.yml` を修正

```yaml
# Line 42 修正:
-          command: deploy
+          command: deploy --env production
```

これで wrangler が `[env.production]` を読み、本番Worker (`line-harness.kei-01261026.workers.dev`) にデプロイされる。

#### Step 3. `.github/workflows/deploy-pages.yml` を新規作成

```yaml
name: Deploy Pages
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - 'packages/shared/**'
      - '.github/workflows/deploy-pages.yml'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @line-crm/shared build
      - run: pnpm --filter web build
        env:
          NEXT_PUBLIC_API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy apps/web/out --project-name=line-harness-admin-134f68c9 --branch=main
```

`--branch=main` で **Production deployment** として登録される (これが preview URL 問題の解消)。

#### Step 4. GitHub Secrets / Variables 登録 (ユーザー作業)

Cloudflare API Token を作成（https://dash.cloudflare.com/profile/api-tokens → "Create Token" → カスタム or "Edit Cloudflare Workers" テンプレート + 下記権限追加）:

- Account → Workers Scripts → Edit
- Account → D1 → Edit
- Account → Cloudflare Pages → Edit
- Account → Workers R2 Storage → Edit
- Account → Account Settings → Read

その後ターミナルから（`!` プレフィックスでこのチャットに実行する想定）:

```bash
! gh secret set CLOUDFLARE_API_TOKEN --body "<トークン文字列を貼る>"
! gh secret set CLOUDFLARE_ACCOUNT_ID --body "fe67ee32ff09d65511ba69bfd049bef5"
! gh variable set NEXT_PUBLIC_API_URL --body "https://line-harness.kei-01261026.workers.dev"
! gh variable set VITE_LIFF_ID --body "2009591417-cNMUKb3E"
! gh variable set VITE_BOT_BASIC_ID --body "@505svjog"
! gh variable set VITE_CALENDAR_CONNECTION_ID --body ""
```

#### Step 5. feature ブランチに workflow 変更を commit & push

```bash
git add apps/worker/wrangler.toml \
        .github/workflows/deploy-worker.yml \
        .github/workflows/deploy-pages.yml
git commit -m "ci: main push で Worker/Pages を本番自動デプロイ"
git push
```

PR #1 にこのコミットが追加される。

#### Step 6. PR #1 を main にマージ

```bash
gh pr merge 1 --merge --delete-branch=false
```

merge commit でマージ（squashだと履歴が潰れて feature の分割コミットが見えなくなるので非推奨）。ブランチは残しておいて手動削除（必要なら）。

#### Step 7. Actions の起動を確認

```bash
gh run list --limit 5
gh run watch  # 進行中ジョブをフォロー
```

期待: `Deploy Worker` と `Deploy Pages` の両方が走り、それぞれ成功する。

#### Step 8. デプロイ反映確認

- Worker: `curl https://line-harness.kei-01261026.workers.dev/api/lp-pages -H "Authorization: Bearer ..."` で 200 と LP 一覧
- Pages: `https://line-harness-admin-134f68c9.pages.dev/lp-pages` を **シークレットウィンドウ** で開く（キャッシュ回避）→ ランディングページ画面が出ること、APIキーログインが通ること

#### Step 9. LP 実機テスト（前回保留分）

Step 8 まで成功したら、前回保留した実機テストを再開:

1. ユーザーが `! cd apps/worker && npx wrangler d1 execute line-crm --remote --env production --json --command="SELECT id, line_user_id, display_name FROM friends ORDER BY created_at DESC LIMIT 10"` を実行
2. friend.id を教えてもらう
3. push API で LP URL 入りメッセージを送信:
   ```bash
   curl -X POST "https://line-harness.kei-01261026.workers.dev/api/friends/$FRIEND_ID/messages" \
     -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
     -H "Content-Type: application/json" \
     -d '{"messageType":"text","content":"テスト動画LPはこちら👉 https://line-harness.kei-01261026.workers.dev/lp/test1"}'
   ```
4. スマホLINEで受信 → タップ → LIFF経由動画再生
5. `lp_views` テーブルに `allowed` 行が記録されることを確認

### 関連ファイル

| パス | 変更種別 |
|---|---|
| `apps/worker/wrangler.toml` | `[env.production]` の識別子を実値に |
| `.github/workflows/deploy-worker.yml` | `command: deploy` → `command: deploy --env production` |
| `.github/workflows/deploy-pages.yml` | 新規 |

GitHub 側 (リポジトリではなく settings):
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variables: `NEXT_PUBLIC_API_URL`, `VITE_LIFF_ID`, `VITE_BOT_BASIC_ID`, `VITE_CALENDAR_CONNECTION_ID`

### 検証ゴール

- ✅ Step 7 で両 workflow が成功
- ✅ Step 8 で本番URL (`line-harness-admin-134f68c9.pages.dev`) に最新ビルドが反映
- ✅ Step 9 でスマホ実機テスト成功
- ✅ 以降、main に push するだけで Worker/Pages が自動デプロイされる

### この後

- Step 9 の実機テスト後、期限切れテスト (`UPDATE friends SET created_at = '2025-01-01...'`)
- preview URL ベースの運用は廃止、本番URLのみ使う
- feature ブランチは削除して main 一本運用に

---

## 🎯 旧タスク: テスト LP のスマホ実機確認

### Context

LP `test1`（`https://line-harness.kei-01261026.workers.dev/lp/test1`）は本番に作成済み。最後に必要なのは「自分のLINEに LP URL 入りメッセージを push 送信して、スマホで LIFF 経由の視聴フローを確認する」こと。

ブロッカー: 前セッション時点で本番 `friends` テーブルが空だった（ユーザーは友だち追加済みと申告したが webhook が到達していない可能性あり）。今回まず友だち登録状態を再確認 → friend.id 取得 → push 送信、の順で進める。

### 関連エンドポイント (既存コード調査済み)

- `apps/worker/src/routes/friends.ts:310` `POST /api/friends/:id/messages`
  - body: `{ messageType?: 'text', content: string, altText?: string }`
  - 内部で `autoTrackContent` がテキスト中の URL をトラッキングリンク `/t/<id>` に置換 → friend.line_user_id へ `pushMessage` → `messages_log` に outgoing 記録
  - ⚠️ LP URL は自動でトラッキングURLに置換される。スマホでタップ時に `/t/<id>` → `/lp/test1` へ302リダイレクト → LIFF起動 → check-access、と1ホップ増えるが機能上は問題なし。クリック計測も乗る。

### 実行手順

#### Step 1. 本番 friends を再確認

ユーザーが友だち追加したはずなので、まず本番 D1 を再 query する:

```bash
cd /Users/nakatani/works/line-harness-oss-blacksanta/apps/worker
npx wrangler d1 execute line-crm --remote --env production --json \
  --command="SELECT id, line_user_id, display_name, created_at FROM friends ORDER BY created_at DESC LIMIT 10"
```

**期待結果A: results に1件以上ある** → Step 2 へ。
**期待結果B: results が空** → webhook が動いていない。Step 1.5 へ。

#### Step 1.5. webhook 疎通確認 (Step 1 で空だった場合のみ)

LINE Developer Console の Webhook URL が `https://line-harness.kei-01261026.workers.dev/webhook` を指しているかユーザーに確認してもらう。

加えて、ユーザーが LINE 公式アカウントを「ブロック → ブロック解除」または別アカウントで再登録すると、follow webhook が発火し friends に行が入る。

`! curl -s "https://line-harness.kei-01261026.workers.dev/webhook" -X POST -H "Content-Type: application/json" -d '{}'` で 401/200 のどれを返すか確認してもいい (Hono ハンドラ到達確認)。

#### Step 2. friend.id を取得

Step 1 の JSON 結果から `display_name` がユーザー本人のもの（おそらく1人しかいないので最初の行）の `id` を控える。

#### Step 3. push メッセージ送信

```bash
FRIEND_ID="<Step 2 の id>"
curl -X POST "https://line-harness.kei-01261026.workers.dev/api/friends/$FRIEND_ID/messages" \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "messageType": "text",
    "content": "テスト動画LPはこちら👉 https://line-harness.kei-01261026.workers.dev/lp/test1"
  }'
```

期待: `{"success":true,"data":{"messageId":"..."}}`

#### Step 4. スマホ実機テスト

1. LINE アプリでメッセージ受信
2. URL タップ → トラッキングリンク経由 → LIFF 起動 → 動画再生
3. 失敗時のチェックポイント:
   - LIFF 初期化エラー → LINE Developer Console の LIFF Endpoint URL が `https://line-harness.kei-01261026.workers.dev/lp/` を含むか確認
   - 「友だちではありません」リダイレクト → friend.line_user_id と LIFF profile の userId が一致しているか
   - `lp_views` テーブルに `access_result` の記録があるか確認

```bash
cd apps/worker
npx wrangler d1 execute line-crm --remote --env production --json \
  --command="SELECT viewed_at, access_result, reason FROM lp_views ORDER BY viewed_at DESC LIMIT 5"
```

### 検証ゴール

- ✅ Step 1 で friend が見つかる
- ✅ Step 3 が `success:true` を返す
- ✅ スマホで動画が再生される
- ✅ `lp_views` に `allowed` の行が記録される

### この後

- 期限切れテスト: `UPDATE friends SET created_at = '2025-01-01...' WHERE id = '<FRIEND_ID>'` → 同URLが `expired_redirect_url` (https://example.com/expired) に飛ぶことを確認
- PR #1 を main マージ → main から再ビルド/デプロイで本番URL更新

---

## Context（なぜこれを作るのか）

UTAGE（utage-system.com）が提供している「視聴期限付きLP」は、たとえば「友だち登録から7日間だけ見られるセミナー動画」「6/1〜6/7だけ公開する特典ページ」のような、**期限が来たら自動で見られなくなる**ランディングページ機能です。

LINEマーケティング運用で「無料動画講座 → 期限切れ → 有料案内へリダイレクト」のようなファネル設計に必須で、現在このプロジェクト（line-harness-oss-blacksanta）には存在しない機能。これを既存の「フォーム機能」「トラッキングリンク機能」「シナリオ機能」のパターンを踏襲して実装します。

**達成したい状態**:
- 管理者がMCP経由でLPを作成 → 公開URLが発行される
- LINE友だちがそのURLをタップ → LIFF認証 → 期限内なら動画/ページ表示・期限切れなら別URLへリダイレクト
- 誰がいつ見たか記録される

---

## 全体像（アーキテクチャ）

```
[LINE友だち]
   │ URLタップ
   │ GET /lp/:slug
   ▼
[Worker] ──► LIFF初期化用の最小HTMLを返す（コンテンツ本体は含めない＝view-source対策）
   │
   │ ブラウザがLIFF初期化 → liff.getProfile() で lineUserId取得
   ▼
[client/lp.ts]
   │ POST /api/lp-pages/:id/check-access {lineUserId}
   ▼
[Worker]
   1. lineUserId → friend検索
   2. isLpAccessible(lp, friend) で期限判定
   3. 結果を lp_views に記録
   ▼
   ├─ allowed=true  → コンテンツ(video_url or 本文HTML)を返却 → ブラウザ描画
   └─ allowed=false → redirectUrl だけ返す → window.location.replace
```

**設計の肝**: コンテンツ本体は `/lp/:slug` のHTMLには載せず、LIFF認証後のAPIで取りに行く。これでviewing sourceや非友だちの`curl`でコンテンツが漏れない（既存のフォーム機能と同じ思想）。

---

## 確定要件

| 項目 | 仕様 |
|---|---|
| 期限の起点 | 友だち登録日から N 日間 / 絶対日時で公開〜終了 / 両方併用（AND） |
| コンテンツ形式 | YouTube/Vimeo埋め込み or Markdownページ |
| 期限切れ時 | 管理者指定の別URLへ302リダイレクト |
| アクセス制御 | LINE友だちのみ（LIFF経由）、未友だちは別URLへリダイレクト |
| 視聴トラッキング | 誰が・いつ・access_resultを `lp_views` に記録 |
| 本文編集 | Markdown記法（marked ライブラリで HTML 化） |
| 作り込み範囲 | MCPツール厚め、Web UIは一覧+視聴ログ参照の最小実装 |

---

## データモデル

### Migration: `packages/db/migrations/029_lp_pages.sql`（新設）

```sql
CREATE TABLE IF NOT EXISTS lp_pages (
  id TEXT PRIMARY KEY,
  line_account_id TEXT REFERENCES line_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'page')),
  video_url TEXT,
  body TEXT,                              -- Markdown

  access_window_mode TEXT NOT NULL CHECK (access_window_mode IN ('absolute', 'relative', 'both', 'none')) DEFAULT 'none',
  absolute_starts_at TEXT,                -- JST ISO8601
  absolute_ends_at TEXT,
  relative_days_after_friend_add INTEGER, -- 例: 7

  expired_redirect_url TEXT NOT NULL,
  not_friend_redirect_url TEXT,           -- NULLなら expired_redirect_url にフォールバック

  is_active INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_lp_pages_slug ON lp_pages(slug);
CREATE INDEX IF NOT EXISTS idx_lp_pages_account ON lp_pages(line_account_id);

CREATE TABLE IF NOT EXISTS lp_views (
  id TEXT PRIMARY KEY,
  lp_page_id TEXT NOT NULL REFERENCES lp_pages(id) ON DELETE CASCADE,
  friend_id TEXT REFERENCES friends(id) ON DELETE SET NULL,
  line_user_id TEXT,
  viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  user_agent TEXT,
  referrer TEXT,
  access_result TEXT NOT NULL CHECK (access_result IN ('allowed', 'expired', 'not_yet', 'not_friend', 'inactive')),
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_lp_views_page ON lp_views(lp_page_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_lp_views_friend ON lp_views(friend_id);
```

`packages/db/schema.sql` にも同じCREATE文を追記（新規環境でセットアップが揃うように、既存マイグレと同じ慣習）。

---

## 実装ファイル一覧

### 新規作成

| パス | 役割 | 雛形にするファイル |
|---|---|---|
| `packages/db/migrations/029_lp_pages.sql` | スキーマ定義 | `migrations/007_forms.sql` |
| `packages/db/src/lp-pages.ts` | CRUD + `isLpAccessible()` 純粋関数 | `packages/db/src/forms.ts` |
| `apps/worker/src/routes/lp-pages.ts` | 管理API + 公開API（check-access） | `apps/worker/src/routes/forms.ts` |
| `apps/worker/src/client/lp.ts` | LIFFクライアント（公開ページのフロント） | `apps/worker/src/client/form.ts` |
| `packages/sdk/src/resources/lp-pages.ts` | SDK リソース | `packages/sdk/src/resources/forms.ts` |
| `packages/mcp-server/src/tools/create-lp-page.ts` | MCP `create_lp_page` ツール | `tools/create-form.ts` |
| `packages/mcp-server/src/tools/manage-lp-pages.ts` | MCP `manage_lp_pages`（list/update/delete/get_views） | `tools/manage-forms.ts` |
| `apps/web/src/app/lp-pages/page.tsx` | 一覧 + 視聴ログ参照UI（最低限） | `apps/web/src/app/forms/page.tsx` |

### 既存ファイルへの追記

| パス | 追記内容 |
|---|---|
| `packages/db/schema.sql` | `lp_pages` / `lp_views` のCREATE文を追加 |
| `packages/db/src/index.ts` | `export * from './lp-pages';` |
| `apps/worker/src/index.ts` | `import { lpPages } from './routes/lp-pages.js'`, `app.route('/', lpPages)`, `GET /lp/:slug` のHTMLハンドラ |
| `apps/worker/src/middleware/auth.ts` | `/lp/`、`/api/lp-pages/by-slug/`、`/api/lp-pages/:id/check-access` を auth スキップに追加 |
| `apps/worker/vite.config.ts` | `build.rollupOptions.input` に `lp: 'src/client/lp.ts'` を追加 |
| `packages/sdk/src/types.ts` | `LpPage` / `LpView` / `CreateLpPageInput` / `UpdateLpPageInput` 型 |
| `packages/sdk/src/client.ts` | `this.lpPages = new LpPagesResource(this.http)` |
| `packages/sdk/src/index.ts` | 新型・リソースを export |
| `packages/mcp-server/src/tools/index.ts` | 新ツール2つの register 呼び出し |
| `apps/web/src/lib/api.ts` | `lpPages` API クライアント追加 |
| `apps/web/src/components/layout/sidebar.tsx` | `{ href: '/lp-pages', label: '視聴LP' }` 追加 |

---

## 期限判定ロジック（核心）

`packages/db/src/lp-pages.ts` に純粋関数として配置（テストしやすく、Workerからもバッチからも呼べる）:

```ts
export type AccessResult =
  | { allowed: true }
  | { allowed: false; reason: 'expired' | 'not_yet' | 'not_friend' | 'inactive'; redirectUrl: string };

export function isLpAccessible(
  lp: LpPage,
  friend: { id: string; created_at: string } | null,
  now: Date = new Date(),
): AccessResult {
  if (!lp.is_active) {
    return { allowed: false, reason: 'inactive', redirectUrl: lp.expired_redirect_url };
  }
  if (!friend) {
    return {
      allowed: false,
      reason: 'not_friend',
      redirectUrl: lp.not_friend_redirect_url ?? lp.expired_redirect_url,
    };
  }

  const nowMs = now.getTime();

  if (lp.access_window_mode === 'absolute' || lp.access_window_mode === 'both') {
    if (lp.absolute_starts_at && nowMs < new Date(lp.absolute_starts_at).getTime()) {
      return { allowed: false, reason: 'not_yet', redirectUrl: lp.expired_redirect_url };
    }
    if (lp.absolute_ends_at && nowMs > new Date(lp.absolute_ends_at).getTime()) {
      return { allowed: false, reason: 'expired', redirectUrl: lp.expired_redirect_url };
    }
  }

  if (lp.access_window_mode === 'relative' || lp.access_window_mode === 'both') {
    const days = lp.relative_days_after_friend_add ?? 0;
    const limit = new Date(friend.created_at).getTime() + days * 86_400_000;
    if (nowMs > limit) {
      return { allowed: false, reason: 'expired', redirectUrl: lp.expired_redirect_url };
    }
  }

  return { allowed: true };
}
```

**ポイント**: JST文字列 (`...+09:00`) は `new Date()` でそのまま正しいUTCエポックに変換される。 `friends.created_at` も同じ形式なので比較は単純。

---

## Worker ルート詳細

### 公開ルート

| メソッド | パス | 役割 |
|---|---|---|
| `GET` | `/lp/:slug` | LIFFラッパHTMLを返す（`Cache-Control: no-store`）。LP未存在/無効なら静的「ページが見つかりません」HTML |
| `GET` | `/api/lp-pages/by-slug/:slug` | LPメタ情報のみ返却（コンテンツ本体は含まない） |
| `POST` | `/api/lp-pages/:id/check-access` | `{lineUserId}` 受領 → friend検索 → `isLpAccessible` → `{allowed, redirectUrl, payload}` 返却 + `lp_views` 記録 + view_count++ |

### 管理API（auth必須）

| メソッド | パス |
|---|---|
| `GET` | `/api/lp-pages` |
| `GET` | `/api/lp-pages/:id` |
| `POST` | `/api/lp-pages` |
| `PUT` | `/api/lp-pages/:id` |
| `DELETE` | `/api/lp-pages/:id` |
| `GET` | `/api/lp-pages/:id/views` |

---

## LIFFクライアント（公開ページ）

`apps/worker/src/client/lp.ts`:

```ts
const slug = (window as any).__LP_SLUG__;
const liffId = (window as any).__LIFF_ID__;

async function main() {
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
  const profile = await liff.getProfile();

  const meta = await fetch(`/api/lp-pages/by-slug/${encodeURIComponent(slug)}`).then(r => r.json());
  if (!meta.success) { renderNotFound(); return; }

  const ck = await fetch(`/api/lp-pages/${meta.data.id}/check-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lineUserId: profile.userId }),
  }).then(r => r.json());

  if (!ck.success || !ck.data.allowed) {
    location.replace(ck.data.redirectUrl);
    return;
  }
  renderContent(meta.data, ck.data.payload);  // video iframe or markdown→HTML
}
main().catch(console.error);
```

### Markdown→HTML
- `marked` を CDN から読み込む（`<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js">`）
- `marked.parse(body)` で変換 → DOMPurify で sanitize → `innerHTML` に挿入
- DOMPurifyも CDN から（XSS対策）

### 動画埋め込み
- YouTube URL → `https://www.youtube.com/embed/{ID}` に変換
- Vimeo URL → `https://player.vimeo.com/video/{ID}` に変換
- レスポンシブ用に `padding-bottom: 56.25%` のラッパdivで囲む

---

## MCP ツール仕様（厚めに作る）

### `create_lp_page`

```ts
{
  name: z.string(),
  slug: z.string().optional(),  // 未指定ならランダム8文字を自動生成
  contentType: z.enum(['video', 'page']),
  videoUrl: z.string().url().optional(),
  body: z.string().optional(),  // Markdown
  accessWindowMode: z.enum(['absolute', 'relative', 'both', 'none']),
  absoluteStartsAt: z.string().optional(),  // ISO8601
  absoluteEndsAt: z.string().optional(),
  relativeDaysAfterFriendAdd: z.number().int().positive().optional(),
  expiredRedirectUrl: z.string().url(),
  notFriendRedirectUrl: z.string().url().optional(),
  lineAccountId: z.string().optional(),
}
```

レスポンスで `publicUrl: 'https://{worker}/lp/{slug}'` を必ず返す（ユーザーがすぐ共有できるように）。

### `manage_lp_pages`

actions: `list`, `get`, `update`, `delete`, `get_views`, `activate`, `deactivate`

---

## Web UI（最小実装）

`apps/web/src/app/lp-pages/page.tsx`:

- 一覧テーブル: 名前 / slug / 公開URL（コピーボタン） / 視聴件数 / 有効・無効トグル / 視聴ログボタン
- 「視聴ログ」モーダル: 友だち名、viewed_at、access_result の表
- **新規作成・編集はMCP経由を案内**（UIには「Claude Codeから `create_lp_page` で作成してください」のヘルプテキスト）

サイドバーに `{ href: '/lp-pages', label: '視聴LP' }` を追加。

---

## 設計上の注意点

| 論点 | 判断 |
|---|---|
| 動画URLの直接漏洩 | YouTube/Vimeo の iframe は `view-source` で抜けば直URLが取れる。**回避不能**な制約として `create_lp_page` の出力と管理画面に注意書きを表示（「動画URLそのものを知っている人は期限後も視聴可能。本格保護にはVimeo Proのドメイン制限を併用」）。UTAGE自体も同じ制約。 |
| 友だちでないユーザー | `not_friend_redirect_url` を別途設定可能。未指定なら `expired_redirect_url` にフォールバック。これで「未友だちは友だち追加導線へ誘導」できる。 |
| スラッグ | MCPツールが未指定時に `crypto.randomUUID().slice(0, 8)` で自動生成。UNIQUE制約で衝突時はエラー返却（再リトライはMCP側）。 |
| マルチアカウント | `lp_pages.line_account_id` でLPをアカウントに紐付け、`/lp/:slug` 表示時にそのアカウントの `liff_id` でLIFF初期化。1スラッグ=1アカウント。 |
| キャッシュ | `/lp/:slug` HTMLは `Cache-Control: no-store`（古い判定結果がエッジにキャッシュされないように）。 |
| LIFF採用理由 | 既存フォーム機能と認証パスが揃う。トークン方式だとURL漏洩で永久使い回し可能だが、LIFFなら毎回「LINEログイン中の友だち」を確認できる。トレードオフはPC閲覧不可だが、UTAGE的ユースケースでは許容。 |

---

## 検証手順（Verification）

1. マイグレーション適用
   ```bash
   cd /Users/nakatani/works/line-harness-oss-blacksanta
   pnpm wrangler d1 execute line-crm --local --file=packages/db/migrations/029_lp_pages.sql
   ```
2. 開発サーバ起動: `pnpm dev:worker` と `pnpm dev:web`
3. **MCP経由でLP作成**（Claude Codeから）:
   ```
   create_lp_page で
     name="テスト動画", slug="test1",
     contentType="video", videoUrl="https://www.youtube.com/watch?v=xxx",
     accessWindowMode="relative", relativeDaysAfterFriendAdd=7,
     expiredRedirectUrl="https://example.com/expired"
   ```
4. 自分のLINEで対象アカウントの友だちであることを確認
5. スマホで `https://{worker_url}/lp/test1` を開く → LIFFリダイレクト → 動画が再生されること
6. **期限切れテスト**: SQLで `UPDATE friends SET created_at = '2025-01-01T00:00:00.000+09:00' WHERE id = '...';` → 同URLが `expired_redirect_url` へ飛ぶこと
7. **absolute モード**: `absolute_ends_at` を1分後に設定 → 1分後にアクセスすると期限切れ動作
8. **both モード**: 両方を満たす期間だけ閲覧可、どちらか1つでも外れたらリダイレクト
9. **未友だちテスト**: 別アカウント（友だちでない）で開き、`not_friend_redirect_url` に飛ぶこと
10. `lp_views` テーブルで `access_result` が allowed/expired/not_friend で正しく分かれていることを確認
11. `isLpAccessible()` の vitest ユニットテスト（`packages/db/src/lp-pages.test.ts`）も書く: absolute/relative/both/none 各パターン + JST境界

---

## 実装順序（依存関係順）

| Phase | 内容 | 依存 | 目安 |
|---|---|---|---|
| **A** | Migration 029 + `schema.sql` 追記 | なし | 30分 |
| **B** | `packages/db/src/lp-pages.ts` (CRUD + `isLpAccessible`) + `index.ts` export + vitest | A | 2時間 |
| **C** | `apps/worker/src/routes/lp-pages.ts`（管理API + 公開API）+ index.tsへの登録 + auth スキップ調整 | B | 3時間 |
| **D** | `apps/worker/src/client/lp.ts` + `vite.config.ts` 入力追加 + `/lp/:slug` HTMLハンドラ | C | 3時間 |
| **E** | `packages/sdk` に LpPagesResource + 型 + client.ts への登録 | C | 1時間 |
| **F** | `packages/mcp-server` に `create_lp_page` / `manage_lp_pages` | E | 2時間 |
| **G** | `apps/web/src/app/lp-pages/page.tsx`（一覧+視聴ログ）+ sidebar nav + lib/api.ts | E | 2時間 |
| **H** | 手動E2Eテスト（検証手順 1〜10）| A〜G | 1時間 |

合計目安: 約14時間（1〜2営業日）。

---

## 次のタスクはこれ

**ローカル D1 にマイグレーション 029 を適用** します（本番は対象外、後で別途）。

### Context（なぜローカルだけか）
コードの実装と型チェックは済んでいるが、ローカル D1 にはまだ `lp_pages` / `lp_views` テーブルが存在しない。`pnpm dev:worker` で動作確認するためにローカルD1に適用する必要がある。本番DBは実機テストで問題ないことを確認してから適用したいので今回は対象外。

### 実行コマンド

apps/worker ディレクトリの `wrangler.toml` で `database_name = "line-harness"` がローカルD1に紐付いているため、worker 側から実行する:

```bash
cd apps/worker
npx wrangler d1 execute line-harness --local --file=../../packages/db/migrations/029_lp_pages.sql
```

### 検証コマンド

適用後、テーブルが作られたかを確認する:

```bash
cd apps/worker
npx wrangler d1 execute line-harness --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lp_%'"
```

期待結果: `lp_pages` と `lp_views` の2行が返る。

スキーマ確認:

```bash
cd apps/worker
npx wrangler d1 execute line-harness --local --command=".schema lp_pages"
```

### 注意点

- `--local` フラグは wrangler のローカル開発用 D1 (`.wrangler/state/v3/d1/`) を対象にする。本番 D1 (`--remote` または env=production) には触れない。
- マイグレーションは `CREATE TABLE IF NOT EXISTS` なので、もし既に適用済みでも安全に再実行できる（冪等）。
- ロールバックは未準備。スキーマミスがあれば `DROP TABLE lp_pages; DROP TABLE lp_views;` で巻き戻し可能。

### この後にやること

1. ✅ ローカルD1にマイグレーション適用
2. ✅ `pnpm dev:worker` 起動（http://localhost:5174）+ `apps/web/.env.local` 作成
3. ✅ ローカルD1に `schema.sql` 全体を流して 46テーブル作成（staff_members 等の基本テーブルが無かった対応）
4. ⏳ `apps/worker/.dev.vars` を作って API_KEY を設定（ローカル Worker のログインを通す）
5. ⏳ Web 管理画面で API キーを入力してログイン
6. ⏳ Claude Code から `create_lp_page` を呼んで LP 作成、`publicUrl` を確認
7. ⏳ スマホ LIFF で実機テスト（期限OK / 期限切れ / 未友だち の3パターン）
8. ⏳ 問題なければ本番D1にも適用 → コミット → PR

---

## Pages 反映方針 (確定済み)

### Context

`wrangler pages deploy` 実行時の git ブランチが `feature/expiring-lp-pages` だったので、Pages 上で **Preview deployment** として登録された。本番URL `https://line-harness-admin-134f68c9.pages.dev` は依然として `main` ブランチの古い deployment (commit `da5e12f`、5時間前) を指している。

### 採用方針: preview URL を使い続ける

LP機能を確認したいときは下記 preview alias URL を使う:

```
https://feature-expiring-lp-pages.line-harness-admin-134f68c9.pages.dev
```

このURLは `feature/expiring-lp-pages` ブランチに新しい deployment を上げる限り有効。

### 本番URL を更新したくなったタイミング

PR #1 を main にマージしたら、main をチェックアウトして再 build → `--branch=main` で deploy し直す。これで本番URLにも反映される。

### この後にやること

- ⏳ preview URL で「ランディングページ」が表示されることをユーザー確認
- ⏳ メッセージ送信 → スマホ実機テスト
- ⏳ PR #1 レビュー → main マージ → main から再 build/deploy (本番URL更新)

---

## Web Pages デプロイ + GitHub push（完了済み）

### Context

ユーザーから2点の指摘:
1. **GitHub に push されていない** — feature/expiring-lp-pages ブランチに upstream 無し、未push
2. **管理画面に「ランディングページ」が出ない** — 本番 Pages (`https://line-harness-admin-134f68c9.pages.dev`) は5時間前のビルドのまま

CI/CD ワークフローには `.github/workflows/deploy-worker.yml` のみで Pages 用が無い。Web は手動 deploy する必要あり。`apps/web/next.config.ts` は `output: 'export'` 設定済み。

### 実行手順

#### A. Web Pages を手動デプロイ

```bash
# 1. shared を build しないと web build が import エラー
pnpm --filter @line-crm/shared run build
# 2. Web 静的エクスポート
pnpm --filter web run build
# 3. Pages へアップロード
CLOUDFLARE_ACCOUNT_ID=fe67ee32ff09d65511ba69bfd049bef5 \
  npx wrangler pages deploy apps/web/out --project-name=line-harness-admin-134f68c9
```

完了後、`https://line-harness-admin-134f68c9.pages.dev/lp-pages` にアクセスして「ランディングページ」一覧 + 作成済み `test1` LP が表示されることを確認。

#### B. GitHub へ push + PR 作成

```bash
# 1. wrangler.toml にシークレットIDを書き込んでしまった件 — コミット前に整理
#    案1: そのまま commit (本番アカウントID等が公開される)
#    案2: 一旦 git restore して dev環境用は別管理 — gitignoreで管理する仕組みが無いので結構面倒
git status   # 状況再確認
# 案1で進めるなら:
git add apps/worker/wrangler.toml
git commit -m "chore(worker): set actual account_id and database_id in wrangler.toml"

# 2. push
git push -u origin feature/expiring-lp-pages

# 3. PR 作成
gh pr create --title "feat: 視聴期限付きランディングページ機能を追加" --body "..."
```

### wrangler.toml のシークレット問題

セッション中に `apps/worker/wrangler.toml` の account_id と database_id をプレースホルダーから実値に書き換えた:
- `account_id = "fe67ee32ff09d65511ba69bfd049bef5"`
- `database_id = "0a68f5ef-7ece-4b9a-9837-c3a8e87d9f6f"`

OSS リポジトリ (`blacksanta/line-harness-oss`) なので、これらをコミットすると公開される。create-line-harness 系の手順では各ユーザーがセットアップ時に書き換える前提のはず。git restore して元に戻し、ローカルだけ実値で持つ運用にすべき。

つまり:
- `git restore apps/worker/wrangler.toml` で元のプレースホルダーに戻す
- 自分のローカルでは実値を維持したい場合、git の skip-worktree や別ファイル管理などが必要

### 検証

- ✅ Pages デプロイ成功で `/lp-pages` ページが表示される
- ✅ サイドバーに「ランディングページ」が出る（モニター画面アイコン）
- ✅ 一覧に `test1` LP が表示される（本番DBから取得）
- ✅ feature ブランチが GitHub に上がる
- ✅ PR が作成される

### この後にやること

1. ✅ Web Pages 手動デプロイ
2. ✅ wrangler.toml 整理（コミット方針決定）
3. ✅ GitHub push + PR
4. ⏳ メッセージ送信（line_accounts カウント確認 → friend.id 取得 → push API → 実機テスト）

---

## 残りの本番作業（古い計画）

### Context

ユーザーから明示的に「本番デプロイをして実機テストする」と指示あり。コミット (`f3836a3`) と本番Workerデプロイ（Version `692064f9-ea62-4a56-a8a2-9fd9deb09d9c`）は完了。残り3ステップを順番に実行する。

### 完了済み

- ✅ コミット: `f3836a3`（feature/expiring-lp-pages）
- ✅ 本番Workerデプロイ: `https://line-harness.kei-01261026.workers.dev`

### 残ステップ

#### 1. 本番 D1 にマイグレーション 029 を適用

```bash
cd /Users/nakatani/works/line-harness-oss-blacksanta/apps/worker
npx wrangler d1 execute line-crm --remote --env production --file=../../packages/db/migrations/029_lp_pages.sql
```

CREATE TABLE IF NOT EXISTS なので既存データに影響なし。

#### 2. 本番に LP 作成

```bash
curl -X POST https://line-harness.kei-01261026.workers.dev/api/lp-pages \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "テスト動画LP",
    "slug": "test1",
    "contentType": "video",
    "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "accessWindowMode": "relative",
    "relativeDaysAfterFriendAdd": 7,
    "expiredRedirectUrl": "https://example.com/expired"
  }'
```

期待結果: `publicUrl: "https://line-harness.kei-01261026.workers.dev/lp/test1"` を返す。

#### 3. 自分の LINE userId / friend.id を取得 → メッセージ送信

A. friends 一覧から自分のアカウントを探す（display_name で目視確認）:

```bash
cd /Users/nakatani/works/line-harness-oss-blacksanta/apps/worker
npx wrangler d1 execute line-crm --remote --env production \
  --command="SELECT id, line_user_id, display_name FROM friends ORDER BY created_at DESC LIMIT 10"
```

B. 自分の friend.id を見つけたら、テキストメッセージで LP URL を送信:

```bash
FRIEND_ID="<取得した自分のfriend.id>"
curl -X POST "https://line-harness.kei-01261026.workers.dev/api/friends/$FRIEND_ID/messages" \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"type": "text", "text": "テスト動画LPはこちら👉 https://line-harness.kei-01261026.workers.dev/lp/test1"}
    ]
  }'
```

※ 実際のエンドポイント名は `apps/worker/src/routes/friends.ts` を見て合わせる必要あり。
※ もし API スキーマが違ったら `apps/worker/src/routes/chats.ts` の send 系も確認。

### 検証

- ✅ マイグレーション後に `lp_pages` / `lp_views` テーブルが存在する
- ✅ POST /api/lp-pages で 201 + publicUrl 返却
- ✅ 自分のLINEにメッセージが届く
- ✅ スマホでURLタップ → LIFF経由 → 動画再生（友だち判定OK）

### この後

- 期限切れテスト（friends.created_at を過去日に UPDATE）
- PR 作成 → main マージ

---

## 本番デプロイ + 実機テスト（古い計画 - 一部実施済み）

### Context

ローカル動作確認は完了。実機 LIFF テストにはスマホからアクセスできる URL が必要だが、ローカル localhost は外部アクセス不可、ngrok は未インストール、LIFF Endpoint URL もLINE Developer Consoleで本番Workerに固定済み。最短は **本番にデプロイして本番で実機テスト** すること。

### 実行手順

#### 1. コミット
```bash
git add -A
git status   # 確認
git commit -m "feat: 視聴期限付きランディングページ機能を追加"
```

含まれるべき変更:
- マイグレーション 029
- DB 層 + ロジック + テスト
- Worker route + LIFF HTML
- SDK + MCP ツール
- Web UI ラベル「ランディングページ」+ モニターアイコン
- `apps/web/.env.local`（gitignore済みなのでコミットされない）
- `apps/worker/.dev.vars`（gitignore済みなのでコミットされない）

#### 2. 本番 Worker デプロイ
```bash
cd apps/worker
npx wrangler deploy --env production
```

- 本番 Worker URL: `https://line-harness.kei-01261026.workers.dev`
- デプロイ後 `curl https://line-harness.kei-01261026.workers.dev/api/lp-pages` で 401（認証要）が返れば LP API が公開された証拠

#### 3. 本番 D1 にマイグレーション
```bash
cd apps/worker
npx wrangler d1 execute line-crm --remote --env production --file=../../packages/db/migrations/029_lp_pages.sql
```

- `--remote` フラグで本番 D1 を指す
- CREATE TABLE IF NOT EXISTS なので既存データ無影響

#### 4. 本番に LP 作成
```bash
curl -X POST https://line-harness.kei-01261026.workers.dev/api/lp-pages \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "テスト動画LP",
    "slug": "test1",
    "contentType": "video",
    "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "accessWindowMode": "relative",
    "relativeDaysAfterFriendAdd": 7,
    "expiredRedirectUrl": "https://example.com/expired"
  }'
```

期待結果: `publicUrl: "https://line-harness.kei-01261026.workers.dev/lp/test1"` が返る。

#### 5. 自分の LINE userId を確認

本番 friends DB から自分のアカウントを探す（display_name で絞り込み）:

```bash
cd apps/worker
npx wrangler d1 execute line-crm --remote --env production \
  --command="SELECT id, line_user_id, display_name FROM friends ORDER BY created_at DESC LIMIT 10"
```

または、ユーザーが自分の LINE userId を直接伝えてくれる。

#### 6. 自分のLINEに push メッセージ送信

LINE のメッセージ送信用APIエンドポイント（既存）を使う。送信先は friend_id（uuid）。本文に LP URL を含める:

```bash
FRIEND_ID="<自分のfriend.id>"
curl -X POST "https://line-harness.kei-01261026.workers.dev/api/friends/$FRIEND_ID/messages" \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"type": "text", "text": "テスト動画LPはこちら: https://line-harness.kei-01261026.workers.dev/lp/test1"}
    ]
  }'
```

※ 実際のエンドポイント名・リクエスト形式は既存コードを確認して合わせる。`apps/worker/src/routes/friends.ts` または `chats.ts` あたりで確認。

#### 7. スマホで実機確認
- LINE アプリで届いたメッセージの URL をタップ
- LIFF が起動 → 友だちなら動画再生、未友だちなら expired_redirect_url にリダイレクト

### 検証

- ✅ 本番 LP API 401 返却（公開された証拠）
- ✅ マイグレーション後 `SELECT name FROM sqlite_master WHERE name LIKE 'lp_%'` で2テーブル
- ✅ POST で LP 作成成功
- ✅ `/lp/test1` がLIFFラッパHTML返却
- ✅ メッセージが自分のLINEに届く
- ✅ LIFFで動画再生（友だちの場合）

### この後にやること

- 期限切れテスト（friends.created_at を古く UPDATE）
- 未友だちアカウントでの redirect 確認
- PR作成 → main マージ

---

## ローカル LP 作成テスト（完了済み）

### Context

ユーザーから「ローカル環境でランディングページを作って。slug=test1、YouTube動画 https://www.youtube.com/watch?v=dQw4w9WgXcQ、友だち登録から7日間視聴可、期限切れリダイレクトは https://example.com/expired」との依頼。

### 状況の問題点

1. **Worker が停止している**（task killed のため localhost:5174 で応答なし）→ 再起動が必要
2. **line-harness MCP が現セッションで使えない**（再起動後の deferred tools リストに含まれていない、接続失敗の可能性）→ MCP の `create_lp_page` を呼ぶ代わりに **curl で直接 API を叩く**方法で進める

### 実行手順

#### 1. Worker をバックグラウンド起動

```bash
pnpm --filter worker dev
```

5174 ポートで起動するまで待つ。

#### 2. curl で LP 作成

```bash
curl -X POST http://localhost:5174/api/lp-pages \
  -H "Authorization: Bearer 134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "テスト動画LP",
    "slug": "test1",
    "contentType": "video",
    "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "accessWindowMode": "relative",
    "relativeDaysAfterFriendAdd": 7,
    "expiredRedirectUrl": "https://example.com/expired"
  }'
```

期待結果: `{"success":true, "data":{ ..., "publicUrl":"http://localhost:5174/lp/test1" }}`

#### 3. 公開 URL の表示確認（ブラウザ・curl）

`http://localhost:5174/lp/test1` を curl で取得 → LIFF ラッパ HTML が返ること。実際の動画再生は LIFF が必要なのでスマホ実機テストは別途。

#### 4. 管理画面で確認

`http://localhost:3000/lp-pages` を開いて作成した LP が一覧に出ること。

### MCP の問題（後で対応）

MCP のローカル接続失敗原因の調査は後回し。考えられる原因:
- ローカルビルドが何らかの依存関係を解決できていない
- Claude Code 再起動時に MCP サーバ起動コマンドがエラー終了している
- ログを確認するには `~/.claude/logs/` などを見る必要あり

curl で動作確認できれば、MCP は npm に新バージョンを公開してから `@latest` を取り直す案も使える。

### 検証

- LP 作成 API が 201 を返すこと
- レスポンスに `publicUrl` が含まれること
- `/lp/test1` が LIFF ラッパ HTML を返すこと（404 ではない）
- 管理画面の一覧に表示されること

---

## サイドバーアイコン変更（完了済み）

### Context
ラベルを「ランディングページ」に変えたが、アイコンは元のビデオカメラ風のままで内容と合っていない。「モニター画面（デスクトップコンピューター）」アイコンに差し替えてLP=ウェブページを直感的に表現する。

### 変更箇所

ファイル: `apps/web/src/components/layout/sidebar.tsx`（27行目）

`icon` の path を Heroicons の `desktop-computer` に置換:

```
M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z
```

他のメニューと被っていないことを確認済み（モニター系アイコンは未使用）。

### 検証
ホットリロードでサイドバーのランディングページの行のアイコンが「モニター画面」になっていればOK。

---

## UI ラベル変更（完了済み）

### Context

ユーザーから「管理画面の表示『視聴期限LP』を『ランディングページ』に変更したい」との要望。`grep` で確認した結果、UI 文言として「視聴期限LP」が使われているのは Web 管理画面の **3 箇所のみ**。それ以外（DB スキーマのコメント、MCP ツールの説明文、Worker コード内コメント）は内部用なので変更不要。

### 変更箇所

| ファイル | 行 | 現在 | 変更後 |
|---|---|---|---|
| `apps/web/src/components/layout/sidebar.tsx` | 27 | `label: '視聴期限LP'` | `label: 'ランディングページ'` |
| `apps/web/src/app/lp-pages/page.tsx` | 107 | `<Header title="視聴期限LP" />` | `<Header title="ランディングページ" />` |
| `apps/web/src/app/lp-pages/page.tsx` | 128 | `まだ視聴期限LPがありません。...` | `まだランディングページがありません。...` |

### 触らないもの

- URL パス `/lp-pages`（変更すると既存ブックマーク等に影響）
- DB テーブル名 `lp_pages` / `lp_views`
- MCP ツール名 `create_lp_page` / `manage_lp_pages`
- 内部コメント（`packages/db/schema.sql`, `packages/db/migrations/029_lp_pages.sql` 等）
- MCP ツールの説明文（Claude 向け、ユーザーは見ない）

### 検証

- `pnpm dev:web` 起動済みなので変更後ホットリロードでサイドバーとページタイトルを確認
- 一覧が空のときの案内文も表示確認

---

## ローカル Worker のログイン設定（完了済み）

### Context（なぜ必要か）

ローカル Worker は `wrangler.toml` に `[vars]` セクションが無く、`.dev.vars` も未作成のため、`API_KEY` 環境変数が空。auth middleware が `token === c.env.API_KEY` で照合するが空文字との一致は起こらず、ローカル D1 の `staff_members` テーブルも空なので、**どんなキーを入れてもログイン不能**な状態。

`.dev.vars`（gitignore対象、ローカル開発専用の env ファイル）を作って Worker 起動時に env vars が読み込まれるようにする。

### 作成内容

ファイル: `apps/worker/.dev.vars`（新規、`.line-harness-setup.json` の値を流用）

```
API_KEY=134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e
LINE_CHANNEL_SECRET=2f3f197ad840ad436d91882746057b31
LINE_CHANNEL_ACCESS_TOKEN=vcRSN1xeOxWH1F10bRDR35C/qPlo7zj+Ym9y265mp7GJihsmUtVMXWg2RMJ/F2ZFgN8KWzVvP0ER0pCsYSRM2/Bg8o5SExJyZTbbH0hfGHCw6DzjP3xVw4ZWdrqds2IxkUNlMkqxYGRQTtdtgT8J5wdB04t89/1O/w1cDnyilFU=
LIFF_URL=https://liff.line.me/2009591417-cNMUKb3E
LINE_CHANNEL_ID=2009591335
LINE_LOGIN_CHANNEL_ID=2009591417
LINE_LOGIN_CHANNEL_SECRET=
WORKER_URL=http://localhost:5174
```

`LINE_LOGIN_CHANNEL_SECRET` は `.line-harness-setup.json` に無いため空にしておく（LP 機能では使わない。LIFF ログイン IDトークン検証時のみ必要）。

### 反映手順

1. `.dev.vars` 作成
2. 起動中の Worker を停止 → 再起動（`.dev.vars` は起動時に読み込まれる）
3. Web 管理画面（http://localhost:3000/login）で API キーを入力:
   - `134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e`
4. ダッシュボード（`/`）にリダイレクトされたらログイン成功
5. サイドバーの「視聴期限LP」（`/lp-pages`）でLP一覧を表示

### セキュリティ注意

- `.dev.vars` は **絶対にコミットしない**。`.gitignore` を確認し、含まれていなければ追記する。
- `.line-harness-setup.json` も同様（既に gitignore されているはず）。本番用シークレットなのでリポジトリに入れてはいけない。

---

## 今の進捗を全体像から整理するとこれ

- ✅ Phase 1（要件理解・既存コード調査）完了
- ✅ Phase 2（設計）完了
- ✅ Phase 3（実装）完了 — A〜H 全Phase完了、テスト14件通過、型チェックOK
- ✅ Phase 4（ローカルD1適用 + schema.sql 全体適用）完了
- ⏳ Phase 4.5（ローカル Worker .dev.vars 設定）— 今回のタスク
- ⏳ Phase 5（実機検証）
- ⏳ Phase 6（本番適用 + コミット）
