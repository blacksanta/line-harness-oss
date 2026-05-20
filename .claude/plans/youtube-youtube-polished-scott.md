# YouTube 埋め込みからYouTubeブランディングを最小化する

## Context

視聴期限付きランディングページ（LP）で動画コンテンツを表示すると、YouTube の標準ロゴ・関連動画サジェスト・動画注釈などが目立ち、「YouTube そのもの」に見えてしまう。
動画ソースは YouTube のまま維持しつつ、プレイヤー UI から YouTube ブランディング要素を可能な限り抑制し、LP の世界観に馴染ませることが目的。

ユーザーへの確認結果（2026-05-11）:
- 採用方針 = 「URLパラメータで YouTube ロゴ / 関連動画 を隠す」
- 不採用 = 「IFrame Player API での完全カスタムUI」「controls=0 で完全非表示」「外側装飾の追加のみ」

## 変更方針

`apps/worker/src/index.ts` の `videoEmbedUrl()`（516〜524行）で生成している YouTube embed URL に、ブランディング抑制系のクエリパラメータを追加するのみ。Vimeo 側はそのまま。

### 付与するパラメータ（YouTube）

| パラメータ | 値 | 効果 |
|---|---|---|
| `modestbranding` | `1` | コントロールバーの YouTube ロゴを非表示（※ポリシー上、再生中の右上「YouTube」ウォーターマーク自体は消せない場合あり） |
| `rel` | `0` | 終了時の関連動画を「同じチャンネル内のみ」に制限 |
| `iv_load_policy` | `3` | 動画アノテーション（注釈）を非表示 |
| `playsinline` | `1` | モバイル（iOS Safari / LIFF 内）でフルスクリーンに飛ばずインライン再生 |
| `color` | `white` | プログレスバーを赤→白に（YouTube 感を弱める） |

> 補足: YouTube の規約上、再生プレイヤーから「YouTube」ウォーターマークを完全に消すことはできない。本対応で消えるのは「コントロールバー内のロゴ」「他チャンネルの関連動画」「アノテーション」まで。完全カスタムUIが必要になった場合は別途 IFrame Player API での実装が必要。

## 変更ファイル

- `apps/worker/src/index.ts`（516〜524行の `videoEmbedUrl()`）

### 修正イメージ（YouTube 分岐のみ）

```js
m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/);
if(m) {
  var params = 'modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&color=white';
  return 'https://www.youtube.com/embed/' + m[1] + '?' + params;
}
```

Vimeo 側（521-522行）・fallback（523行）は変更しない。

## 検証方法

1. ローカル / 開発環境で worker を起動し、動画コンテンツ型の LP ページを開く（例: `/lp/<slug>`）。
2. LIFF 経由でアクセス許可された状態でレンダリングし、以下を目視確認:
   - プレイヤー右下のコントロールバーから YouTube ロゴが消えている
   - 動画終了時に他チャンネルの関連動画サジェストが表示されない
   - アノテーション（i マーク等）が表示されない
   - プログレスバーが白色になっている
   - iOS Safari / LINE アプリ内ブラウザでフルスクリーンに飛ばずインライン再生される
3. 動画のオートプレイは現状通り「ユーザーの再生ボタンクリックで開始」のままであることを確認（`allow="autoplay"` は維持するが `autoplay=1` は付けない）。
4. `?v=...` 形式 / `youtu.be/...` 形式 / `youtube.com/shorts/...` 形式 すべてで動画IDが正しく抽出され、パラメータが付与されることを確認。

## 影響範囲

- LP ページの動画再生UIのみ。既存DBスキーマ・APIレスポンス・管理画面側に影響なし。
- 既に保存されている `lp_pages.video_url` の値はそのまま使える（URL 加工はサーバ側で都度行うため）。

---

# 追補: LP URL を LINE トーク内から正しく開けるようにする

## Context（2026-05-12 追加）

YouTube ブランディング抑制の修正は本番デプロイ済み（PR #2、`fc28cee`）。実機で動作確認するため `https://<worker-domain>/lp/test1?v=2` をテスト配信で送ったところ、LINE 内ブラウザで開けなかった（白画面 / 開かない症状）。

調査の結果、LP URL を LINE トーク内から開く際に2層の問題があることが判明:

### 根本原因

**① テスト配信本文の自動URL書き換え（auto-track）**
- `apps/worker/src/routes/broadcasts.ts:428` の `autoTrackContent()` が、配信本文の URL を `/t/<linkId>` トラッキング URL に置換する。
- スキップ対象は `apps/worker/src/services/auto-track.ts:27-32` の SKIP_PATTERNS のみ:
  ```
  /\/t\/[0-9a-f-]{36}/   ← トラッキング URL自身
  /liff\.line\.me/       ← LIFF URL
  /line\.me\/R\//        ← LINE deep link
  /your-worker-name/     ← プレースホルダ（実 worker ドメインにマッチしない）
  ```
- 結果: `https://<worker>/lp/test1?v=2` は wrap されて `https://<worker>/t/<linkId>` に置換され、トーク本文にはこの短縮URLが入る。

**② `/t/:linkId` の LIFF リダイレクト → 最終 `/lp/<slug>` チェーンの脆さ**
- `apps/worker/src/routes/tracked-links.ts:229-296` が LINE WebView 判定で `${LIFF_URL}?redirect=/t/<id>` にリダイレクト。
- LIFF 経由で `?lu=<userId>` を付けて再度 `/t/<id>` へ戻り、最終的に `link.original_url`（= `/lp/test1?v=2`）へ 302。
- `/lp/:slug`（`apps/worker/src/index.ts:441-576`）は再び `liff.init` を要求する別ページ。LIFF コンテキストが切れている／slug が実在しないと白画面 or 404。
- `lp_pages.test1` が本番 D1 に存在しないなら、最終ページは「ページが見つかりません」HTML を返している（`index.ts:448-457`）。

**③ 管理画面の「URLコピー」が LIFF 形式でない**
- `apps/web/src/app/lp-pages/page.tsx:96` が `${origin}/lp/${slug}` をコピー。LIFF 形式 `https://liff.line.me/<LIFF_ID>/lp/<slug>` ではない。
- LIFF URL 形式なら auto-track にスキップされ（`/liff\.line\.me/` パターンに一致）、かつ LIFF が直接 endpoint（worker の `/lp/*`）を開くため、`liff.init` も初回からコンテキスト OK。

## 対応方針（推奨）

短期と中期に分ける。今すぐ実機検証したいユーザー要望には A だけで足りる。

### A. 即時の対応（手動・コード変更なし）

LP の LIFF 形式 URL を直接テスト配信本文に貼って送る:
```
https://liff.line.me/<LIFF_ID>/lp/<slug>?v=2
```

- `<LIFF_ID>` は `line_accounts.liff_id`（該当 LP の `line_account_id`）または `env.LIFF_URL` の URL から抽出（`apps/worker/src/index.ts:467` の正規表現と同じパターン）。
- `<slug>` は対象 LP の slug。"test1" は会話上のプレースホルダだった可能性があるので **実在 slug を確認する必要あり**。
- LIFF URL は auto-track の SKIP_PATTERNS にマッチするので、トーク本文に**そのまま生 URL として残る**。
- LIFF が `/lp/<slug>?v=2` を直接 LINE WebView で開き、`liff.init` も最初から正常動作する。

事前確認（本番 D1）:
```bash
cd apps/worker && pnpm wrangler d1 execute line-crm --env production --remote --command \
  "SELECT id, slug, name, line_account_id, is_active FROM lp_pages WHERE slug LIKE '%test%' OR is_active=1 ORDER BY created_at DESC LIMIT 10"
```
で実在する slug と `line_account_id` を確認 → 紐づく `line_accounts.liff_id` を取得 → LIFF URL を組み立てる。

### B. 中期の修正（コード改善・別タスク化推奨）

実機検証だけなら A で完了するが、根本対策として以下を別 PR で対応するのが望ましい:

1. **管理画面の copyUrl を LIFF 形式に変更**
   - `apps/web/src/app/lp-pages/page.tsx:95-103` を、`lp.line_account_id` から LIFF ID を解決して `https://liff.line.me/<LIFF_ID>/lp/<slug>` を返すよう変更。
   - 既存 API（`apps/worker/src/routes/line-accounts.ts` 等）に LIFF ID を取れるエンドポイントがあるかを先に調査。

2. **auto-track の SKIP_PATTERNS に LP 短縮 URL を追加**
   - `apps/worker/src/services/auto-track.ts:27-32` の `/your-worker-name/` プレースホルダを修正し、自分自身の worker ドメイン（`env.WORKER_URL` のホスト）を SKIP_PATTERNS に動的追加する関数化。これで仮に worker 直 URL が貼られても auto-track は wrap しなくなる。

これらは今回の YouTube 修正と独立したスコープなので、本プランでは A のみ対応する。

## 検証方法

1. 上記 SQL で実在 slug（例: `<actual-slug>`）と `liff_id` を取得。
2. 配信本文に `https://liff.line.me/<LIFF_ID>/lp/<actual-slug>?v=2` を含む新規 draft broadcast を作成（既存 UI: `/broadcasts` → 「+ 新規配信」）。
3. `POST /api/broadcasts/:id/test-send` で `test_recipients` 宛にテスト送信。
4. 実機 LINE で受信したメッセージ内の URL をクリック → LIFF 経由で LP ページが開き、YouTube 動画プレイヤーから:
   - YouTube ロゴ（コントロールバー）が消えている
   - プログレスバーが白
   - アノテーション非表示
   - モバイルでインライン再生される
5. 既知の制約: 右上の「YouTube」ウォーターマークは規約上残る場合あり。

## このタスクで触るファイル

- なし（A 案はコード変更不要、運用手順のみ）。
- B 案を実施する場合は別 PR / 別プランファイルに切り出すこと。
