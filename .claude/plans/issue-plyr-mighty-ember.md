# Plan: LP動画埋め込みを Plyr プラグインに置き換える Issue を起票

## Context（なぜこの Issue を作るか）

LP（ランディングページ）機能の動画埋め込みは現在、YouTube IFrame Player API を直接呼び出し、自前の `.video-overlay` / `.play-btn` を被せて YouTube の標準UIを隠す**約60行の独自実装**になっている（`apps/worker/src/index.ts:481-503, 522-565`）。

- YouTubeブランディング抑制が `modestbranding=1&rel=0&iv_load_policy=3&controls=0&color=white` パラメータと手書きCSSの組み合わせに依存しており、仕様変更に弱い
- Vimeoは `<iframe>` 素埋めで再生UIに統一感がない
- 字幕・キーボード操作・PiPなどのアクセシビリティを自前で保守する負債

これらを軽量な動画プレイヤーライブラリ **[Plyr](https://github.com/sampotts/plyr)** に置き換え、UIを統一しメンテナンスコストを下げる。Plyr は YouTube / Vimeo / HTML5 を共通APIで扱え、ポスター画像・カスタムスキン・ブランディング抑制をネイティブにサポートする。

## 起票方針（確認済み）

- 導入方式：**CDN 経由**（jsDelivr）。既存の marked / DOMPurify / LIFF SDK と同じ流儀
- 対応範囲：**YouTube + Vimeo の両方を Plyr 化**
- サムネイルUI：**Plyr の `youtube.customControls` + 自動 poster で再現**、既存の `.video-overlay` / `.play-btn` / `initYouTubePlayer()` 系コードは削除

## Issue 起票内容（最終形）

リポジトリ: `blacksanta/line-harness-oss`
ラベル: `enhancement`
タイトル: `[Feature] feat(lp): LP動画埋め込みを Plyr プラグインに置き換える`

### 本文（Markdown）

```markdown
## 概要 / 背景
LP（ランディングページ）機能の動画埋め込みを、軽量な動画プレイヤーライブラリ [Plyr](https://github.com/sampotts/plyr) に置き換える。

現状は YouTube IFrame Player API を直接呼び、自前の `.video-overlay` + `.play-btn` で標準UIを隠している（`apps/worker/src/index.ts:481-503, 522-565` に約60行）。これを Plyr に統一することで、YouTubeブランディング抑制・カスタムpostersamサムネイル・キーボード操作・Vimeo対応をライブラリレベルで安定して享受でき、保守コストを下げる。

## ゴール
- YouTube / Vimeo どちらも Plyr の共通UIで再生される
- 既存と同等の体験（サムネイル表示 → クリックで再生、YouTube標準UI/関連動画/ロゴ非表示）
- 自前の動画オーバーレイ用CSS・JSが削除されコードが簡潔になる

## 仕様
- Plyr は **CDN 経由**で読み込む（jsDelivr）
  - CSS: `https://cdn.plyr.io/3.7.8/plyr.css`
  - JS:  `https://cdn.plyr.io/3.7.8/plyr.polyfilled.js`
- LP公開HTML（`apps/worker/src/index.ts` の `/lp/:slug` ハンドラ）の動画レンダリングを Plyr に置換
- YouTube
  - `<div class="plyr__video-embed" id="player"><iframe src="...youtube.com/embed/{id}?..."></iframe></div>` を出力
  - Plyr 初期化時に `youtube: { noCookie: false, rel: 0, showinfo: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1 }` を渡す
  - サムネイル：`new Plyr(...).poster = 'https://img.youtube.com/vi/{id}/maxresdefault.jpg'` で再現
- Vimeo
  - `<div class="plyr__video-embed"><iframe src="https://player.vimeo.com/video/{id}?..."></iframe></div>`
  - `vimeo: { byline: false, portrait: false, title: false }` で UI を抑制
- フォールバック（YouTube/Vimeo以外のURL）
  - 現状の素iframeのまま据え置き（必要に応じて将来 `<video>` + Plyr HTML5 対応を検討）
- 既存の独自実装は削除
  - CSS: `.video-wrap iframe { pointer-events:none }`、`.video-overlay`、`.video-overlay.playing`、`.play-btn`、`.play-btn svg`、`.video-overlay:hover .play-btn`
  - JS: `initYouTubePlayer()`、`createYouTubePlayer()`、`PLAY_ICON` 定数、`ytPlayer` 変数、`<script src="https://www.youtube.com/iframe_api"></script>`
  - `render()` 内の `if(isYt) { ...オーバーレイ生成... } else { ... }` 分岐は Plyr 統一で1経路に
- `videoEmbedUrl()` / `youtubeId()` は Plyr 用のクエリ調整のみして残す（パラメータは Plyr の options 側に移譲してもよい）

## 変更対象ファイル

| 層 | ファイル | 変更点 |
|---|---|---|
| 公開LP HTML | `apps/worker/src/index.ts:478-503` | `<script>` に Plyr CDN を追加、YouTube IFrame API の `<script>` 削除、`.video-wrap`系CSSを Plyr 用に整理（`padding-bottom:56.25%` のラッパーは維持） |
| 公開LP JS | `apps/worker/src/index.ts:522-589` | `youtubeId()` は流用 / `videoEmbedUrl()` は Plyr に任せる方向で簡素化 / `initYouTubePlayer()`・`createYouTubePlayer()`・`PLAY_ICON`・`ytPlayer` を削除 / `render()` を Plyr ベースに書き換え（new Plyr で初期化） |
| 動作確認 | `apps/worker/src/index.ts` の `/lp/:slug` をローカル/staging で実機確認 | YouTube/Vimeo の双方で再生・サムネイル表示・関連動画非表示を確認 |

> 既存のDBスキーマ / API / SDK / 管理画面 / MCP ツールには**変更不要**。あくまで公開LP HTMLのレンダリング層のみの差し替え。

## 受け入れ条件
- [ ] LP公開ページ（`/lp/:slug`）で YouTube 動画が Plyr のUIで再生される
- [ ] 同ページで Vimeo 動画も Plyr の同じUIで再生される
- [ ] 再生前に YouTube サムネイル（`maxresdefault.jpg`）が表示される
- [ ] YouTube の標準UI（赤い再生ボタン・ロゴ・関連動画・字幕ロード）が表示されない
- [ ] 旧実装（`.video-overlay`, `.play-btn`, `initYouTubePlayer()`, IFrame API の `<script>` タグ）がコードから消えている
- [ ] iPhone Safari の LIFF / LINE 内ブラウザで再生できる（`playsinline` が効いている）
- [ ] CSP / mixed content の警告がブラウザコンソールに出ない

## 補足（実装者向けメモ）
- Plyr のバージョンは執筆時点最新の `3.7.8` を想定。CDN URL固定。
- LIFF 内（iframe）で動かすため `playsinline` は必須。Plyr の YouTube provider は自動でセットするが、念のため埋め込みURL側にも残す。
- `pointer-events:none` を iframe にかける必要は無くなる（Plyr がクリックを iframe ではなくPlyr UI で受ける）。
- サムネイル取得失敗時（`maxresdefault` が無い動画）に備え `hqdefault.jpg` への onerror フォールバックを `<img>` ベースの poster で実装してもよい。
- Vimeo の thumbnail はAPI不要では取れないので、Plyr のデフォルト挙動（最初のフレーム）に任せる。
```

## このリポジトリ・ローカルでの実行手順（Issueに含めない、起票後に実行する内容）

`gh-issue-create` skill のフロー通り：

1. `gh auth status` で書き込み権限のあるアカウントを確認
2. `gh issue create --repo blacksanta/line-harness-oss --title "[Feature] feat(lp): LP動画埋め込みを Plyr プラグインに置き換える" --label enhancement --body-file <一時ファイル>` で起票
3. 返ってきた Issue URL をユーザーに提示

## 検証（Issue 起票後、別タスクで実装する際の確認方法）

実装時に行う動作確認（**今回の Issue 起票自体には不要**）：

- ローカル: `pnpm --filter worker dev` で Worker を起動 → `/lp/:slug` を Safari (LIFFモック) で開く
- staging: `staging` ブランチへマージ → Cloudflare Workers の preview にデプロイ → 実機 LINE で開く
- DevTools で `.plyr` 要素が描画されている / 旧 `.video-overlay` が無いことを確認
- ネットワークタブで `https://cdn.plyr.io/3.7.8/plyr.polyfilled.js` が200で読まれていることを確認
- YouTube動画再生中に右下YouTubeロゴ・関連動画レイヤーが非表示であることを確認
