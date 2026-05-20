# upstream（Shudesu/line-harness-oss）の更新を取り込む

## Context

このリポジトリ（`blacksanta/line-harness-oss`）はフォークで、フォーク元（`Shudesu/line-harness-oss`）が15コミット先行している。最終的に `main` に取り込みたいが、プロジェクトの運用ルール（CLAUDE.md）で main 直push は禁止、`staging` 経由での PR が必須。

### 現状

| 指標 | 値 |
|---|---|
| origin/main vs upstream/main | こちら 4 先行、upstream 15 先行（diverged） |
| origin/staging vs origin/main | staging が 19+ コミット先行（LP機能多数）、main が 2 コミット先行（issueテンプレ） |
| upstream の追加コミット | 4 件（うち `377d8f5` は 282 ファイル変更の大物） |

### 取り込み戦略（決定済み）

- upstream リモートを **永続的に追加**（今後の継続 sync 用）
- **merge** を使う（rebase はしない / force push 不可）
- **`staging` を base に作業ブランチを切る** → staging の独自機能と upstream を同時に整合 → staging 実機確認 → main PR

## 手順

### Step 1: upstream リモート登録

```bash
git remote add upstream https://github.com/Shudesu/line-harness-oss.git
git fetch upstream
```

### Step 2: 同期用作業ブランチを staging から作成

```bash
git checkout staging
git pull --ff-only origin staging
git checkout -b chore/sync-upstream-20260520
git merge upstream/main
# → 競合発生で停止
```

### Step 3: 競合解消（ファイル別方針）

| ファイル | 方針 |
|---|---|
| `.github/workflows/deploy-pages.yml` | **`--ours` 維持**（Cloudflare Pages 用の blacksanta 版）。upstream の gh-pages 版は取り込まない |
| `.github/workflows/deploy-worker.yml` | **`--ours` 維持**（staging deploy 分岐含む blacksanta 版） |
| `.gitignore` | **手動 union**（`.dev.vars`、`.claude/worktrees/` 等両方残す） |
| `apps/web/tsconfig.tsbuildinfo` | **削除 + ignore 維持**（upstream が誤って commit している） |
| `apps/web/src/components/layout/sidebar.tsx` | **手動 union**（`/lp-pages` + upstream 追加メニュー） |
| `apps/web/src/lib/api.ts` | **手動 union**（`lpPages` API + upstream の broadcast/pool 等） |
| `apps/worker/src/index.ts` | **手動 union**（route 登録は両方残す。`/lp/` SPA fallback 必ず保持） |
| `apps/worker/src/middleware/auth.ts` | **手動 union**（公開許可ルールを統合） |
| `apps/worker/wrangler.toml` | **手動 union**（upstream の `run_worker_first`/cron を取り込み、**blacksanta の本番 account_id / database_id は絶対保持**） |
| `packages/db/schema.sql` | **手動 union**（`lp_pages` `lp_views` + upstream 追加カラム） |
| `packages/db/src/index.ts` / `packages/sdk/src/index.ts` / `packages/sdk/src/types.ts` | **手動 union**（export 追記のみ） |
| `packages/db/migrations/029_*.sql` | **両ファイル残置**。番号 029 が `lp_pages.sql`（blacksanta）と `account_management_v2.sql`（upstream）で重複するが、ファイル名が異なるため git 衝突は発生しない。upstream 自身も同番号併存運用 |

### Step 4: ビルド・型検証（push 前必須）

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r build
pnpm -r test
```

### Step 5: PR 作成（staging 向け）

```bash
git push -u origin chore/sync-upstream-20260520
gh pr create --base staging \
  --title "chore: sync upstream/main (v0.14.0 + booking/events/inflow-links)" \
  --body "..."
```

### Step 6: staging 実機確認

`apps/web/**` と `.github/workflows/deploy-pages.yml` を含むので staging への merge で Pages deploy が発火するはず。発火しなければ:

```bash
gh workflow run deploy-pages.yml --ref staging
```

確認項目（`staging.line-harness-admin-134f68c9.pages.dev`）:
- 既存 LP ページの動画再生・期限カウントダウン・LP blocks エディタ
- リッチメニュー画面、予約（/booking/*）、イベント、inflow-links（upstream 新機能）
- webhook 署名検証強化、一斉配信（dedup_priority）、シナリオ詳細（delivery_mode）

D1 マイグレーション適用（staging）:
```bash
npx wrangler d1 execute line-crm-staging --remote \
  --file packages/db/migrations/029_account_management_v2.sql
# 030〜045 まで順次適用（既存適用済みはスキップ確認）
```

### Step 7: staging → main 反映

実機確認 OK 後:

```bash
gh pr create --base main --head staging \
  --title "chore: promote staging to main (upstream v0.14.0 sync 含む)"
```

## ロールバック方法

- **マージ作業中**: `git merge --abort` → ブランチ削除
- **staging 取り込み後に問題発覚**: `gh pr revert <PR番号>` で revert PR を作成（直 push / force push 不可）
- **main 反映後の本番障害**: main へ revert PR を即時作成。D1 の ADD COLUMN 系は逆方向影響なし。upstream 内に DROP/RENAME が無いことは Step 3 の `packages/db/migrations/029_account_management_v2.sql` 精読時に再確認

## 主要リスク

1. **D1 schema 変更の論理競合**: SQLite の CHECK 制約 ALTER は table 再構築を伴う可能性。upstream の migration 内容を Step 3 で必ず精読
2. **Cloudflare Pages の branch 設定喪失**: `deploy-pages.yml` で誤って upstream 版を採用すると staging 基盤が消える。`--ours` 明示が絶対
3. **Worker route 順序**: `run_worker_first = true` 追加と `/lp/` SPA fallback の相互作用

## Critical Files

- `/Users/nakatani/works/line-harness-oss-blacksanta/.github/workflows/deploy-pages.yml`
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/src/index.ts`
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/src/middleware/auth.ts`
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/wrangler.toml`
- `/Users/nakatani/works/line-harness-oss-blacksanta/packages/db/schema.sql`
- `/Users/nakatani/works/line-harness-oss-blacksanta/packages/db/migrations/029_*.sql`
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/web/src/lib/api.ts`
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/web/src/components/layout/sidebar.tsx`

## 検証完了の定義

- staging プレビューで blacksanta 固有機能（LP blocks、視聴期限カウントダウン、LP編集）と upstream 新機能（LIFF booking、events、inflow-links、リッチメニュー）の両方が動作
- typecheck / build / test 全パス
- D1 staging に upstream マイグレーションを適用し、既存データが破損していない
- staging → main の PR をマージし、本番ドメインで主要画面が正常表示
