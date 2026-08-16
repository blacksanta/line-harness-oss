# Plan: LP管理画面プレビュー機能 issue 作成

## Context

LP（ランディングページ）機能は現在、Worker 側で `/lp/:slug` として公開されているが、管理画面 (`apps/web/src/app/lp-pages/page.tsx`) には **一覧表示・有効化/無効化・視聴ログ・削除しかなく、編集フォームもプレビュー導線もない**。

そのため運用者は:
- LPの中身（video URL / Markdown本文）を変更する前に「最終的にどう見えるか」を確認できない
- 公開URLを開いても LIFF 認証＋アクセス窓制御（absolute / relative / isActive）が走るため、管理者が手早く中身だけ確認することが困難

このissueでは、管理画面に **編集フォーム + 即時プレビュー + 新規タブで公開URLを開くプレビューボタン** を備えることを提案する。`gh issue create` で GitHub に登録するための下書きをここに置く。

実装そのものはこのplanのスコープ外（issueをトラッカーに登録するまで）。

## 前提: 関連オープンissue #10 との関係

issue [#10](https://github.com/blacksanta/line-harness-oss/issues/10)（OPEN）で `content_type` カラムを廃止し、`video_url` / `body` を任意・どちらか必須・両方ある場合は **動画→Markdownの順で描画** する統合が予定されている。

このプレビュー機能issueは **#10 のマージ後の仕様を前提** に書く。
- フォームで video URL と Markdown 本文の両方を扱える（contentType セレクタは不要）
- 即時プレビューは「動画があれば動画、本文があれば本文、両方あれば動画→本文の順」で描画する
- issue本文に「#10 のマージを前提とする」旨を明記し、依存関係を示す

## 既存資産の要点（issueに参考として書く）

- 管理画面（一覧）: `apps/web/src/app/lp-pages/page.tsx:1-239`
- API client: `apps/web/src/lib/api.ts:557-603`（`api.lpPages.list/get/update/delete/views`）
- Worker 公開ページ描画: `apps/worker/src/index.ts:440-600`（YouTube/Vimeo 埋め込み・Markdown→marked→DOMPurify）
- Worker 管理API: `apps/worker/src/routes/lp-pages.ts:1-263`（`PUT /api/lp-pages/:id` で部分更新可）
- DBスキーマ: `packages/db/schema.sql:628-666`、CRUDヘルパ: `packages/db/src/lp-pages.ts`
- 既存プレビュー実装パターン: `apps/web/src/components/flex-preview.tsx`（JSON→ビジュアル、エラー時は赤字、maxWidth調整）
- issueテンプレ: なし（`.github/ISSUE_TEMPLATE/` 未整備）

## issue 下書き

**リポジトリ:** `blacksanta/line-harness-oss`
**タイトル案:** `feat(lp): 管理画面にLP編集フォーム + プレビュー機能を追加`
**ラベル候補:** `enhancement` / `frontend` / `lp`（既存ラベルに合わせて要調整）

**本文（日本語・背景/要件/受け入れ条件付き）:**

```markdown
## 背景

LP（ランディングページ）機能は Worker 側で `/lp/:slug` として公開されているが、管理画面 (`apps/web/src/app/lp-pages/page.tsx`) は一覧表示・有効化切替・視聴ログ・削除のみで、**LPの中身を編集する画面も、内容を事前に確認する手段もない**。

- LPの作成・更新は現状 MCP Tool 経由でしか行えず、運用者がブラウザで完結できない
- 公開URL（`/lp/:slug`）は LIFF 認証＋アクセス窓（absolute / relative / isActive）の判定が走るため、管理者が単に中身を確認したいだけのケースで使えない
- 結果、video URL の差し替えや Markdown 本文の調整時に「どう見えるか」が事前に確認できず、本番公開後の修正が頻発する

> **依存:** このissueは #10（`content_type` 廃止・videoとMarkdownの統合）の **マージ後** を前提とする。先に #10 を完了させてから本作業に着手する。

## やること

`apps/web/src/app/lp-pages/` に **LP編集画面 + プレビュー機能** を追加する。

### 1. LP編集画面の追加
- ルート: `/lp-pages/:id/edit`（新規作成は `/lp-pages/new`）
- フォーム項目（#10 マージ後の構造に準拠）:
  - 基本: `name`, `slug`
  - コンテンツ: `videoUrl`（任意）, `body`（任意・Markdown）— **どちらか必須**
  - アクセス制御: `accessWindowMode`, `absoluteStartsAt`, `absoluteEndsAt`, `relativeDaysAfterFriendAdd`
  - リダイレクト: `expiredRedirectUrl`, `notFriendRedirectUrl`
  - その他: `lineAccountId`, `isActive`
- バリデーション: `videoUrl` と `body` がどちらも空の場合は保存不可（クライアント+サーバ）
- 保存: 既存の `api.lpPages.update(id, ...)` / `api.lpPages.create(...)` を利用
- 一覧画面 (`apps/web/src/app/lp-pages/page.tsx`) に「編集」ボタンを追加して遷移

### 2. 即時プレビュー（フォーム内インライン）
- 編集フォーム右側 or 下部に、入力中の `videoUrl` / `body` をリアルタイム描画するプレビューパネルを設置
- **描画順は公開LPと同じ**: `videoUrl` があれば動画 → `body` があれば Markdown を続けて描画
- video URL: YouTube/Vimeo URL を解析して `<iframe>` 埋め込み（`apps/worker/src/index.ts:522-535` の `videoEmbedUrl`/`youtubeId` ロジックを `packages/shared` などに切り出して共有）
- Markdown: `marked` + `DOMPurify` で HTML 化して描画（Worker と同じライブラリを使う）
- 参考実装パターン: `apps/web/src/components/flex-preview.tsx`（JSON→ビジュアル描画・エラー時赤字・maxWidth対応）

### 3. 新規タブで公開URLを開くプレビューボタン
- 編集フォームに「公開URLでプレビュー」ボタンを設置
- 押下で `/lp/:slug?preview=<token>` を新規タブで開く
- `preview=<token>` が付いている場合、Worker 側 (`apps/worker/src/index.ts:441` `app.get('/lp/:slug')` および `/api/lp-pages/:id/check-access`) は:
  - `isActive`・アクセス窓（absolute/relative）・友だち判定をバイパス
  - 視聴ログ（`lp_views`）への記録もスキップ
- トークンは管理画面の認証セッションから生成（短時間有効・サーバー署名）。実装はシンプルに HMAC で良い

## 受け入れ条件

- [ ] `/lp-pages/:id/edit` でLPを編集して保存できる（既存の一覧から「編集」ボタンで遷移）
- [ ] `/lp-pages/new` で新しいLPを作成できる
- [ ] `videoUrl` と `body` がどちらも空の場合、フォーム側で保存ボタンを押せない（またはエラー表示）
- [ ] 編集フォームに即時プレビューパネルがあり、`videoUrl` / `body` の入力変更がリアルタイムで反映される（300ms程度のデバウンスは可）
- [ ] 即時プレビューが、動画のみ / 本文のみ / 動画+本文の3パターンすべてで公開LPと同じ順序・見た目で描画される
- [ ] 「公開URLでプレビュー」ボタンで新規タブが開き、`isActive=false` や期限切れ・友だち未登録の状態でもLP本体が表示される
- [ ] プレビューモードのアクセスでは `lp_views` に記録が残らない
- [ ] プレビュー用トークンは認証セッションが無いと生成できず、短時間（例: 10分）で失効する
- [ ] 既存の Worker 公開ページ (`/lp/:slug` の通常アクセス) の挙動には影響しない（既存テスト `services/lp-pages.test.ts` がパス）

## 参考ファイル

- 管理画面 一覧: `apps/web/src/app/lp-pages/page.tsx:1-239`
- API client: `apps/web/src/lib/api.ts:557-603`
- Worker 公開ページ: `apps/worker/src/index.ts:440-600`
- Worker 管理API: `apps/worker/src/routes/lp-pages.ts:1-263`
- DBスキーマ: `packages/db/schema.sql:628-666` / `packages/db/src/lp-pages.ts`
- 既存プレビューパターン: `apps/web/src/components/flex-preview.tsx`
- アクセス判定: `packages/db/src/lp-pages.ts` 内 `isLpAccessible`

## 補足

- video URL 解析ロジック（`videoEmbedUrl` / `youtubeId`）は現状 Worker 内のインラインJSにあるため、共通化して `packages/shared` から両方が import できるようにすると即時プレビューの実装が安定する
- 「即時プレビュー」と「公開URLでプレビュー」は用途が違う:
  - 即時プレビュー = 編集中の未保存状態を確認
  - 公開URLでプレビュー = 保存済みデータが実運用環境で（アクセス制御を除いて）どう見えるか確認
- 将来的に「下書き保存」「リビジョン」を入れる際の足場にもなる
```

## 実行手順（plan承認後）

1. `gh issue create` を `blacksanta/line-harness-oss` リポジトリに対して実行する
   - `--title "feat(lp): 管理画面にLP編集フォーム + プレビュー機能を追加"`
   - `--body` は heredoc で上記マークダウンを渡す
   - ラベルは事前確認: `gh label list -R blacksanta/line-harness-oss` で存在するラベルだけ付ける
2. 作成されたissueのURLをユーザーに返す

## 検証

- `gh issue view <番号>` で内容が想定通りか確認
- リポジトリのIssuesタブで表示確認（必要ならユーザーがブラウザで確認）

## このplanで実装しないこと

- 実装そのもの（編集フォーム・即時プレビュー・トークン発行endpointなど）はissueのスコープであり、別途実装作業を行う
