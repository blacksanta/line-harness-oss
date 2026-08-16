# Issue #9 — LP視聴期限のカウントダウンタイマー表示

## Context

LP機能には既に `absolute_ends_at` / `relative_days_after_friend_add` / `access_window_mode` による期限判定とリダイレクトが実装済みだが、エンドユーザー視点で「残り視聴可能時間」を視覚化する手段がない。

このIssueは、動画LPの動画ブロック直下に「日 / 時間 / 分 / 秒」の4ブロック構成のカウントダウンUI を追加し、緊急性訴求とコンバージョン率向上を狙う。期限到達時には既存の `expired_redirect_url` へ自動遷移させる。

サーバー時計と端末時計のドリフトを吸収するため、`check-access` レスポンスに `serverNowMs` を同梱し、クライアントで端末オフセットを補正する方式（issue記載の **案A**）を採用する。

## 実装方針サマリ

1. `packages/db/src/lp-pages.ts` に純粋関数 `computeLpExpiryMs(lp, friend)` を新規追加（barrel経由で自動エクスポート済み）
2. `apps/worker/src/routes/lp-pages.ts` の `POST /api/lp-pages/:id/check-access` の allowed レスポンスに `expiresAtMs` / `serverNowMs` / `expiredRedirectUrl` を追加
3. `apps/worker/src/index.ts` の `GET /lp/:slug` HTML に CSS / DOM / JS (`startCountdown`) を追加
4. `apps/worker/src/services/lp-pages.test.ts` に `computeLpExpiryMs` のユニットテストを追加

DBスキーマ変更・依存追加（dayjs等）は **不要**。

## 変更ファイル

### 1. `packages/db/src/lp-pages.ts`（既存 `isLpAccessible` 行52-88 の直後に追加）

純粋関数を追加:

```ts
// ── 期限ミリ秒の集約算出（カウントダウン用） ────────────────────────────────
export function computeLpExpiryMs(
  lp: LpPage,
  friend: { created_at: string } | null,
): number | null {
  if (lp.access_window_mode === 'none') return null;

  let absMs: number | null = null;
  let relMs: number | null = null;

  if (lp.access_window_mode === 'absolute' || lp.access_window_mode === 'both') {
    if (lp.absolute_ends_at) absMs = new Date(lp.absolute_ends_at).getTime();
  }
  if (lp.access_window_mode === 'relative' || lp.access_window_mode === 'both') {
    if (friend && lp.relative_days_after_friend_add != null) {
      relMs =
        new Date(friend.created_at).getTime() +
        lp.relative_days_after_friend_add * 86_400_000;
    }
  }

  if (absMs !== null && relMs !== null) return Math.min(absMs, relMs);
  return absMs ?? relMs;
}
```

仕様メモ:
- `none` → 必ず `null`
- `absolute` で `absolute_ends_at` が `null` → `null`（無期限）
- `relative` で `friend === null` または `relative_days_after_friend_add === null` → `null`
- `both` で片方しか設定されていない場合 → 設定されている方の値を返す（issue表の「両方の min」は両方設定時の挙動として解釈）
- `both` で両方 null → `null`

`@line-crm/db` のbarrel `packages/db/src/index.ts:28` は既に `export * from './lp-pages'` なので、追加export作業は不要。

### 2. `apps/worker/src/routes/lp-pages.ts`（行215-261）

冒頭の import に `computeLpExpiryMs` を追加し、allowed分岐のレスポンスを拡張:

```ts
// 既存 import 行
import { ..., computeLpExpiryMs } from '@line-crm/db';

// 行245-256 を以下に置換
return c.json({
  success: true,
  data: {
    allowed: true,
    payload: {
      contentType: lp.content_type,
      videoUrl: lp.video_url,
      body: lp.body,
      name: lp.name,
    },
    expiresAtMs: computeLpExpiryMs(
      lp,
      friend ? { created_at: friend.created_at } : null,
    ),
    serverNowMs: Date.now(),
    expiredRedirectUrl: lp.expired_redirect_url,
  },
});
```

denied分岐（行242）は変更しない。

### 3. `apps/worker/src/index.ts`（`GET /lp/:slug` 行441-630）

#### 3-a. CSS追加（`<style>` ブロック、行503の末尾直前に追記）

```css
.countdown{margin:24px 0 8px;text-align:center}
.countdown-title{font-size:1.25rem;font-weight:700;margin-bottom:12px;color:#0f172a}
.countdown-grid{display:flex;gap:14px;justify-content:center;flex-wrap:nowrap}
.countdown-cell{display:flex;flex-direction:column;align-items:center}
.countdown-num{background:#E85C3A;color:#fff;border-radius:8px;padding:14px 20px;font-size:1.75rem;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,.15);min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
.countdown-label{font-size:.78rem;color:#64748b;margin-top:6px}
@media(max-width:480px){
  .countdown-num{font-size:1.35rem;padding:10px 12px;min-width:46px}
  .countdown-title{font-size:1.05rem}
  .countdown-grid{gap:8px}
}
```

#### 3-b. `render()` の video分岐（行573-585）— countdown DOM を動画ブロック直下に挿入

```js
if(isYt){
  // ... 既存の YouTube埋め込み html ...
} else {
  html += '<div class="video-wrap">...</div>';
}
html += '<div id="countdown" class="countdown" style="display:none" aria-live="off">'
      +   '<p class="countdown-title">動画公開の終了まであと…</p>'
      +   '<div class="countdown-grid">'
      +     '<div class="countdown-cell" data-unit="days"><div class="countdown-num">0</div><div class="countdown-label">日</div></div>'
      +     '<div class="countdown-cell" data-unit="hours"><div class="countdown-num">00</div><div class="countdown-label">時間</div></div>'
      +     '<div class="countdown-cell" data-unit="minutes"><div class="countdown-num">00</div><div class="countdown-label">分</div></div>'
      +     '<div class="countdown-cell" data-unit="seconds"><div class="countdown-num">00</div><div class="countdown-label">秒</div></div>'
      +   '</div>'
      + '</div>';
app.innerHTML = html;
if(isYt) initYouTubePlayer();
return;
```

ページコンテンツ（`contentType === 'page'`）にはタイマーを出さない（issue文「動画ブロック直下」スコープに合わせる）。

#### 3-c. `startCountdown` 関数を追加（`render()` の直後あたり）

```js
function startCountdown(expiresAtMs, serverNowMs, redirectUrl){
  if(expiresAtMs == null || !redirectUrl) return;
  var container = document.getElementById('countdown');
  if(!container) return;

  var offset = Date.now() - serverNowMs;  // serverNow ≈ Date.now() - offset
  var dCell = container.querySelector('[data-unit="days"]');
  var dNum  = dCell.querySelector('.countdown-num');
  var hNum  = container.querySelector('[data-unit="hours"] .countdown-num');
  var mNum  = container.querySelector('[data-unit="minutes"] .countdown-num');
  var sNum  = container.querySelector('[data-unit="seconds"] .countdown-num');

  function pad(n){ return n < 10 ? '0' + n : String(n); }

  var timerId = null;
  var fired = false;

  function tick(){
    var remaining = expiresAtMs - (Date.now() - offset);
    if(remaining <= 0){
      dNum.textContent = '0';
      hNum.textContent = '00';
      mNum.textContent = '00';
      sNum.textContent = '00';
      if(!fired){
        fired = true;
        if(timerId) clearInterval(timerId);
        location.replace(redirectUrl);
      }
      return;
    }
    var totalSec = Math.floor(remaining / 1000);
    var days    = Math.floor(totalSec / 86400);
    var hours   = Math.floor((totalSec % 86400) / 3600);
    var minutes = Math.floor((totalSec % 3600) / 60);
    var seconds = totalSec % 60;
    if(days >= 1){
      dCell.style.display = '';
      dNum.textContent = String(days);
    } else {
      dCell.style.display = 'none';
    }
    hNum.textContent = pad(hours);
    mNum.textContent = pad(minutes);
    sNum.textContent = pad(seconds);
  }

  container.style.display = '';
  tick();
  timerId = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) tick();
  });
}
```

#### 3-d. `main()` 行616 を以下に置換

```js
render(res.data.payload);
startCountdown(res.data.expiresAtMs, res.data.serverNowMs, res.data.expiredRedirectUrl);
```

### 4. `apps/worker/src/services/lp-pages.test.ts`

既存のテストファイル末尾に `computeLpExpiryMs` の describe ブロックを追加。`@line-crm/db` import を更新。

```ts
import { isLpAccessible, computeLpExpiryMs, type LpPage } from '@line-crm/db';

// ... 既存テスト ...

describe('computeLpExpiryMs', () => {
  it('none モードは null', () => {
    expect(computeLpExpiryMs(baseLp, friend)).toBeNull();
  });

  it('absolute モード: end の epoch ms を返す', () => {
    const lp = { ...baseLp, access_window_mode: 'absolute' as const, absolute_ends_at: '2026-05-20T23:59:59.000+09:00' };
    expect(computeLpExpiryMs(lp, friend)).toBe(new Date('2026-05-20T23:59:59.000+09:00').getTime());
  });

  it('absolute モードで end が null なら null', () => {
    const lp = { ...baseLp, access_window_mode: 'absolute' as const };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });

  it('relative モード: friend.created_at + N日', () => {
    const lp = { ...baseLp, access_window_mode: 'relative' as const, relative_days_after_friend_add: 7 };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(new Date('2026-05-08T00:00:00.000+09:00').getTime());
  });

  it('relative モード: friend が null なら null', () => {
    const lp = { ...baseLp, access_window_mode: 'relative' as const, relative_days_after_friend_add: 7 };
    expect(computeLpExpiryMs(lp, null)).toBeNull();
  });

  it('relative モード: 日数が null なら null', () => {
    const lp = { ...baseLp, access_window_mode: 'relative' as const, relative_days_after_friend_add: null };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });

  it('both モード: 早い方（absolute）を返す', () => {
    const lp = {
      ...baseLp,
      access_window_mode: 'both' as const,
      absolute_ends_at: '2026-05-05T00:00:00.000+09:00',
      relative_days_after_friend_add: 30,
    };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(new Date('2026-05-05T00:00:00.000+09:00').getTime());
  });

  it('both モード: 早い方（relative）を返す', () => {
    const lp = {
      ...baseLp,
      access_window_mode: 'both' as const,
      absolute_ends_at: '2026-06-01T00:00:00.000+09:00',
      relative_days_after_friend_add: 3,
    };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(new Date('2026-05-04T00:00:00.000+09:00').getTime());
  });

  it('both モード: 片方しか設定が無ければ設定された方を返す', () => {
    const lp = {
      ...baseLp,
      access_window_mode: 'both' as const,
      absolute_ends_at: '2026-05-05T00:00:00.000+09:00',
      relative_days_after_friend_add: null,
    };
    expect(computeLpExpiryMs(lp, friend)).toBe(new Date('2026-05-05T00:00:00.000+09:00').getTime());
  });

  it('both モード: 両方未設定なら null', () => {
    const lp = { ...baseLp, access_window_mode: 'both' as const };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });
});
```

## 既存資産の再利用ポイント

- `isLpAccessible()` （`packages/db/src/lp-pages.ts:52`） — 期限判定はサーバー側既存ロジックをそのまま利用
- `getFriendByLineUserId()` — `check-access` で既に呼ばれており `friend.created_at` を保持
- `@line-crm/db` barrel — `packages/db/src/index.ts:28` の `export * from './lp-pages'` により新規エクスポートも自動反映
- 既存LP HTML の `escape` / `app.innerHTML` 描画パターン・ `videoEmbedUrl` 等は触らない（regressionリスクを最小化）

## 検証方法

### ユニットテスト

```sh
cd apps/worker && npm run test
```

`computeLpExpiryMs` の10ケースが Pass することを確認（既存 `isLpAccessible` のテスト群もそのまま通る）。

### 型チェック

```sh
cd apps/worker && npm run typecheck   # 既存スクリプトがあれば
cd packages/db && tsc --noEmit
```

### 手動受入

1. `npm run dev` / wrangler dev で起動
2. 各モードの LP を作成（admin UI 経由）し、`/lp/:slug` を LIFFブラウザで開く
   - `absolute`: 数分後を `absolute_ends_at` に設定 → 1秒ごとカウントダウン → 0でリダイレクト
   - `relative`: `relative_days_after_friend_add=1` を設定 → 翌日0時に向かってカウントダウン
   - `both`: 両方設定し、早い方が採用されることを確認
   - `none`: タイマーDOMが表示されない（レイアウト崩れも無いこと）
3. DevTools で `Date.now()` を ±5分ズラしても表示が ±1秒以内
4. 残り 23h59m59s ↔ 24h00m00s 跨ぎで「日」ブロックが切り替わる
5. モバイル幅（〜480px）で UI 崩れなし
6. ページコンテンツLP（`content_type='page'`）ではタイマーが出ないこと

### 既存リグレッション

- `expired` / `not_friend` / `inactive` 判定経由のリダイレクトが従来通り動作
- YouTube プレイヤーの再生／一時停止オーバーレイ挙動が従来通り
