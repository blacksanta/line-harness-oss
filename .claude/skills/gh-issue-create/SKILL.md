---
name: gh-issue-create
description: GitHub Issuesを統一フォーマットで起票するスキル。`gh issue create`、`.github/ISSUE_TEMPLATE` 整備、Issues機能有効化、書き込み権限を持つghアカウントへの切替までを自動化する。「issueを追加したい」「機能要望のissueを立てて」「バグ報告のissueを作って」「機能追加要望」「issue起票」などのリクエストで使用する。LINEハーネスOSS（blacksanta/line-harness-oss）リポジトリでの利用を想定するが、他リポジトリにも応用可能。
---

# gh-issue-create

GitHub Issues を統一フォーマット（背景・要件・実装方針・テスト方針・受入条件・参考）で起票する。前提条件の解決（権限・Issues有効化・テンプレ整備）も併せて行う。

## 入力パラメータ

ユーザーから集める情報：

| 項目 | 必須 | 既定値 |
|---|---|---|
| title | ✓ | - |
| type | - | `feature` |
| body または body_file | - | 会話から要点を集めて生成 |
| repo | - | `git remote` から推定 |
| labels | - | type に応じて `enhancement` / `bug` を自動付与 |

不足項目はユーザーに確認する。ただし `repo` は git remote から自動推定して構わない。

## ワークフロー

順に実行する。各ステップでエラーが出たら止めて報告。

### 1. 前提チェック

```bash
# gh のログイン状態
gh auth status

# 現在アクティブなアカウントが対象リポジトリへの書き込み権限を持つか
gh repo view <owner>/<repo> --json viewerPermission
```

- `viewerPermission` が `READ` の場合は書き込み権限がないので、`gh auth status` の出力からオーナー権限を持つアカウントを探し、`gh auth switch --user <owner>` を実行。
- 切替後に再度 `gh auth status` で `Active account: true` を確認。
- 切替が必要だった場合、作業完了後にユーザーへ「元のアカウントへ戻すには `gh auth switch --user <original>`」と案内する（自動では戻さない）。

### 2. Issues 機能の有効化チェック

```bash
gh repo view <owner>/<repo> --json hasIssuesEnabled
```

- `false` なら `gh repo edit <owner>/<repo> --enable-issues`。
- 有効化後に再確認。

### 3. ISSUE_TEMPLATE 整備（未整備時のみ・初回限定）

`.github/ISSUE_TEMPLATE/` ディレクトリが存在しない場合、別ブランチ＋PRで整備する。**main直push禁止**。

詳細は [`references/github-issue-templates.md`](references/github-issue-templates.md) を参照。

手順サマリ：
1. `git fetch origin && git checkout -b chore/issue-templates origin/main`
2. 手元の作業中変更があれば `git stash push -m "WIP"` で退避（作業後 `git stash pop`）
3. `.github/ISSUE_TEMPLATE/config.yml`, `feature_request.yml`, `bug_report.yml` を作成
4. `git add` → コミット → `git push -u origin chore/issue-templates` → `gh pr create --base main`
5. PRマージはユーザー判断（待たなくてもissue起票は可能。テンプレは Web UI 起票時のみ作用）

**本リポジトリ（blacksanta/line-harness-oss）では PR #8 で整備済み**。重複作成しない。

### 4. issue本文の準備

`body_file` が指定されていればそれを使う。なければ：

1. 会話から要点を集めて本文を組み立てる（テンプレは [`references/issue-body-template.md`](references/issue-body-template.md)）
2. `/tmp/<slug>-issue.md` に書き出す（`<slug>` は title からkebab-case生成）
3. 完成例として [`assets/example-feature-issue.md`](assets/example-feature-issue.md) を参考にできる

本文の最低限の構成：
- **feature**: 背景・課題 / 要件 / 実装方針 / テスト方針 / 受入条件 / 参考
- **bug**: 概要 / 再現手順 / 期待挙動 / 実際挙動 / 環境 / ログ

### 5. issue起票

```bash
gh issue create \
  --repo <owner>/<repo> \
  --title "<prefix> <title>" \
  --label <label1>,<label2> \
  --body-file /tmp/<slug>-issue.md
```

- `prefix`: type=feature → `[Feature]`、type=bug → `[Bug]`
- `label`: type=feature → `enhancement`、type=bug → `bug`（追加ラベルがあれば併記）
- 事前に `gh label list --repo <owner>/<repo>` で対象ラベルが存在することを確認

### 6. 結果を返す

起票されたissue URLをユーザーに伝える。本文に不安があれば「内容にズレがあれば `gh issue edit <number>` または Web UI で修正してください」と案内。

## 注意事項

- **本文の質に妥協しない**：影響を受けるファイル・行番号・サンプルコード・トレードオフ表まで具体的に書く。issueは実装担当者（人 or 別のClaude）への引き継ぎ書。
- **画像添付**：`gh` CLI からは画像をissue本文に直接アップロードできない。画像を含めたい場合は ①Web UI から手動添付するようユーザーに案内、または ②リポジトリ内 `docs/images/` 等にコミットして相対URL参照、のいずれかを選ぶ。
- **既存テンプレとの整合**：`.github/ISSUE_TEMPLATE/` が既にある場合は、テンプレの required 項目を本文構造に反映する。
- **CI/CDへの影響**：`.github/ISSUE_TEMPLATE/` 自体はデプロイに無関係だが、`main` ブランチへの直接 push は禁止（PRポリシー）。必ず別ブランチ→PR経由。

## 関連ファイル

- [`references/issue-body-template.md`](references/issue-body-template.md) — issue本文の構造テンプレ（feature / bug）
- [`references/github-issue-templates.md`](references/github-issue-templates.md) — `.github/ISSUE_TEMPLATE/*.yml` の中身（コピペ用）
- [`assets/example-feature-issue.md`](assets/example-feature-issue.md) — feature issue の完成例（LPカウントダウンタイマー）
