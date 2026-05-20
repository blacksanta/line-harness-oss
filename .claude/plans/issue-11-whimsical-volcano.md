# issue #11 — staging への commit & デプロイ

## Context

issue #11（LP動画埋め込みを Plyr に置き換える）の実装は完了済み。
- ブランチ: `feature/lp-plyr-player`（staging 起点）
- 変更ファイル: `apps/worker/src/index.ts`（+26 / -49 行）
- 状態: 未コミット（`git status: M src/index.ts`）
- ビルド: `pnpm --filter worker build` 成功確認済み

CLAUDE.md のブランチ運用ルール（`main` への直接 push 禁止、feature → PR → staging → 実機確認 → main）に従い、PR 経由で staging にマージして自動デプロイを発火させる。

### デプロイ workflow の path フィルタ確認結果

CLAUDE.md には "staging でデプロイが発火するパスは `apps/web/**`, `packages/shared/**`, `.github/workflows/deploy-pages.yml` のみ" と書かれているが、これは `deploy-pages.yml`（Cloudflare Pages = admin/LIFF 静的サイト）の話。
LP `/lp/:slug` は Worker 側なので別ワークフロー `.github/workflows/deploy-worker.yml` の対象であり、こちらは以下を監視する：

```
paths:
  - 'apps/worker/**'
  - 'packages/db/**'
  - 'packages/shared/**'
  - 'packages/line-sdk/**'
  - '.github/workflows/deploy-worker.yml'
```

今回の変更は `apps/worker/src/index.ts` なので、**staging への push で Worker デプロイは自動発火する**。Pages デプロイは発火しないが、今回は不要。

## 手順

### 1. コミット作成（feature/lp-plyr-player）

- 対象: `apps/worker/src/index.ts` のみ（`apps/web/.env.local.devonly` は untracked のままにする — devonly 環境変数で誤コミット禁止）
- メッセージ案（CLAUDE.md のコミット規約を踏襲し、最近の `feat(lp): ...` 風）:
  ```
  feat(lp): 動画埋め込みを Plyr に置き換え (closes #11)

  YouTube IFrame API + 自前オーバーレイUI(.video-overlay/.play-btn) を
  廃止し、Plyr 3.7.8 CDN による共通プレイヤーUIに統一。Vimeo も同じ
  Plyr UI で再生されるようになり、約60行のCSS/JSが削減される。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

### 2. リモートに push

```sh
git push -u origin feature/lp-plyr-player
```

### 3. staging への PR を作成・マージ

```sh
gh pr create --base staging --head feature/lp-plyr-player \
  --title "feat(lp): 動画埋め込みを Plyr に置き換え (closes #11)" \
  --body "..."
# 確認後
gh pr merge --merge --delete-branch
```

PR body には issue #11 のリンクと受け入れ条件チェックリストを含める。

### 4. デプロイ確認

- `gh run watch` または `gh run list --workflow=deploy-worker.yml --branch=staging --limit=1` で `deploy-worker.yml` が走ったことを確認
- path フィルタで発火しない場合のみ `gh workflow run deploy-worker.yml --ref staging` で手動起動
- デプロイ完了後、staging Worker URL（`https://line-harness-staging.<account>.workers.dev/lp/<slug>` または独自ドメイン）で `/lp/:slug` を開く

### 5. 受け入れ条件の実機検証（手動）

issue #11 のチェックリスト：
- [ ] YouTube LP が Plyr UI で再生
- [ ] Vimeo LP も Plyr UI で再生
- [ ] サムネイル（maxresdefault.jpg）表示
- [ ] YouTube 標準UI（ロゴ・関連動画）非表示
- [ ] DevTools で旧 `.video-overlay` / IFrame API `<script>` が存在しない
- [ ] iPhone Safari の LIFF で playsinline 再生
- [ ] CSP / mixed content 警告なし

## main へのマージ

本タスクの範囲外。staging で実機確認が完了したら別途 `staging → main` の PR を作成する（CLAUDE.md フロー）。

## 範囲外（コミットしない / 触らない）

- `apps/web/.env.local.devonly`（untracked / 環境変数の devonly ファイル）
- `.claude/plans/issue-11-whimsical-volcano.md`（本プランファイル自体）
- 既存の typecheck エラー（`webhook.ts`/`event-bus.ts`/テスト 4 ファイル — 本 issue とは無関係）
