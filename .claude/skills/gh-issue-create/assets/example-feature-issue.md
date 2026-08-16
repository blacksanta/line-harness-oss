## 背景・課題

LP（ランディングページ）機能は既に視聴期限の判定とリダイレクトを実装済み（`absolute_ends_at` / `relative_days_after_friend_add` / `access_window_mode`）だが、**ユーザー視点で「残り視聴可能時間」が一切見えない**。

- 緊急性を訴求できず、視聴完了率・コンバージョン率が伸びにくい
- 期限到達の瞬間にいきなりリダイレクトされ、体験として唐突
- 競合の同種機能（カウントダウンLP）と比べて機能的に劣後

## UIデザイン

### 完成イメージ（モック）

```
  動画公開の終了まであと…

  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
  │      │  │      │  │      │  │      │
  │   1  │  │   9  │  │  21  │  │  12  │
  │      │  │      │  │      │  │      │
  └──────┘  └──────┘  └──────┘  └──────┘
    日       時間       分       秒
```

- ヘッダ: 「**動画公開の終了まであと…**」（太字、末尾は三点リーダ）
- 数値ブロック: **オレンジ系（例 `#E85C3A`）の塗りつぶし**、**白文字**、**角丸（6–8px）**、軽い影
- ブロック下にラベル: 日 / 時間 / 分 / 秒（暗めのグレー、小さめ）
- ブロック間は均等な gap（例 12–16px）、全体は中央寄せ
- ※ 詳細デザインは添付スクリーンショット（issueコメント）を参照

### 表示単位の出し分け

| 残り時間 | 表示するブロック |
|---|---|
| 24時間以上 | 日 / 時間 / 分 / 秒（4ブロック） |
| 24時間未満（日=0） | 時間 / 分 / 秒（3ブロック、中央寄せ） |
| 期限切れ | 全ブロック `0` 表示 → リダイレクト |
| 無期限 | コンテナごと非表示（空白も残さない） |

### DOM 構造（例）

```html
<div id="countdown" class="countdown" style="display:none">
  <p class="countdown-title">動画公開の終了まであと…</p>
  <div class="countdown-grid">
    <div class="countdown-cell" data-unit="days">
      <div class="countdown-num">0</div>
      <div class="countdown-label">日</div>
    </div>
    <div class="countdown-cell" data-unit="hours">
      <div class="countdown-num">00</div>
      <div class="countdown-label">時間</div>
    </div>
    <div class="countdown-cell" data-unit="minutes">
      <div class="countdown-num">00</div>
      <div class="countdown-label">分</div>
    </div>
    <div class="countdown-cell" data-unit="seconds">
      <div class="countdown-num">00</div>
      <div class="countdown-label">秒</div>
    </div>
  </div>
</div>
```

### CSS 概要

- `.countdown`: 動画ブロック直下、上下に余白（24–32px）、中央寄せ
- `.countdown-title`: `font-weight: 700`、サイズ大きめ（例 1.25rem）
- `.countdown-grid`: `display: flex; gap: 12px; justify-content: center;`
- `.countdown-cell`: 縦並び（`display: flex; flex-direction: column; align-items: center;`）
- `.countdown-num`: オレンジ背景、白文字、角丸 8px、`padding: 12px 18px`、`font-size: 1.75rem`、`font-weight: 700`、`box-shadow: 0 2px 4px rgba(0,0,0,.15);`
- `.countdown-label`: 暗めグレー、`font-size: .75rem`、上に少しマージン
- モバイル（`max-width: 480px`）でフォントサイズ・padding を縮小

## 要件

### 機能要件

- **表示位置**: 動画ブロックの直下
- **表示UI**: 上記モックの4ブロック構成（日 / 時間 / 分 / 秒）
- **単位の出し分け**: 残り24h以上は4ブロック、24h未満は「日」ブロック非表示で3ブロック
- **無期限時（`access_window_mode === 'none'` または該当期限フィールドがすべて null）**: タイマーDOMを `display:none` でレイアウトから消す
- **期限切れ到達時**: 全ブロックを `0` に更新後、既存の `redirectUrl`（`expired_redirect_url`）へ `location.replace()` で遷移
- **モード別の期限値計算**:
  - `absolute`: `new Date(absolute_ends_at).getTime()`
  - `relative`: `new Date(friend.created_at).getTime() + relative_days_after_friend_add * 86_400_000`
  - `both`: 上記2値の **min**（早い方が実効期限）
  - `none` / 該当値が null: タイマーなし
- **更新頻度**: 1秒ごと（`setInterval` 1000ms）
- **タブ復帰時**: `visibilitychange` イベントで再計算して整合をとる

### 非機能要件

- **タイムゾーン**: epoch ms ベースで端末TZ非依存
- **サーバー時計ドリフト対策**: `check-access` レスポンスに `serverNowMs` も同梱し、クライアントは `offset = Date.now() - serverNowMs` を保持して `expiresAtMs - (Date.now() - offset)` で残時間を計算
- **LIFF環境**: LINE内ブラウザ（LIFF）で正常動作すること
- **アクセシビリティ**: 数値部分は `aria-live="off"`（1秒ごとの更新を読み上げない）、タイトルは見出しとして読まれる
- **レスポンシブ**: モバイル幅でも崩れない

## 実装方針

### 影響を受けるファイル

#### 1. `packages/db/src/lp-pages.ts`（既存 `isLpAccessible()` 行52-88）

新規ヘルパ純粋関数を追加：

```ts
export function computeLpExpiryMs(
  lp: LpPage,
  friend: { created_at: string } | null,
): number | null {
  // none / friend無し / 各モードに対応するフィールド無し → null
  // absolute / relative / both → 各 epoch ms を計算し、both は min を返す
}
```

`isLpAccessible()` と一部ロジックが重なるため、内部ヘルパで共通化検討（リファクタは別issueでも可）。

#### 2. `apps/worker/src/routes/lp-pages.ts`（`POST /api/lp-pages/:id/check-access`、行215-261）

レスポンスを拡張：

```ts
return c.json({
  success: true,
  data: {
    allowed: true,
    payload: { contentType, videoUrl, body, name },
    expiresAtMs: computeLpExpiryMs(lp, friend), // 新規（null可）
    serverNowMs: Date.now(),                    // 新規
    expiredRedirectUrl: lp.expired_redirect_url, // 新規
  },
});
```

#### 3. `apps/worker/src/index.ts`（`GET /lp/:slug`、行441-630）

- CSS: 上記「CSS 概要」の `.countdown*` クラス群を `<style>` ブロックへ追加
- HTML: `render()` 内、動画ブロック直後に上記「DOM 構造」の `<div id="countdown" style="display:none">…</div>` を挿入
- JS: 新関数 `startCountdown(expiresAtMs, serverNowMs, redirectUrl)` を実装
  - `expiresAtMs == null` → 何もしない（DOM非表示のまま）
  - 1秒ごとに残り時間を算出し、各 `.countdown-num` の `textContent` を更新
  - 残り24h未満になったら `[data-unit="days"]` を `display:none`
  - 残り0以下になったら `clearInterval` → `location.replace(redirectUrl)`
- `main()`：`check-access` レスポンスから新フィールドを取り出し、`render()` 末尾で `startCountdown()` 呼び出し

### 技術選択のトレードオフ

| 観点 | 案A: サーバーで `expiresAtMs` 集約算出（採用） | 案B: クライアントで `absolute_ends_at` 等を直接受け取って計算 |
|---|---|---|
| サーバー時計ズレ吸収 | `serverNowMs` 併送で容易 | 端末時計依存 |
| `both` モードの min 計算 | サーバーで集約 | クライアントに分岐ロジック散在 |
| `relative` モードの `friend.created_at` 露出 | epoch ms のみで友だち情報を露出しない | `created_at` を露出 |

→ **案A採用**

### 日時ライブラリ

- ネイティブ `Date` 算術のみで完結（差分計算と `Math.floor` だけ）
- dayjs / date-fns 等の追加導入は **不要**

## テスト方針

### ユニットテスト

- `packages/db/src/lp-pages.ts` の `computeLpExpiryMs()` 単体テスト
  - 各モード × 境界（null / 未来 / 過去）
  - `both` モードで absolute と relative どちらが早いかの分岐
  - `none` モードで null 返却

### 統合テスト

- `POST /api/lp-pages/:id/check-access` のレスポンスに `expiresAtMs` / `serverNowMs` / `expiredRedirectUrl` が含まれることを確認

### 手動受入テスト

- staging 環境で各モードのLPを作成し、ブラウザDevTools で 1秒ごとの減算を確認
- 残り24時間ちょうど・23:59:59 を跨ぐタイミングで「日」ブロックの表示／非表示切替を確認
- 期限到達直前にページを開き、全ブロック `0` → リダイレクトを確認
- 端末時計を ±5分ズラして、`serverNowMs` 補正が効くことを確認
- LIFFブラウザ（LINEアプリ内）で表示確認
- モバイル幅で UI が崩れないことを確認

## 受け入れ条件

- [ ] モックUI（4ブロック・オレンジ・白文字・角丸）が忠実に再現されている
- [ ] 「動画公開の終了まであと…」のタイトルが表示される
- [ ] `access_window_mode === 'none'` のLPでカウントダウン全体が表示されない（DOMごと非表示、レイアウト空白も残らない）
- [ ] `'absolute'` のLPで `absolute_ends_at` までの残り時間が正しく表示
- [ ] `'relative'` のLPで `friend.created_at + N日` までの残り時間が正しく表示
- [ ] `'both'` のLPで早い方の期限が採用される
- [ ] 残り24h以上で4ブロック、24h未満で3ブロック（日ブロック非表示）に切り替わる
- [ ] 期限到達時に全ブロック `0` 表示 → `expired_redirect_url` にリダイレクト
- [ ] サーバー時計と端末時計に5分のズレがあっても表示が ±1秒以内で正しい
- [ ] LIFFブラウザで正常動作
- [ ] モバイル幅でUI崩れなし
- [ ] `computeLpExpiryMs()` のユニットテストが追加されPass
- [ ] 既存LP動作（YouTube動画再生・redirect等）にregressionなし

## 参考

- 既存ロジック: `packages/db/src/lp-pages.ts` 行52-88（`isLpAccessible`）
- 既存API: `apps/worker/src/routes/lp-pages.ts` 行215-261（`check-access`）
- 既存LP HTML: `apps/worker/src/index.ts` 行441-630（`GET /lp/:slug`）
- 関連PR: #1（LP機能本体）, #2 / #3 / #4（YouTube動画関連）
