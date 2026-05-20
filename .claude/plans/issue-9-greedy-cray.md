# Issue #9 を main にマージ（staging → main PR）

## Context

Issue #9（LPカウントダウンタイマー）の実装は既に **staging ブランチにコミット済み**（`91d194b`）、staging 環境で動作確認も完了。CLAUDE.md のブランチ運用フローに従い、`staging` を `main` に PR してマージする最終工程を行う。

## staging に乗っているが main 未マージのコミット

```
5615fd3 ci(staging): VITE_LIFF_ID を staging 環境では VITE_LIFF_ID_STAGING に切替
91d194b feat(lp): 動画LPに視聴期限カウントダウンタイマーを追加 (#9)
```

両方 main に取り込む:
- `91d194b` は Issue #9 本体（commit message に `Closes #9` を含むので merge 時に自動で issue クローズ）
- `5615fd3` は CI の環境分岐。フォールバックで `VITE_LIFF_ID_STAGING` 未設定時は従来通り `vars.VITE_LIFF_ID` を使うので、main 側にあっても本番デプロイには影響なし

## 手順

1. PR 作成: `gh pr create -B main -H staging` でタイトル/本文を付けて作成
   - タイトル: `feat(lp): 動画LPに視聴期限カウントダウンタイマーを追加 (#9)`
   - 本文: Summary（カウントダウン実装 + CI環境分岐）と Test plan（staging で実機確認済み）
2. PR URL を提示
3. レビュー/マージはユーザー側（main 直接 push 禁止のため Web UI でマージしてもらう）

## 注意

- `main` への直接 push は CLAUDE.md で禁止されている
- マージ後、main push をトリガーに `deploy-worker.yml` が production 環境にデプロイされる
- production デプロイには `vars.VITE_LIFF_ID`（本番 `cNMUKb3E`）が使われるので、本番LIFFはこれまで通り

## 検証（マージ後）

- 本番 `/lp/<slug>` を直アクセスして:
  - LIFFログイン → 本番worker のまま LP 表示 → カウントダウン稼働
  - 本番 LP に既存のリグレッションがないこと（YouTube再生など）

## 別件（残し）

- `line_accounts.liff_id` カラム staging 未適用（このPRには含めない）
- `liff.line.me/<id>` 経由でLP起動の対応も別件
