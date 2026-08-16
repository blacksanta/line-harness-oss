# .github/ISSUE_TEMPLATE/ コピペ用テンプレ

リポジトリにテンプレが未整備の場合、以下3ファイルを別ブランチで追加し PR を作る。**main 直 push は禁止**。

## ブランチ運用

```bash
git fetch origin
git checkout -b chore/issue-templates origin/main
# 手元の変更を退避（必要な場合）
git stash push -m "WIP"
# 3ファイル作成
git add .github/ISSUE_TEMPLATE/
git commit -m "chore: issueテンプレ追加（feature_request / bug_report）"
git push -u origin chore/issue-templates
gh pr create --base main \
  --title "chore: issueテンプレ追加" \
  --body "..."
# 元のブランチに戻して stash 復元
git checkout <original-branch>
git stash pop
```

## `.github/ISSUE_TEMPLATE/config.yml`

```yaml
blank_issues_enabled: false
```

`blank_issues_enabled: false` で空テンプレ起票を禁止し、必ずテンプレ経由に強制する。Discussions リンクを追加する場合は `contact_links:` を追記（先に Discussions が有効化されている必要あり）。

## `.github/ISSUE_TEMPLATE/feature_request.yml`

```yaml
name: 機能追加要望
description: 新機能や既存機能の拡張を提案する
title: "[Feature] "
labels:
  - enhancement
body:
  - type: textarea
    id: background
    attributes:
      label: 背景・課題
      description: なぜこの機能が必要か、現状の何が問題かを記載してください。
      placeholder: 現状〜のため、〜が困っている。〜を実現したい。
    validations:
      required: true
  - type: textarea
    id: requirements
    attributes:
      label: 要件
      description: 機能要件を箇条書きで記載してください。
      placeholder: |
        - 〜できること
        - 〜が表示されること
    validations:
      required: true
  - type: textarea
    id: design
    attributes:
      label: 実装方針（任意）
      description: 影響を受けるファイル・関数、技術選択、UIモックなど。
  - type: textarea
    id: acceptance
    attributes:
      label: 受け入れ条件
      description: 完了の定義をチェックリスト形式で記載してください。
      value: |
        - [ ]
        - [ ]
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: 備考・参考リンク
      description: 関連issue・PR・ドキュメント・スクリーンショットなど。
```

## `.github/ISSUE_TEMPLATE/bug_report.yml`

```yaml
name: バグ報告
description: 不具合を報告する
title: "[Bug] "
labels:
  - bug
body:
  - type: textarea
    id: summary
    attributes:
      label: 概要
      description: 不具合の内容を1〜2行で。
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: 再現手順
      value: |
        1.
        2.
        3.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期待する挙動
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: 実際の挙動
    validations:
      required: true
  - type: input
    id: environment
    attributes:
      label: 環境
      description: 本番／staging、ブラウザ、LIFFか直接アクセスか、再現時刻など。
  - type: textarea
    id: logs
    attributes:
      label: ログ・スクリーンショット（任意）
```

## PR 本文ひな型

```markdown
## Summary

- GitHub Issues 機能の有効化（別途実施済み）に合わせて `.github/ISSUE_TEMPLATE/` を整備
- `feature_request.yml`（機能要望）と `bug_report.yml`（バグ報告）の YAML form を追加
- `config.yml` で blank issue を無効化し、必ずテンプレ経由で起票する運用とする
- Worker / Pages デプロイ等には影響なし

## Test plan

- [ ] マージ後 `https://github.com/<owner>/<repo>/issues/new/choose` でテンプレ選択肢が出ることを確認
- [ ] 各テンプレを開き、必須項目のバリデーションが効くことを確認
- [ ] blank issue リンクが表示されないことを確認
```

## メモ：実際の運用例

- 本リポジトリ（`blacksanta/line-harness-oss`）では PR #8 にて整備済み（2026-05-13）
- ラベル `enhancement` `bug` はGitHubデフォルトで存在するため新規作成不要
- テンプレ未整備の状態でも `gh issue create --body-file ...` での起票は可能（テンプレは Web UI 起票時のみ作用）
