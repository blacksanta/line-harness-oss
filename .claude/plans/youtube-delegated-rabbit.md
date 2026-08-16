# LP動画: YouTube タイトルバー/「YouTube で見る」非表示対応

## Context

LP 機能 (`/lp/:slug`) で YouTube 動画を Plyr 経由で再生すると、再生中にプレーヤー上部に
YouTube のタイトルバー（動画タイトル・チャンネルアイコン・「YouTube で見る」リンク）
が表示されてしまう、というユーザー報告。

- `rel: 0` などの URL パラメータは既に設定済み（`apps/worker/src/index.ts:587`）
- ただし `rel=0` は 2018 年以降「関連動画を完全に隠す」効力を失っており、
  `modestbranding=1` も 2023 年に YouTube が実質廃止。URL パラメータだけで
  YouTube のブランディングを消すことは現状不可能。
- Plyr 3.x は本来、YouTube embed の iframe を上下に少しはみ出すように拡大してマスクし、
  自前のコントロールUIで覆うことで YouTube のタイトルバー/ロゴを見えなくする設計。
- 現在の CSS（`apps/worker/src/index.ts:489`）が iframe を `top:0;left:0;width:100%;height:100%`
  に強制しており、Plyr が iframe にあてようとするスケーリング/オフセットのインラインスタイルが
  打ち消されてタイトルバーが透けて見えていると推測される。
- 期待結果: YouTube タイトルバーが視認できなくなる。Plyr 独自のコントロールUI（再生/シーク/全画面）
  はそのまま動作する。

## 修正対象ファイル

- `apps/worker/src/index.ts`（LP 用 HTML テンプレートが直書きされている、約470〜682行）

## 変更内容

### 1. iframe 用 CSS のスコープを「フォールバック用 iframe のみ」に狭める

**現状**（`apps/worker/src/index.ts:489`）:

```css
.video-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
```

→ 子孫セレクタなので、Plyr 配下の iframe にも当たって Plyr の拡大処理を阻害する。

**修正**: 子セレクタ + Plyr 用の別ルールに分離する。

```css
.video-wrap > iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
.video-wrap .plyr{position:absolute;inset:0;width:100%;height:100%;border-radius:12px;overflow:hidden}
```

- フォールバック iframe（Vimeo/YouTube ID が取れなかった場合の直挿し iframe、
  `apps/worker/src/index.ts:565` 周辺）は `.video-wrap > iframe` で従来どおり。
- Plyr 配下の iframe は Plyr が設定するインライン style に委ねる（明示ルールを書かない）。
- `.plyr` 側に `overflow:hidden` を念のため明示し、Plyr が iframe をはみ出させても
  コンテナ外に漏れない（角丸からも崩れない）ことを担保する。
  `.video-wrap` 側にも既に `overflow:hidden` がある（488行）。

### 2.（保険）Plyr の拡大が効かなかった場合のための YouTube iframe スケール CSS

上記 1 だけで解消する見込みだが、効果が足りない場合は以下を追記して iframe を
能動的に拡大マスクする（実機確認後に必要なら適用）。

```css
.video-wrap .plyr__video-embed iframe{
  top:-50%;left:-50%;width:200%;height:200%;
  transform:translate(50%,50%) scale(0.667);
  transform-origin:50% 50%;
}
```

意味: iframe を 200% にしてから 0.667 倍にスケールバック。可視領域より大きく描画させ、
タイトルバーがコンテナ外にクロップされる。Plyr 公式が紹介している `useYouTube` の
標準カバーリングと同等の効果。

### 3. URL パラメータ `modestbranding` / `showinfo` の扱い

`apps/worker/src/index.ts:587` の `youtube: { ...modestbranding:1, showinfo:0... }` は
2023年以降の YouTube では実質効果がないが、`rel:0`（同一チャンネルに限定）と
`iv_load_policy:3`（アノテーション非表示）はまだ意味があるため、**現行設定は維持**。

## 検証手順

1. `staging` ブランチへ PR → マージし、`https://staging.line-harness-admin-134f68c9.pages.dev`
   にデプロイする（`apps/worker/**` は path フィルタ対象外の可能性があるため、必要に応じて
   `gh workflow run deploy-pages.yml --ref staging` で手動キック）。
   - ※ 本プロジェクトは Cloudflare Pages デプロイのフィルタが `apps/web/**, packages/shared/**, .github/workflows/deploy-pages.yml` の3パスのみ。
     `apps/worker/` は **Pages の対象外**で、Worker は別途デプロイされる可能性がある。
     デプロイパイプラインの再確認が必要（後述「実装前の追加確認事項」）。
2. LP（YouTube 動画を埋め込んだスラッグ）を LINE LIFF と PCブラウザ両方で開く。
3. 確認項目:
   - 再生前のポスター表示状態でタイトルバーが見えないこと。
   - 再生開始直後・再生中にタイトルバーが画面に出ないこと。
   - Plyr のコントロール（再生/一時停止、シーク、全画面）は従来どおり動くこと。
   - 動画下に Markdown / カウントダウンが従来どおりレイアウト崩れなく出ること。
   - 動画再生終了後の挙動（本件のスコープ外）は変化なしで問題なし。
4. Vimeo 動画埋め込みの LP がある場合、Vimeo 側も回帰がないこと（同じ Plyr 経路）。
5. 直挿し iframe（YouTube ID も Vimeo ID も解釈できない URL）のフォールバックが
   従来どおり 16:9 で表示されること。

## 実装前の追加確認事項

- LP の HTML は `apps/worker/src/index.ts` にあり、Cloudflare Pages（`apps/web/`）ではなく
  **Cloudflare Workers 側**に配置されている。CLAUDE.md 記載のデプロイフローは Pages 用なので、
  Worker のデプロイ手順／パスフィルタを別途確認する必要がある
  （`.github/workflows/` 配下に worker 用ワークフローがあるか）。
- 上記が確認できないと「staging 環境に反映できているか」が分からず実機検証が成立しない。
  PR を切る前に確認する。

## スコープ外（今回やらない）

- 再生終了時の関連動画オーバーレイ対策（YouTube は 2018 年以降 `rel=0` でも完全には消せない）。
  今回ユーザーの困りごとはこれではなく再生中のタイトルバーのため、別件として扱う。
- 動画ホスティングを Vimeo Pro／自前 HLS 等へ切り替える案（コンテンツ運用に影響が大きい）。
