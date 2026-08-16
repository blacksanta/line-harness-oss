# LP 変更を 2 つの PR に分けて staging にマージ&デプロイ

## Context

直前の作業で **2 つの異なる LP 関連変更** が現在のローカル作業ツリーに混在している：

1. **YouTube タイトルバー非表示 fix**（コミット済み `c094495`、現ブランチ `fix/lp-youtube-titlebar` 上、対象は `apps/worker/src/index.ts`）
2. **管理画面 LP 編集・プレビュー機能**（未コミット、`apps/web/**` および `pnpm-lock.yaml`）

ユーザーは「履歴をきれいに保つため、2 つは別 PR に分けて両方とも staging にマージしてデプロイしたい」と判断。CLAUDE.md のフロー（`feature/* / fix/*` → PR → `staging` → 実機確認 → `main`）に沿い、Merge commit 方式で staging に取り込む。

### ゴール

- 2 つの独立した PR を staging に向けて作成
- 両 PR を Merge commit でマージ
- GitHub Actions（deploy-pages / deploy-worker）が自動発火し、Cloudflare Pages と Worker の staging 環境が更新される
- `https://staging.line-harness-admin-134f68c9.pages.dev` で LP 編集UI / カウントダウン / YouTube タイトルバー非表示の動作確認ができる状態にする

### 非ゴール

- main への反映（ユーザーは実機確認後に別途依頼する想定）
- `.env.local.devonly` の Git 管理（untracked のまま放置。今回の変更には巻き込まない）

## 現状の確認

```
ブランチ: fix/lp-youtube-titlebar
  └ c094495 fix(lp): YouTube タイトルバー... (staging の HEAD a2dcca5 から 1 コミット先行)

未コミット変更（LP 編集機能）:
  M apps/web/package.json          ← marked, dompurify 追加
  M apps/web/src/app/lp-pages/page.tsx
  M apps/web/src/lib/api.ts
  M pnpm-lock.yaml
  ?? apps/web/src/app/lp-pages/edit/        (新規)
  ?? apps/web/src/app/lp-pages/new/         (新規)
  ?? apps/web/src/components/lp-pages/      (新規 4ファイル)
  ?? apps/web/src/lib/lp-video.ts           (新規)
  ?? apps/web/.env.local.devonly            ← コミットしない
```

### デプロイトリガー

| ワークフロー | 発火条件 | 影響する PR |
|---|---|---|
| `.github/workflows/deploy-pages.yml` | `apps/web/**` 等の変更を含む push to `main`/`staging` | PR2 (LP editor) |
| `.github/workflows/deploy-worker.yml` | `apps/worker/**` 等の変更を含む push to `main`/`staging` | PR1 (YouTube fix) |

両 PR ともパスフィルタにマッチするため、staging マージ時に自動で各々のワークフローが発火する見込み。

## 手順

### 1. LP 編集機能を `staging` 起点の新ブランチに分離

```bash
# 未コミット変更を untracked 含めて退避
git stash push -u -m "lp-editor-wip" -- \
  apps/web/package.json \
  apps/web/src/app/lp-pages/page.tsx \
  apps/web/src/lib/api.ts \
  pnpm-lock.yaml \
  apps/web/src/app/lp-pages/edit \
  apps/web/src/app/lp-pages/new \
  apps/web/src/components/lp-pages \
  apps/web/src/lib/lp-video.ts

# staging を最新化して新ブランチを切る
git fetch origin
git checkout -b feat/lp-editor-ui origin/staging

# 退避を戻して該当ファイルだけステージ（.env.local.devonly は除外）
git stash pop
git add \
  apps/web/package.json \
  apps/web/src/lib/api.ts \
  apps/web/src/lib/lp-video.ts \
  apps/web/src/app/lp-pages/page.tsx \
  apps/web/src/app/lp-pages/new \
  apps/web/src/app/lp-pages/edit \
  apps/web/src/components/lp-pages \
  pnpm-lock.yaml
git status   # .env.local.devonly が untracked のままなことを確認
```

### 2. PR2 用コミット & push

```bash
git commit -m "$(cat <<'EOF'
feat(lp): 管理画面にLP編集・プレビュー機能を追加

- /lp-pages/new で新規作成、/lp-pages/edit?id=xxx で編集が可能に
- 右カラムにスマホ枠（375px）のリアルタイムプレビュー
  - タイトル / 動画埋め込み / Markdown / カウントダウン
- marked + DOMPurify で Markdown 描画（XSS 対策込み）
- 既存の MCP ツール経路（create_lp_page / manage_lp_pages）は維持

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin feat/lp-editor-ui
```

### 3. PR2 を staging に向けて作成

```bash
gh pr create \
  --base staging \
  --head feat/lp-editor-ui \
  --title "feat(lp): 管理画面にLP編集・プレビュー機能を追加" \
  --body "$(cat <<'EOF'
## Summary
- 管理画面 \`/lp-pages\` に新規作成 (\`/lp-pages/new\`) と編集 (\`/lp-pages/edit?id=xxx\`) を追加
- 左カラム：フォーム / 右カラム：375px スマホ枠のリアルタイムプレビュー
- プレビュー：タイトル・動画埋め込み (YouTube/Vimeo)・Markdown 本文・カウントダウンを公開LPと同じ見た目で再現
- Markdown は \`marked\` でパース、\`DOMPurify\` でサニタイズ（XSS対策）
- 既存の MCP ツール (\`create_lp_page\` / \`manage_lp_pages\`) は引き続き動作

## Test plan
- [ ] staging で \`/lp-pages\` から「+ 新規作成」→ 動画URLとMarkdownを入れてプレビューが即時反映されることを確認
- [ ] 保存後、一覧→「編集」リンクで再度開いて値が復元されることを確認
- [ ] 既存LPの有効/無効・削除・視聴ログが従来通り動くことを確認
- [ ] 本文に \`<script>\` を入れてもプレビューでスクリプトが発火しない (DOMPurify)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 4. 元の `fix/lp-youtube-titlebar` を PR1 として送る

```bash
git checkout fix/lp-youtube-titlebar
# 既に origin/fix/lp-youtube-titlebar に c094495 まで push 済み（git status で確認済）
# push 不要

gh pr create \
  --base staging \
  --head fix/lp-youtube-titlebar \
  --title "fix(lp): YouTube タイトルバー/「YouTube で見る」を非表示にする" \
  --body "$(cat <<'EOF'
## Summary
- \`.video-wrap iframe\` セレクタが Plyr 配下の iframe にも適用されてしまい、Plyr が iframe を拡大してタイトルバーをマスクするインラインスタイルを打ち消していた
- セレクタを \`.video-wrap > iframe\` に絞り、Plyr のスタイルを尊重する
- \`.plyr\` にも \`overflow:hidden\` を明示

## Test plan
- [ ] staging で動画つきLPを開き、再生中に YouTube のタイトル / チャンネル / 「YouTube で見る」が見えないことを確認
- [ ] フォールバック用の直挿し iframe（Plyr 非対応動画）でも従来どおりの見た目であることを確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 5. 両 PR をマージ（Merge commit 方式）

PR1 → PR2 の順でマージする。PR1 マージで staging が進んでも、PR2 にコンフリクトは出ない想定（変更ファイルが排他）。

```bash
gh pr merge <PR1番号> --merge --delete-branch=false
gh pr merge <PR2番号> --merge --delete-branch=false
```

ブランチ削除はユーザーの好みに任せる方が安全なので `--delete-branch=false` で実行。

### 6. デプロイ確認

```bash
# 直近の deploy ワークフロー run を確認
gh run list --workflow=deploy-pages.yml --branch=staging -L 3
gh run list --workflow=deploy-worker.yml --branch=staging -L 3

# 万一 path フィルタで発火しなかった場合のフォールバック（CLAUDE.md 記載）
# gh workflow run deploy-pages.yml --ref staging
# gh workflow run deploy-worker.yml --ref staging
```

### 7. 動作確認（ユーザー側で実施）

- `https://staging.line-harness-admin-134f68c9.pages.dev/lp-pages`
  - 「+ 新規作成」「編集」ボタンが表示される
  - 新規作成画面で入力したものが右側スマホ枠に即反映される
- staging 環境の公開LP（`/lp/:slug`）で動画再生中に YouTube タイトルバーが消えている

## 注意事項

- **`.env.local.devonly`** は untracked。ステージするファイルを明示指定して巻き込まないこと
- **force push 禁止**（CLAUDE.md）。stash → 新ブランチ作成→ stash pop の流れで対応
- **PR は `staging` を base** にすること。間違って main にすると CLAUDE.md 違反
- **PR2 のブランチベース**は `origin/staging` 起点。PR1 (`fix/lp-youtube-titlebar`) は元々 staging より 1 コミット先行しているが、独立したブランチなので PR2 とは衝突しない
- **マージ順**: PR1 が先でも PR2 が先でも問題ない（変更ファイルが排他）。順序にこだわらない
