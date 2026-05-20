# staging 環境用に Worker / D1 / R2 をフル分離する

## Context

直前の作業で staging ブランチを Cloudflare Pages のプレビュー環境としてデプロイする仕組みは構築済み（PR #5 マージ、`staging.line-harness-admin-134f68c9.pages.dev` で稼働中）。しかし以下の重大な問題が判明：

- staging Pages の `NEXT_PUBLIC_API_URL` は **本番 Worker URL（`https://line-harness.kei-01261026.workers.dev`）に固定** されている（`.github/workflows/deploy-pages.yml:32`）
- Worker は main ブランチのみ本番デプロイされる（`deploy-worker.yml:7`）、`[env.staging]` 設定なし
- 結果として **staging で実機確認すると本番 D1（`line-crm`）/本番 R2（`line-harness-images`）に書き込まれる**

ユーザーの意思決定：
- **分離範囲：フル分離**（Worker + D1 + R2 を全部 staging 用に別途用意）
- **外部 API（LINE / Stripe / 広告プラットフォーム）：今は未定**（plan に課題として記載、別途検討）
- **初期データ：本番スナップショットを初回のみコピー**

完了後の到達状態：staging ブランチへの push で、本番から独立した Worker / D1 / R2 にデプロイされ、本番データを汚染せずに実機確認できる。

---

## 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `apps/worker/wrangler.toml` | `[env.staging]` セクション追加（別 Worker 名・別 D1 ID・別 R2 バケット） |
| `.github/workflows/deploy-worker.yml` | `staging` ブランチを trigger に追加、`--env` をブランチに応じて切替 |
| `.github/workflows/deploy-pages.yml` | ブランチに応じて `NEXT_PUBLIC_API_URL` を切り替え |
| `CLAUDE.md` | staging Worker URL も含めて運用フローを更新 |

GitHub Actions Variables（リポジトリ設定で追加）：
- `NEXT_PUBLIC_API_URL_STAGING` … staging Worker の URL（後述）

---

## 実装手順

### Phase 1: Cloudflare 側のリソース作成（手動・wrangler CLI）

本番と同じ Cloudflare アカウント（`fe67ee32ff09d65511ba69bfd049bef5`）に staging 用リソースを作成。

```bash
# staging D1 作成
npx wrangler d1 create line-crm-staging
# → 返ってきた database_id を控える（後で wrangler.toml に記載）

# staging R2 バケット作成
npx wrangler r2 bucket create line-harness-images-staging
```

Worker 名は wrangler.toml の `[env.staging]` で指定する（後述）。デプロイ後に `https://line-harness-staging.<account-subdomain>.workers.dev` で公開される想定。

### Phase 2: `apps/worker/wrangler.toml` に staging 環境を追加

既存の `[env.production]` の下に以下を追記（Phase 1 で控えた database_id を埋める）：

```toml
# ═══════════════════════════════════════════════════════════════
# Staging 環境（本番と同一 account、リソースは別）
# 使い方: npx wrangler deploy --env staging
# ═══════════════════════════════════════════════════════════════
[env.staging]
name = "line-harness-staging"
account_id = "fe67ee32ff09d65511ba69bfd049bef5"

[env.staging.assets]
directory = "dist/client"
binding = "ASSETS"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "line-crm-staging"
database_id = "<Phase1で取得した staging D1 ID>"

[[env.staging.r2_buckets]]
binding = "IMAGES"
bucket_name = "line-harness-images-staging"

[env.staging.triggers]
crons = ["*/5 * * * *"]
```

### Phase 3: マイグレーション適用（手動・初回のみ）

`packages/db/migrations/` の SQL を staging D1 に順次適用：

```bash
# 全マイグレーション適用例（既存ファイル名に依存）
for f in packages/db/migrations/*.sql; do
  npx wrangler d1 execute line-crm-staging --env staging --remote --file "$f"
done
```

※ マイグレーション運用は現状 `wrangler d1 migrations` ではなく直接 `execute` する方式（既存運用に合わせる）。

### Phase 4: 本番スナップショットを staging に初回コピー

```bash
# 本番をダンプ
npx wrangler d1 export line-crm --env production --remote --output prod-snapshot.sql

# staging にインポート（テーブル再作成回避のため、必要ならDROP/CREATE調整）
npx wrangler d1 execute line-crm-staging --env staging --remote --file prod-snapshot.sql
```

⚠️ **個人情報の取り扱い注意**：email、LINE userId、決済情報がそのまま staging に入る。後述「課題」セクションでマスキング戦略を別途検討。

### Phase 5: Worker を staging にデプロイ

```bash
pnpm --filter @line-crm/shared --filter @line-crm/line-sdk --filter @line-crm/db build
pnpm --filter worker build
npx wrangler deploy --env staging --config apps/worker/wrangler.toml
```

→ デプロイ完了後に表示される URL（`https://line-harness-staging.kei-01261026.workers.dev` 想定）を控える。

### Phase 6: GitHub Actions Variable 追加

リポジトリ Settings → Secrets and variables → Actions → Variables：

- `NEXT_PUBLIC_API_URL_STAGING` = Phase 5 で取得した staging Worker URL

### Phase 7: `.github/workflows/deploy-worker.yml` を staging 対応

変更点：
- `on.push.branches` に `staging` を追加
- `--env` をブランチに応じて切替（main → production、staging → staging）

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main, staging]
    paths: [...既存のまま]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      DEPLOY_ENV: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
    steps:
      # ...checkout 等は既存のまま
      - run: pnpm --filter worker build
        env:
          CLOUDFLARE_ENV: ${{ env.DEPLOY_ENV }}
          # VITE_* は staging で別値にしたい場合は変数を分ける（後述課題）

      - uses: cloudflare/wrangler-action@v3
        env:
          CLOUDFLARE_ENV: ${{ env.DEPLOY_ENV }}
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/worker
          command: deploy --env ${{ env.DEPLOY_ENV }}
```

### Phase 8: `.github/workflows/deploy-pages.yml` を branch-conditional に

```yaml
- run: pnpm --filter web build
  env:
    NEXT_PUBLIC_API_URL: ${{ github.ref_name == 'main' && vars.NEXT_PUBLIC_API_URL || vars.NEXT_PUBLIC_API_URL_STAGING }}
```

### Phase 9: `CLAUDE.md` を更新

直前のセッションで作成した `CLAUDE.md`（PR #6 で staging へマージ済み）に以下を追記：

- staging Worker URL（`https://line-harness-staging.kei-01261026.workers.dev`）
- staging Pages から staging Worker へ繋がる構成図
- D1（`line-crm-staging`）/ R2（`line-harness-images-staging`）の名前
- マイグレーションは本番・staging 両方に適用が必要なこと

### Phase 10: 動作確認

1. staging ブランチに変更を push → `deploy-worker.yml` と `deploy-pages.yml` の両方が走ることを確認
2. `https://staging.line-harness-admin-134f68c9.pages.dev` で実機確認、Network タブで API リクエストが `line-harness-staging.*.workers.dev` 宛になっていることを確認
3. テストデータを書き込み → staging D1 に入り、本番 D1 には入らないことを確認（`wrangler d1 execute ... --remote --command "SELECT ..."` で両方確認）

---

## ⚠️ 未解決の課題（plan に明記、別途対応）

### 1. 外部 API キー（LINE / Stripe / 広告プラットフォーム）

現状 staging Worker でも本番と同じ API キー/シークレットが secret から渡る。これにより：

- **LINE Messaging API**: テスト配信が**本物のユーザー（友だち追加済みアカウント）に届く**
- **Stripe**: 本番モードキーだとテスト決済が**実際に課金される**
- **広告プラットフォーム**: テストコンバージョンが本番計測に混入

最低限の暫定運用：
- Stripe → サンドボックスキー（テストモード）を `STRIPE_SECRET_KEY_STAGING` で持って secret 分離
- LINE → staging では「友だち追加リスト」を社内ダミーアカウントに限定する運用ルール、または staging 用に別 LINE チャネルを開設
- 広告プラットフォーム → staging からのコンバージョン送信を環境変数でブロックする

→ Phase 1〜10 完了後に別 issue/PR として対応する。

### 2. マイグレーション運用

現状マイグレーションは手動 `wrangler d1 execute --remote --file` で適用しており、本番と staging で**同じファイルを両方に適用する手順が文書化されていない**。

検討事項：
- マイグレーション適用を CI に組み込むか（`deploy-worker.yml` 内で `wrangler d1 migrations apply`）
- 適用順序の管理（既存のファイル名規則 `001_...` は連番だが `009_delivery_type.sql` と `009_token_expiry.sql` のように番号重複あり）

→ 当面は手動運用、ルールを CLAUDE.md に追記して回避。

### 3. 個人情報マスキング

Phase 4 の本番スナップショット投入で個人情報がそのまま staging に入る。GDPR / 個人情報保護法上のリスク。

検討事項：
- email を `xxx@staging.local` でハッシュ置換
- LINE userId をハッシュ化（ただしハッシュ化すると配信テストができなくなる）
- 決済関連テーブル（Stripe customer_id, payment_method_id）はクリア

→ Phase 4 を実施する**前**に最小限のマスキング SQL を用意する。

---

## 検証方法

- Phase 5 後: `curl https://line-harness-staging.kei-01261026.workers.dev/health` 等のヘルスチェック
- Phase 7-8 後: staging ブランチに dummy commit を push（path 条件に該当するファイルを変更） → GitHub Actions の Deploy Worker / Deploy Pages 両方が成功すること
- Phase 10: staging Pages の Network タブで API URL が staging Worker を指していること、書き込み操作が本番 D1 に影響しないこと（本番側で `SELECT COUNT(*)` 等で差分確認）

---

## 参考ファイルパス

- 既存 wrangler 設定: `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/wrangler.toml`
- Worker デプロイ: `/Users/nakatani/works/line-harness-oss-blacksanta/.github/workflows/deploy-worker.yml`
- Pages デプロイ: `/Users/nakatani/works/line-harness-oss-blacksanta/.github/workflows/deploy-pages.yml`
- マイグレーション: `/Users/nakatani/works/line-harness-oss-blacksanta/packages/db/migrations/`
- 既存 CLAUDE.md（staging ブランチで先行マージ済み、未 main マージ）: `/Users/nakatani/works/line-harness-oss-blacksanta/CLAUDE.md`
