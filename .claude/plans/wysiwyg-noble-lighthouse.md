# LP機能: タイトル非表示 + WYSIWYG（Tiptap）導入

## Context

LP（ランディングページ）の管理機能で、現状は以下の課題がある:

1. プレビュー上部および公開LPページの最上部に **ページ名（タイトル h1）が常に表示される** が、これは管理用のラベルであり LP として見せたくない。
2. 本文（テキストブロック）が **textarea で markdown を直接書く方式** で、文字色・文字サイズ・表示揃えなどの装飾ができない。非エンジニアでも扱える WYSIWYG 編集体験が必要。

ゴール:
- ページ名 h1 を編集プレビュー / 公開ページの両方から削除（ブラウザタブの `<title>` は残す）。
- テキストブロックの編集を Tiptap ベースの WYSIWYG に置換。文字色・背景色・文字サイズ・表示揃え・見出し/太字/斜体/リスト/リンクをサポート。
- 既存の markdown データはレンダリング崩れなく扱えるようにし、編集→保存のタイミングで HTML 化する lazy migration とする（DB スキーマ・マイグレーション不要）。

## 変更ファイル一覧

### 新規
- `apps/web/src/components/lp-pages/rich-text-editor.tsx` — Tiptap エディタ本体（`'use client'`、`dynamic(..., { ssr: false })` で読み込まれる）
- `apps/web/src/components/lp-pages/rich-text-toolbar.tsx` — ツールバー UI（太字/斜体/見出し/リスト/リンク/色/サイズ/揃え）
- `apps/web/src/lib/lp-html.ts` — 共有ヘルパ（`looksLikeHtml`, `sanitizeLpHtml`, `isContentEmpty`）

### 修正
- `apps/web/package.json` — Tiptap 依存追加
- `apps/web/src/components/lp-pages/sortable-block-item.tsx` — markdown ケースの textarea を Tiptap に置換
- `apps/web/src/components/lp-pages/lp-preview.tsx` — `<h1>` 削除、HTML/Markdown 判定で sanitize 分岐
- `apps/worker/src/index.ts` — SSR の `<h1 class="title">` 行削除、`renderBlock` の markdown ケースで HTML/Markdown 判定、`.title` CSS 削除

## 詳細

### 1. タイトル h1 の削除

- `apps/web/src/components/lp-pages/lp-preview.tsx:103-112` の `<h1>{form.name || '（タイトル未入力）'}</h1>` ブロックを削除。
- `apps/worker/src/index.ts:618` の `var html = '<h1 class="title">' + escapeHtml(payload.name) + '</h1>';` を `var html = '';` に変更。
- `apps/worker/src/index.ts:491` の `.title{...}` CSS ルールを削除（未使用化）。
- `apps/worker/src/index.ts:477` の `<title>${escape(lp.name)}</title>` は **残す**（ブラウザタブ用）。

### 2. WYSIWYG 化

#### 依存追加（`apps/web/package.json`）

```
@tiptap/react
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-text-style
@tiptap/extension-color
@tiptap/extension-highlight
@tiptap/extension-text-align
@tiptap/extension-font-size  ※未配布なら TextStyle 拡張の自前 Mark でフォールバック
@tiptap/extension-link
@tiptap/extension-placeholder
```

すべて v3 系で揃える。Worker 側は CDN の marked/DOMPurify を使い続けるので依存追加不要。

#### `apps/web/src/lib/lp-html.ts`（新規）

3 つの純粋関数を提供:

- `looksLikeHtml(s: string): boolean` — `/<\/?[a-z][\s\S]*?>/i.test(s)` で HTML らしき文字列を判定。後方互換の入口。
- `sanitizeLpHtml(raw: string): string` — `DOMPurify.sanitize(raw, { ADD_ATTR: ['style', 'target', 'rel'] })` でラップ。style 属性を明示許可。
- `isContentEmpty(html: string): boolean` — `html.replace(/<[^>]+>/g, '').trim() === ''` で `<p></p>` 等の空タグだけのケースを空扱い。

#### `apps/web/src/components/lp-pages/rich-text-editor.tsx`（新規）

- `'use client'` 付き。Props: `value: string; onChange: (html: string) => void; placeholder?: string`。
- `useEditor({ ..., immediatelyRender: false, onUpdate: ({ editor }) => onChange(editor.getHTML()) })`（Next.js 互換のため `immediatelyRender: false` 必須）。
- 拡張: `StarterKit, TextStyle, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ['heading', 'paragraph'] }), FontSize, Link.configure({ openOnClick: false, autolink: true }), Placeholder.configure({ placeholder })`。
- `font-size` 拡張が未配布なら、`TextStyle.extend({ addAttributes() { return { fontSize: { default: null, parseHTML: el => el.style.fontSize || null, renderHTML: attrs => attrs.fontSize ? { style: 'font-size:' + attrs.fontSize } : {} } } } })` 形式の自前 Mark でフォールバック。
- 初期 content 決定ロジック:
  - `value` が空 → `''`
  - `looksLikeHtml(value)` が true → `value` をそのまま
  - false → `marked.parse(value, { async: false })` を通した HTML（既存 markdown データの後方互換）
- 上部に `<RichTextToolbar editor={editor} />`、下部に `<EditorContent editor={editor} />`。

#### `apps/web/src/components/lp-pages/rich-text-toolbar.tsx`（新規）

- 受け取った `editor` インスタンスに対するボタン群。各ボタンの `isActive` を反映してハイライト。
- 太字 / 斜体: `toggleBold` / `toggleItalic`
- 見出し H2, H3: `toggleHeading({ level: 2 | 3 })`
- 箇条書き / 番号付き: `toggleBulletList` / `toggleOrderedList`
- リンク: `prompt('URL')` で入力 → 空なら `unsetLink`、それ以外は `setLink({ href })`
- 文字色: `<input type="color">` → `setColor(value)` / 解除は `unsetColor`
- 背景色: `<input type="color">` → `toggleHighlight({ color })`
- 文字サイズ: `<select>` で `12px / 14px / 16px / 18px / 20px / 24px / 32px` プリセット → `setMark('textStyle', { fontSize })` または拡張の `setFontSize(value)`
- 揃え: 左/中央/右ボタン → `setTextAlign('left' | 'center' | 'right')`

#### `apps/web/src/components/lp-pages/sortable-block-item.tsx`

- `case 'markdown'` 内の `<textarea>...</textarea>`（L61-67）を `<RichTextEditor value={block.text} onChange={(html) => onChange({ ...block, text: html })} placeholder="本文を入力..." />` に置換。
- `RichTextEditor` は `dynamic(() => import('./rich-text-editor'), { ssr: false })` で読み込み、SSR 時のハイドレーション問題を回避。

#### `apps/web/src/components/lp-pages/lp-preview.tsx`

- `useEffect` 内（L60-69）で markdown ブロックを HTML 化するロジックを更新:
  ```ts
  if (b.type === 'markdown' && b.text.trim()) {
    const raw = looksLikeHtml(b.text)
      ? b.text
      : (marked.parse(b.text, { async: false }) as string)
    next[b.id] = sanitizeLpHtml(raw)
  }
  ```
- 既存 `DOMPurify.sanitize` 直呼びを `sanitizeLpHtml` 経由に統一。
- `isContentEmpty` で空タグのみのときはレンダリング対象から外す（任意）。
- `<style jsx global>` の `.lp-preview-body` ルールは `text-align: inherit` 等の干渉が無いことを確認（既存ルールは margin / color / font 系のみで text-align 競合なし）。

#### `apps/worker/src/index.ts`

- L491 の `.title{...}` CSS 削除（タイトル h1 撤去に伴い不要）。
- L618 の h1 出力削除（`var html = '';` で開始）。
- L572-575 の markdown ブランチを以下に置換:
  ```js
  case 'markdown': {
    var text = block.text || '';
    var isHtml = /<\/?[a-z][\s\S]*?>/i.test(text);
    var raw = isHtml ? text : (window.marked ? window.marked.parse(text) : text);
    var clean = window.DOMPurify
      ? window.DOMPurify.sanitize(raw, { ADD_ATTR: ['style', 'target', 'rel'] })
      : raw;
    return '<div class="body">' + clean + '</div>';
  }
  ```
- `.body` 系 CSS は色・サイズ・揃えに干渉しない（既存は margin / color / link 色のみ）。Tiptap が出す inline style がそのまま効く。

### 3. データ後方互換（lazy migration）

- **判定**: `looksLikeHtml = /<\/?[a-z][\s\S]*?>/i.test(text)` で markdown / HTML を区別。
- **既存データ**: DB の `blocks.text` は markdown 文字列のまま。読み込み時に判定→必要なら marked で HTML 化してレンダリング。
- **編集→保存**: Tiptap が `getHTML()` を返すので、保存ボタンを押すと DB 値が HTML 文字列に置き換わる（自然なマイグレーション）。
- **DB スキーマ不変**: `packages/db/src/lp-pages.ts:128-133` の `normalizeBlocks` は `markdown` ブロックの `text` が string であることだけ検証しているので、中身が markdown でも HTML でも素通り。型 (`{ type: 'markdown'; text: string }`) も変更不要。
- **legacy `body` カラム**: `deriveBlocksFromLegacy`（`packages/db/src/lp-pages.ts:79-91`）も markdown 前提だが同じ判定ロジックでレンダリング側が吸収する。

### 4. 再利用する既存実装

- `marked` / `DOMPurify` は `apps/web/src/components/lp-pages/lp-preview.tsx:4-5` で既に import 済み。新規ヘルパからも同じものを利用。
- 公開ページの marked / DOMPurify は CDN 読み込み（`apps/worker/src/index.ts:479-480`）。追加変更不要。
- ブロック追加・並び替え（`block-editor.tsx`, `sortable-block-item.tsx`）の枠組みは流用。markdown ケースの中身だけ差し替え。

## 検証手順

1. **既存LP（markdown データ）を編集画面で開く** — Tiptap に整形された見た目で表示される（見出し/リスト/太字が反映）。タイトル h1 が消えている。
2. **何も変更せず保存** — `wrangler d1 execute` で `blocks` JSON を確認、`text` フィールドが HTML 文字列に変わっている（lazy migration 成立）。
3. **ツールバー全機能を試す** — 太字/斜体/見出し H2,H3/箇条書き/番号付き/リンク/文字色/背景色/文字サイズ/揃えがエディタ内とプレビュー両方で反映。
4. **プレビュー** — 右側スマホ枠で同じスタイルが見える。タイトル h1 が表示されない。
5. **公開ページ `/lp/:slug` を LIFF 経由で開く** — タイトル h1 なし、本文スタイルが再現される。ブラウザタブには `payload.name` が出ている。
6. **編集経験のない既存LP** — `/lp/:slug` から開いて isHtml=false 経路で従来通り marked レンダリングされる。
7. **サニタイズ確認** — `view-source:` で `<script>` や `javascript:` URL が混入していないか確認。リンクの `target="_blank"`, `rel="noopener noreferrer"` が残ること。

## 注意点

- Tiptap v3 + Next.js 15 は `immediatelyRender: false` 必須。
- DOMPurify v3 はデフォで style 属性を許可するが、明示的に `ADD_ATTR: ['style']` を渡すことで保守的に統一管理する。
- ツールバーの「リンク解除」忘れに注意。`Link.configure({ openOnClick: false })` で編集時の誤遷移防止。
- `@tiptap/extension-font-size` の v3 配布有無は実装時に確認。なければ TextStyle 拡張で自作 Mark。
