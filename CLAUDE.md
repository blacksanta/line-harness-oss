# プロジェクト指示

## ブランチ運用フロー

このプロジェクトは Cloudflare Pages にデプロイされており、ブランチごとに役割が分かれています。

| ブランチ | 役割 | デプロイ先 |
| --- | --- | --- |
| `main` | 本番 | Production（本番ドメイン） |
| `staging` | 実機確認用のプレビュー | https://staging.line-harness-admin-134f68c9.pages.dev |
| `feature/*` / `fix/*` / `chore/*` / `docs/*` | 作業ブランチ | デプロイなし |

### 標準フロー

```
feature/xxx ──PR──▶ staging ──(実機確認OK)──▶ main (本番)
```

1. `main` から作業ブランチを切る（例: `feature/lp-xxx`）
2. 作業ブランチを `staging` に PR してマージ
3. `staging.line-harness-admin-134f68c9.pages.dev` で実機確認
4. 問題なければ `staging` を `main` に PR してマージ → 本番反映

### ルール

- **`main` への直接 push は禁止**。必ず PR 経由でマージする。
- 実機確認が必要な変更は、必ず `staging` を経由してから `main` に上げる。
- `staging` でデプロイが発火するパスは `apps/web/**`, `packages/shared/**`, `.github/workflows/deploy-pages.yml` のみ。これら以外の変更では `staging` デプロイは走らない。
- `staging` への初回 push が path フィルタで発火しない場合は `gh workflow run deploy-pages.yml --ref staging` で手動起動する。
- force push（`git push --force`）は `main` / `staging` に対して禁止。作業ブランチでも事前に確認する。

### デプロイ設定の場所

- ワークフロー定義: `.github/workflows/deploy-pages.yml`
- Cloudflare Pages プロジェクト名: `line-harness-admin-134f68c9`
- Production branch: `main`（Cloudflare Pages 側の設定）
