# staging環境に7日間視聴可能な動画LPを1件作成

## Context

ユーザーから「友だち登録から7日間視聴できる動画LP」の作成依頼。**staging環境**への作成。

コードベース調査の結果、既存のLPシステム（PR #9 / #10 / #13で実装済み）が要件を完全にサポート済み。

- `accessWindowMode: "relative"` + `relativeDaysAfterFriendAdd: 7` を指定すれば、各友だちの `friends.created_at` を起点に7日間だけ視聴可能なLPを生成できる
- 期限切れ判定はサーバー側 (`packages/db/src/lp-pages.ts:50-86` の `isLpAccessible()`) で実施
- LIFFラッパー (`apps/worker/src/index.ts:594-647`) がクライアント側カウントダウン＋自動リダイレクトを提供

しかし現在の `.mcp.json` の `line-harness` MCPサーバーは **production** API (`https://line-harness.kei-01261026.workers.dev`) を指しているため、staging に作成するには **MCPサーバーの追加登録が必要**。

## 実行内容

### Step 1: `.mcp.json` に staging用MCPサーバーを追加

`/Users/nakatani/works/line-harness-oss-blacksanta/.mcp.json` の `mcpServers` に `line-harness-staging` エントリを追記する。

```json
{
  "mcpServers": {
    "line-harness": {
      "command": "node",
      "args": ["/Users/nakatani/works/line-harness-oss-blacksanta/packages/mcp-server/dist/index.js"],
      "env": {
        "LINE_HARNESS_API_URL": "https://line-harness.kei-01261026.workers.dev",
        "LINE_HARNESS_API_KEY": "134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e"
      }
    },
    "line-harness-staging": {
      "command": "node",
      "args": ["/Users/nakatani/works/line-harness-oss-blacksanta/packages/mcp-server/dist/index.js"],
      "env": {
        "LINE_HARNESS_API_URL": "https://line-harness-staging.kei-01261026.workers.dev",
        "LINE_HARNESS_API_KEY": "134f68c967a698f59487294b45bc693ef173737033a73fe3efb5226b9ade8e9e"
      }
    }
  }
}
```

差分：
- 追加: `line-harness-staging` キー
- `LINE_HARNESS_API_URL` は staging worker (`line-harness-staging.kei-01261026.workers.dev`)
- API キーは production と共通（ユーザー確認済み）

### Step 2: Claude Code の再起動を案内

`.mcp.json` の変更を反映するには **Claude Code セッションの再起動が必要**。

ユーザーに以下を案内：
> `.mcp.json` を更新しました。Claude Code を再起動して新しいMCPサーバー `line-harness-staging` を読み込ませてください。再起動後は `mcp__line-harness-staging__create_lp_page` ツールが利用可能になります。

### Step 3: 再起動後の新セッションで LP を作成

再起動後、ユーザーが「先ほどのLPを作って」等で続行した場合、`mcp__line-harness-staging__create_lp_page` を以下の引数で呼び出す。

| 引数 | 値 |
|---|---|
| `name` | `テストLP` |
| `videoUrl` | `https://youtu.be/dQw4w9WgXcQ?si=endZuuII5oBIV0QE` |
| `body` | 下記テンプレ |
| `accessWindowMode` | `relative` |
| `relativeDaysAfterFriendAdd` | `7` |
| `expiredRedirectUrl` | `https://example.com`（`example.com` は zod `.url()` のため `https://` を補完） |

#### Markdown 本文テンプレ案

```markdown
# 7日間限定公開

ご登録ありがとうございます。

この動画は **友だち登録から7日間** だけ視聴できる特別なコンテンツです。
カウントダウンが 0 になると自動で視聴ページから移動しますので、お時間のあるときにぜひご覧ください。
```

### Step 4: 接続確認の予備手段

万一 staging Worker URL の推定 (`https://line-harness-staging.kei-01261026.workers.dev`) が誤っていてMCP接続に失敗した場合：

1. `apps/worker/wrangler.toml` の `[env.staging]` 設定を再確認
2. Cloudflare ダッシュボードで Worker の実URLを確認
3. `.mcp.json` の URL を修正して再起動

## ファイル変更

| ファイル | 変更内容 |
|---|---|
| `.mcp.json` | `mcpServers.line-harness-staging` エントリを追加（既存の `line-harness` はそのまま残す） |

コード本体は変更なし。既存のMCPツール／APIを再利用する。

## Verification

- [ ] `.mcp.json` が正しいJSON構文であること（`jq` でパース確認）
- [ ] Claude Code 再起動後、`mcp__line-harness-staging__*` という新しいツール群が利用可能になっていること
- [ ] `create_lp_page` のレスポンスで `success: true` が返ること
- [ ] レスポンスの `publicUrl` に `line-harness-staging` ドメインが含まれること（productionに誤作成していないことの確認）
- [ ] staging管理画面 `https://staging.line-harness-admin-134f68c9.pages.dev/lp-pages` で「テストLP」が表示され、期限欄が `友だち登録から / 7日間` であること
- [ ] （任意）LIFF経由で動画が再生され、残り日数カウントダウンが表示されること

## 注意点

- 既存の `line-harness`（production）エントリは **削除せず** に共存させる。production への作業も今後発生するため
- API キーは staging / production 共通だが、各環境のWorkerがそれぞれの D1 (`line-crm` / `line-crm-staging`) を参照するため、誤って production に書き込むリスクは低い
- 動画URLの `?si=...` パラメータは Plyr の `youtubeId()` 抽出関数が無視するので問題なし
- `notFriendRedirectUrl` 未指定なので、友だち以外がアクセスした場合も `expiredRedirectUrl` (`https://example.com`) にリダイレクトされる
