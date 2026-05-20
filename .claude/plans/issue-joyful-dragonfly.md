# Plan: LP視聴期限カウントダウンタイマー機能のissue追加

## Context

LINEハーネスOSSのLP機能には既に視聴期限管理（`absolute_ends_at` / `relative_days_after_friend_add` / `access_window_mode`）が実装されており、期限切れ時のリダイレクトも動作する。しかし、**ユーザー視点で「残り時間」が一切見えない**ため、視聴の緊急性訴求やコンバージョン改善の機会を逃している。また、期限到達の瞬間にいきなり別ページへ飛ばされる体験になる。

今回のタスクは「カウントダウンタイマー機能の実装」ではなく、**この機能追加要望をGitHub Issueとして登録すること**。実装は別タスクで行う。

現状、リポジトリ `blacksanta/line-harness-oss` ではGitHub Issues機能が無効化されており、`.github/ISSUE_TEMPLATE/` も未整備。さらに現在アクティブなghアカウント `nktnklg` は `viewerPermission: READ` のため書き込みできない。よってオーナー `blacksanta` への切替・Issues有効化・テンプレ整備を前段で実施したうえでissue起票する。

## 決定事項（ユーザー確認済み）

| 項目 | 決定内容 |
|---|---|
| issue記載先 | `.github/ISSUE_TEMPLATE` を整備し、GitHub Issuesを有効化して起票 |
| ghアカウント | `blacksanta` に切り替えて実行（作業完了後は元へは戻さない） |
| 作業粒度 | 二段階：テンプレPR → マージ → issue起票 |
| タイマー表示位置 | 動画の下 |
| 無期限時 | タイマー非表示 |
| 期限切れ時 | `00:00:00` 表示後、既存の `redirectUrl` へ自動遷移 |

## 実行ステップ

### Step 1: ghアカウント切り替え & Issues有効化

```bash
gh auth switch --user blacksanta
gh auth status  # active が blacksanta になっていることを確認

gh repo edit blacksanta/line-harness-oss --enable-issues
gh repo view blacksanta/line-harness-oss --json hasIssuesEnabled
# {"hasIssuesEnabled": true} を確認
```

### Step 2: ブランチ作成

現在のブランチは `staging`。main から派生したテンプレ用ブランチを切る。

```bash
git fetch origin
git checkout -b chore/issue-templates origin/main
```

### Step 3: ISSUE_TEMPLATE 3ファイル作成

#### `.github/ISSUE_TEMPLATE/config.yml`

```yaml
blank_issues_enabled: false
```

※ Discussionsの有効化状況が未確認のため `contact_links` は初期版では省略。

#### `.github/ISSUE_TEMPLATE/feature_request.yml`

YAML form。必須項目：背景・要件・受入条件。任意：実装方針・備考。`labels: ["enhancement"]` を自動付与。タイトルprefix `[Feature] `。

#### `.github/ISSUE_TEMPLATE/bug_report.yml`

YAML form。必須項目：概要・再現手順・期待挙動・実際挙動。任意：環境・ログ。`labels: ["bug"]`。タイトルprefix `[Bug] `。

### Step 4: コミット & PR

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "chore: issueテンプレ追加（feature/bug）"
git push -u origin chore/issue-templates

gh pr create --base main --title "chore: issueテンプレ追加" --body "..."
```

PR本文には「Issues機能を別途有効化済み」と明記。

### Step 5: PRマージ後にissue起票

```bash
# 本文をファイルに書き出す
# 一時パス: /tmp/lp-countdown-issue.md

gh issue create \
  --repo blacksanta/line-harness-oss \
  --title "[Feature] LP視聴期限のカウントダウンタイマー表示" \
  --label enhancement \
  --body-file /tmp/lp-countdown-issue.md
```

## issue本文の骨子（カウントダウンタイマー）

タイトル: `[Feature] LP視聴期限のカウントダウンタイマー表示`

### 構成

1. **背景・課題**: 期限管理は実装済みだが残り時間がユーザーに見えず、緊急性訴求・CVR改善の余地。期限切れの瞬間にいきなりリダイレクトされる体験を改善したい。
2. **機能要件**:
   - 表示位置: 動画ブロック直下
   - 表示形式: 24h以上は `D日 HH:MM:SS`、24h未満は `HH:MM:SS`
   - `access_window_mode === 'none'` または該当期限フィールドがすべてnull → タイマーDOM非表示
   - `absolute` / `relative` / `both`（`both`は早い方を採用）でモード別計算
   - 1秒ごと更新、`visibilitychange` で復帰時に再計算
   - 期限到達 → `00:00:00` 表示 → `redirectUrl` へ `location.replace()`
3. **非機能要件**:
   - サーバー時計ドリフト対策：`check-access` レスポンスに `expiresAtMs` と `serverNowMs` を含め、クライアントは `offset = Date.now() - serverNowMs` を保持して補正
   - タイムゾーン: epoch ms ベースで端末TZ非依存
   - LIFF環境（LINE内ブラウザ）動作確認必須
4. **実装方針 / 影響ファイル**:
   - `packages/db/src/lp-pages.ts`: `computeLpExpiryMs(lp, friend)` 純粋関数を追加。既存 `isLpAccessible()`（行52-88）と一部ロジック共通化検討
   - `apps/worker/src/routes/lp-pages.ts`（行215-261）: `POST /api/lp-pages/:id/check-access` のレスポンスに `expiresAtMs` / `serverNowMs` / `expired_redirect_url` を追加
   - `apps/worker/src/index.ts`（行441-630）: LP HTMLテンプレに `<div id="countdown">` 追加、`startCountdown()` JS関数実装、`render()` から呼び出し
5. **技術選択**:
   - サーバー側で期限epoch msを集約算出（`relative` モードの `friend.created_at` を露出しない）
   - 日時ライブラリ追加なし（既存方針と整合、ネイティブ `Date` のみ）
6. **テスト方針**:
   - `computeLpExpiryMs()` 単体テスト（全モード × 境界）
   - `check-access` API レスポンスに新フィールドが含まれること
   - 手動: staging 環境で各モード作成、DevTools確認、端末時計±5分ズラし、LIFFブラウザ
7. **受け入れ条件（チェックリスト）**:
   - `'none'` でタイマー非表示
   - `'absolute'` / `'relative'` / `'both'` で正しい期限が表示
   - 24h境界で表示形式が切り替わる
   - 期限到達で `00:00:00` 表示後リダイレクト
   - 端末時計5分ズレでも±1秒以内の誤差
   - LIFFブラウザで正常動作
   - 既存LP動作にregressionなし

## Critical Files

新規作成:
- `/Users/nakatani/works/line-harness-oss-blacksanta/.github/ISSUE_TEMPLATE/config.yml`
- `/Users/nakatani/works/line-harness-oss-blacksanta/.github/ISSUE_TEMPLATE/feature_request.yml`
- `/Users/nakatani/works/line-harness-oss-blacksanta/.github/ISSUE_TEMPLATE/bug_report.yml`

issue本文の根拠ファイル（今回は編集しない、issue内で参照する）:
- `/Users/nakatani/works/line-harness-oss-blacksanta/packages/db/src/lp-pages.ts` 行52-88（`isLpAccessible`）
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/src/routes/lp-pages.ts` 行215-261（`check-access`）
- `/Users/nakatani/works/line-harness-oss-blacksanta/apps/worker/src/index.ts` 行441-630（LP HTML生成）

## Verification

1. `gh auth status` で active が `blacksanta` であること
2. `gh repo view blacksanta/line-harness-oss --json hasIssuesEnabled` → `{"hasIssuesEnabled": true}`
3. テンプレPRマージ後、`https://github.com/blacksanta/line-harness-oss/issues/new/choose` で「機能追加要望」「バグ報告」が選択肢に出ること（ブラウザで目視確認）
4. `gh issue list --repo blacksanta/line-harness-oss` に起票したissueが表示されること
5. 起票したissueをブラウザで開き、Markdownレンダリング・コードブロック・チェックボックスが正しく表示されること

## リスク・留意事項

- main直push禁止（CI/CDで本番デプロイが走る）。`.github/ISSUE_TEMPLATE/` は Worker/Pages デプロイに無関係だが、規約遵守のためPR経由で進める
- `gh issue create --label enhancement` はラベルが存在しないと失敗するためデフォルトラベルを事前に `gh label list` で確認
- 作業完了後、ghアカウントを `nktnklg` に戻すかはユーザー任意（戻す場合は手動で `gh auth switch`）
