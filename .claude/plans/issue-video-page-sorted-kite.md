# LP機能：video型/page型を統合するIssueを起票する

## Context
ランディングページ（LP）機能は現在 `content_type = 'video' | 'page'` で2分岐しているが、ユーザーから「分ける必要はない、統合したい」との要望があった。

統合の方向性は以下に確定:
- **1ページ内に動画とMarkdown本文の両方を持てるようにする**（contentType を廃止）
- **破壊的変更OK**（既存データのマイグレーションは不要）

本タスクはこの統合作業を実装することではなく、**GitHub Issueとして起票する**ことが目的。実装は別チケットで行う想定。
issue起票は `gh-issue-create` スキルを利用する。

---

## 1. 起票するIssueの内容

### タイトル案
```
feat(lp): video型/page型を統合し、1つのLPで動画+Markdown両対応にする
```

### 本文構成

#### 概要 / 背景
現在 LP は `content_type` カラム（`'video' | 'page'`）で2型に分かれているが、コンテンツの設計上分ける必然性が薄い。1つのLPで「動画 + Markdown本文」を併用できるほうが表現の幅が広がるため、型を廃止して統合する。
**破壊的変更を許容**（既存LPデータは本番でまだ運用しておらず、マイグレーション不要）。

#### 統合後の仕様
- `content_type` / `contentType` フィールドは完全廃止
- `video_url` / `videoUrl`、`body` はそれぞれ任意（nullable）
- いずれか1つは必須（API / MCPバリデーションで担保）
- 両方指定された場合は **公開ページで「動画 → Markdown本文」の順** にレンダリング

#### 変更対象（実装時の参考ファイル一覧）
| 層 | ファイル | 変更点 |
|---|---|---|
| DB マイグレーション | `packages/db/migrations/029_lp_pages.sql` | 既存ファイルを修正（破壊的OKのため） or 新マイグレーション追加で `content_type` カラム削除 |
| DB スキーマ | `packages/db/schema.sql:634` | `lp_pages` から `content_type` 行削除 |
| DB 関数 | `packages/db/src/lp-pages.ts:6,11,17,110,123-158,160-228` | `ContentType` 型削除、`LpPage` から `content_type` 削除、`CreateLpPageInput` / `UpdateLpPageInput` から `contentType` 削除、INSERT/UPDATE SQL を書き換え |
| API 型 | `packages/sdk/src/types.ts:353,362,381,397` | `LpContentType` 削除、`LpPage` / `CreateLpPageInput` / `UpdateLpPageInput` から `contentType` 削除 |
| API ルート | `apps/worker/src/routes/lp-pages.ts:70-91,141,205,245-256` | バリデーション書き換え（`videoUrl` または `body` のどちらかは必須）、`check-access` のpayloadから `contentType` 削除（フロントで両方判定するため不要） |
| 公開LP HTML | `apps/worker/src/index.ts:570-590` | 分岐ロジック削除し、`videoUrl` があれば動画、`body` があればMarkdown を**順に描画**する形に変更 |
| 管理画面 | `apps/web/src/app/lp-pages/page.tsx:149` | `🎬 動画 / 📄 ページ` の二択表示を、`動画あり/本文あり` のバッジ複数表示に変更 |
| MCP create | `packages/mcp-server/src/tools/create-lp-page.ts:15-25` | `contentType` enum 引数を削除、`videoUrl` / `body` どちらか1つは必須である旨を description に明記 |
| MCP update | `packages/mcp-server/src/tools/manage-lp-pages.ts:16` | 同上 |
| テスト | `apps/worker/src/services/lp-pages.test.ts:9` | `content_type` 参照を削除 |

#### 受け入れ条件（Acceptance Criteria）
- [ ] DBから `content_type` カラムが消えている
- [ ] `LpContentType` / `ContentType` 型がコードベースから消えている
- [ ] LP作成APIで `videoUrl` のみ / `body` のみ / 両方 のいずれも作成できる
- [ ] LP作成APIで `videoUrl` も `body` も無い場合は400エラー
- [ ] 公開LP（`/lp/:slug`）で動画と本文の両方を持つLPが、動画→本文の順で表示される
- [ ] 管理画面（`/lp-pages`）で動画/本文の有無が一覧で分かる
- [ ] MCPツール `create_lp_page` / `manage_lp_pages` から `contentType` 引数が消えている
- [ ] 既存テストが通る（テスト内の `content_type` 参照は更新）

#### 補足（実装者向けメモ）
- 破壊的変更のため、stagingでDBを `wrangler d1 execute --remote --command "DROP TABLE lp_pages; DROP TABLE lp_views;"` 等でリセットしてからマイグレーションを再実行する方針で問題なし
- 公開LP HTMLの動画埋め込みロジック（YouTube IFrame Player API等）は既存の `apps/worker/src/index.ts:537-563, 567-592` をそのまま流用

---

## 2. 起票手順

### Step 1: `gh-issue-create` スキルが利用可能か確認
- `.github/ISSUE_TEMPLATE/` ディレクトリは未作成（事前確認済み）
- スキル仕様上、初回はテンプレート整備とIssues機能有効化も自動で行われる

### Step 2: gh-issue-create スキルを起動
- 上記の「タイトル」「本文」を引き渡す
- ラベル候補: `enhancement`, `breaking-change`, `lp`

### Step 3: 起票完了確認
- 返ってきたIssue URLをユーザーに提示

---

## 3. 検証
- 起票後、`gh issue view <番号>` で本文が意図通り反映されていることを確認
- ラベルが付与されていることを確認
- ユーザーに Issue URL を渡して内容確認してもらう

---

## 4. このタスクで触らないこと
- **実装はしない**。issue起票で完了
- `.github/ISSUE_TEMPLATE/` 配下のテンプレートは `gh-issue-create` スキルが必要に応じて整備する。手動で先に作らない
