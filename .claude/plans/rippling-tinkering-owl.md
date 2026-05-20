# 視聴期限カウントダウンタイマーをブロック化

## Context

現状、LPの「公開終了まであと…」カウントダウンは、`access_window_mode != 'none'` のときに**自動でLP最下部に固定表示**される。位置のカスタマイズができず、動画の直後や本文中など好きな位置に置けない。

ブロック自由配置（`feat(lp): LPコンテンツをブロック自由配置に対応…` で導入）の一貫として、カウントダウンも `video / markdown / image / button / divider` と同じく **「ブロック」として配置できるよう** にする。期限の値は引き続きLPの視聴期限設定（`absoluteEndsAt` / `relativeDaysAfterFriendAdd`）を利用し、ブロック側では**見た目（タイトル文言・タイトル表示有無・数字セルの色）だけ**カスタマイズ可能とする。

挙動方針（ユーザ確認済み）：
- 期限ソース：LPの視聴期限を使う（ブロックは「どこに表示するか」だけを担う）
- カスタマイズ：`title`（文言）/ `showTitle`（タイトル表示ON/OFF）/ `color`（数字セル背景色）
- 未配置時：**ブロックを明示的に置いたときのみ表示**（既存LPの最下部自動表示は撤廃）→ 既存LPは一括スクリプトで countdown ブロックを末尾に追加

## 設計

### 1. ブロック型 — `countdown`

```ts
{
  id: string
  type: 'countdown'
  title?: string | null       // 既定: "公開終了まであと…"
  showTitle?: boolean         // 既定: true
  color?: string | null       // 既定: "#E85C3A"。`#RRGGBB` 形式のみ受理
}
```

期限の値はブロックには持たせない。クライアント（公開LP）側で、access-check のレスポンス（`expiresAtMs` / `serverNowMs` / `expiredRedirectUrl`）を全 countdown ブロックに適用する。LPに視聴期限が設定されていない（`accessWindowMode === 'none'`）状態で countdown ブロックが置かれた場合は、**そのブロックは描画しない**（公開側・プレビュー側ともに）。

### 2. バリデーション

`normalizeBlocks()` に `case 'countdown'` を追加し、以下を検証：
- `title`：string なら採用、それ以外は `null`
- `showTitle`：boolean なら採用、それ以外は `true`
- `color`：`/^#[0-9a-fA-F]{6}$/` にマッチする string なら採用、それ以外は `null`

`deriveLegacyFromBlocks()` には影響なし（countdown は video/markdown どちらでもないため）。

### 3. 編集UI

`sortable-block-item.tsx` の `BlockBody` に `case 'countdown'`：
- タイトル入力（`<input type="text">`、placeholder「公開終了まであと…」）
- 「タイトルを表示する」チェックボックス
- 「数字セルの色」`<input type="color">`（デフォルト `#E85C3A`）
- 注記文：「期限はLPの『視聴期限』設定を使用します。期限未設定だと表示されません」

`add-block-menu.tsx` の `TYPES` 配列に `'countdown'` を追加。

`lp-blocks.ts`：
- `BLOCK_LABELS.countdown = '期限カウントダウン'`
- `BLOCK_ICONS.countdown = '⏳'`
- `createDefaultBlock('countdown')` は `{ id, type:'countdown', title:null, showTitle:true, color:null }` を返す

### 4. プレビュー描画

`lp-preview.tsx` の `BlockPreview()` に `case 'countdown'`：
- `sampleCountdown(form)` の結果を使ってサンプル表示
- `form.accessWindowMode === 'none'` 時は描画しない代わりに `<p>期限が未設定のため表示されません</p>` のヒントを灰色で出す
- 既存の「最下部固定の countdown 描画ブロック（`lp-preview.tsx` L116–145）」は**削除**
- `CountdownCell` を色プロパティを受け取れるよう拡張（`bg?: string`）

### 5. 公開LP描画

`apps/worker/src/index.ts`：
- `renderBlock()` に `case 'countdown'` を追加。stable な data 属性付きの `<div class="countdown" data-countdown="1" data-color="#xxx" data-show-title="1">…</div>` を出力。タイトル無効化時は `<p class="countdown-title">` を出さない。色は数字セル `<div class="countdown-num" style="background:…">` にインラインで適用
- 現在の「`hasExpiry` チェックで最下部に固定 countdown を append する処理（L630–640）」は**削除**
- `startCountdown(expiresAtMs, serverNowMs, redirectUrl)` を改修：
  - 単一の `#countdown` 取得から `document.querySelectorAll('[data-countdown]')` に変更
  - 各要素に対して `tick()` を実行（一括更新）
  - 該当要素が0個なら何もしない（早期 return）
  - 期限到達時の `location.replace(redirectUrl)` は引き続き1回だけ発火

### 6. 既存データの移行

ブロック明示モードに移行するため、既に視聴期限が設定されているLPは countdown ブロックを末尾に追加しないと表示が消える。一括移行スクリプトを用意：

- 場所：`scripts/migrate-add-countdown-block.ts`（新規）
- ロジック：
  1. `GET /api/lp-pages` で全LPを取得
  2. `accessWindowMode !== 'none'` かつ `blocks` に countdown が含まれないものを抽出
  3. `blocks` 末尾に `{id: crypto.randomUUID(), type:'countdown', title:null, showTitle:true, color:null}` を追加
  4. `PUT /api/lp-pages/:id` で保存
- 実行は staging で確認 → main 反映後に本番で実行

ローカル実行用に `package.json` スクリプトを追加（任意、READMEに記載するだけでも可）。

## 変更ファイル一覧

| ファイル | 変更内容 |
| --- | --- |
| `packages/db/src/lp-pages.ts` | `LpBlock` ユニオンに `countdown` 追加、`normalizeBlocks()` に case 追加 |
| `apps/web/src/lib/api.ts` | `LpBlock` ユニオンに `countdown` 追加（型同期） |
| `apps/web/src/lib/lp-blocks.ts` | `BLOCK_LABELS` / `BLOCK_ICONS` / `createDefaultBlock` に追加 |
| `apps/web/src/components/lp-pages/add-block-menu.tsx` | `TYPES` 配列に `'countdown'` |
| `apps/web/src/components/lp-pages/sortable-block-item.tsx` | `BlockBody` に countdown 編集UI |
| `apps/web/src/components/lp-pages/lp-preview.tsx` | `BlockPreview` に case 追加、最下部固定 countdown 削除、`CountdownCell` に色 prop |
| `apps/worker/src/index.ts` | `renderBlock()` に case 追加、`render()` の最下部固定 countdown 削除、`startCountdown()` を複数要素対応に改修 |
| `scripts/migrate-add-countdown-block.ts` | 新規（既存LPへの一括 countdown 追加） |

## 検証

1. **ビルド／型チェック**：`pnpm -w build`（worker / web 双方）が通る
2. **ローカル動作確認**（`pnpm dev` で web、`pnpm wrangler dev` で worker）
   - 既存LPを開く → countdown が**表示されない**ことを確認（移行スクリプト未実行のため）
   - 編集画面で「期限カウントダウン」ブロックを追加 → プレビューでサンプル表示
   - タイトル文言・タイトル表示OFF・色変更がプレビューに反映される
   - 視聴期限を `none` に変更 → プレビューでヒント表示
   - 保存 → 公開LP（`/lp/:slug`）を LIFF 経由で開いて実機確認
3. **移行スクリプト検証**
   - staging のLPに対して dry-run（実行ログのみ）→ 期待通りのLPだけが対象になっているか確認
   - 実行 → staging で公開LPを開いて countdown が末尾に表示されることを確認
4. **マルチ countdown 配置**：1ページに2個 countdown ブロックを置き、両方が同じ値で同期しているか確認
5. **期限到達時挙動**：絶対期限を10秒後にして放置 → カウント0で `expiredRedirectUrl` にリダイレクトすることを確認
6. **デプロイフロー**：`feature/lp-blocks` → `staging` PR でマージ → staging 実機確認 → `main` PR
