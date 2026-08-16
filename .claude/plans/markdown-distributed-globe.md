# LP「複数ブロック自由構成」化

## Context

現状のLP（ランディングページ）は `lp_pages.video_url` と `lp_pages.body` の2カラムで動画とMarkdownを持ち、公開ページのレンダラ（`apps/worker/src/index.ts` 行549-592 の `render()`）が **「動画 → Markdown」の順でハードコード** している。`content_type` 廃止（commit 63d41cb）と Plyr 化（commit 39cc6e3）で「動画+Markdownを併用」までは到達したが、順序固定・1ブロックずつという制約が残っている。

これを **複数ブロックを任意順に並べられる** 構成に変更する。例: `[Markdown(導入)] → [動画] → [Markdown(CTA)] → [動画(補足)] → [Markdown(FAQ)] → [ボタン]`。ブロック種は **video / markdown / image / button / divider** の5種、並び替えは **管理画面のドラッグ&ドロップ** で行う。既存LPは自動マイグレーションで新形式に変換し、APIは旧 `videoUrl`/`body` フィールドも返し続けて後方互換を保つ。

## 方針サマリ

- DB: `lp_pages.blocks TEXT`（JSON配列）を新設。`video_url` / `body` カラムは **互換のため残し**、`blocks` を保存するたびにサーバ側で「最初のvideo→`video_url`、markdown連結→`body`」へ自動同期。
- マイグレーション030: 既存行を `blocks` に自動変換（D1 の `json_array`/`json_object` で SQL 内完結）。
- 公開LPレンダラ: `render()` を blocks配列を回す方式に置き換え。動画ブロックが複数あっても Plyr が独立インスタンス化できるよう `#lp-player-${i}` で一意ID化。`blocks` が空ならレガシー（videoUrl/body）にフォールバックして旧データも安全に描画。
- 管理画面: 編集ページを新設し、`@dnd-kit/sortable` で並び替え。各ブロックはインラインフォーム。
- MCP: `create_lp_page` / `manage_lp_pages` に `blocks` 引数を追加。旧 `videoUrl`/`body` も受け付け、サーバで blocks に変換。

## ロールアウト（PR分割）

| PR | 内容 | 公開LPの挙動 |
| --- | --- | --- |
| **PR1: 基盤** | DB migration / SDK 型 / API（serialize, POST/PUT, check-access） | 旧 render() のまま、blocks 無視で従来動作 |
| **PR2: レンダラ** | `apps/worker/src/index.ts` の render() を blocks 配列方式に。レガシーは fallback。 | blocks があれば自由順、無ければ従来通り |
| **PR3: 管理UI** | `@dnd-kit/*` 追加、編集ページ・コンポーネント新設、一覧から導線追加 | 変化なし（管理画面のみ） |
| **PR4: MCP** | create_lp_page / manage_lp_pages に blocks 引数 | 変化なし（MCPのみ） |

各PRが独立してデプロイ可能で、PR1 だけ入っても既存LPは壊れない。

## 修正ファイル一覧

### 新規
- `packages/db/migrations/030_lp_pages_blocks.sql`
- `apps/web/src/app/lp-pages/[id]/edit/page.tsx`
- `apps/web/src/components/lp-pages/block-editor.tsx`
- `apps/web/src/components/lp-pages/sortable-block-item.tsx`
- `apps/web/src/components/lp-pages/add-block-menu.tsx`
- `apps/web/src/lib/lp-blocks.ts`（フロント側型・defaults）

### 既存改修
- `packages/db/schema.sql` 行628-650（blocks カラム追加）
- `packages/db/src/lp-pages.ts` 行10-31, 130-243（型、CRUD、ヘルパ追加）
- `packages/sdk/src/types.ts` 行352-417（`LpBlock`, `blocks` フィールド）
- `apps/web/src/lib/api.ts` 行557-602（型の再定義側）
- `apps/worker/src/routes/lp-pages.ts` 行20-39, 65-129, 131-173, 224-275
- `apps/worker/src/index.ts` 行441-686（render と関連JS）
- `apps/web/src/app/lp-pages/page.tsx` 行146-160（編集導線、blocks サマリ表示）
- `packages/mcp-server/src/tools/create-lp-page.ts`
- `packages/mcp-server/src/tools/manage-lp-pages.ts`
- `apps/worker/src/services/lp-pages.test.ts`（baseLp に `blocks: null` 追加 + 新ヘルパのテスト）

## 詳細仕様

### 1. ブロック型定義（`packages/db/src/lp-pages.ts` / `packages/sdk/src/types.ts` 両方）

```ts
export type LpBlock =
  | { id: string; type: 'video';    url: string; caption?: string | null }
  | { id: string; type: 'markdown'; text: string }
  | { id: string; type: 'image';    url: string; alt?: string | null; href?: string | null }
  | { id: string; type: 'button';   label: string; href: string; style?: 'primary' | 'secondary' }
  | { id: string; type: 'divider' };
```

`LpPage` 型に `blocks: LpBlock[]`（SDK側、必須）/ `blocks: string | null`（DB行側、JSON文字列）を追加。`CreateLpPageInput` / `UpdateLpPageInput` に `blocks?: LpBlock[]` を追加。

### 2. ヘルパ関数（`packages/db/src/lp-pages.ts` に追加 → テスト容易な純粋関数）

- `parseBlocks(raw: string | null): LpBlock[]` — JSON parse + 配列検証、失敗は `[]`
- `deriveBlocksFromLegacy(videoUrl, body): LpBlock[]` — 旧データから [video, markdown] を生成（フォールバックと初回マイグレ用）
- `deriveLegacyFromBlocks(blocks): { videoUrl, body }` — 最初のvideo→`videoUrl`、markdown全部を `\n\n---\n\n` で連結→`body`
- `normalizeBlocks(blocks): LpBlock[]` — id 欠落補完、type validation、必須フィールド検証（不正は throw → API層が400化）

### 3. マイグレーション（`packages/db/migrations/030_lp_pages_blocks.sql`）

```sql
ALTER TABLE lp_pages ADD COLUMN blocks TEXT;

UPDATE lp_pages
   SET blocks = json_array(
         json_object('id', lower(hex(randomblob(8))), 'type', 'video',    'url', video_url),
         json_object('id', lower(hex(randomblob(8))), 'type', 'markdown', 'text', body)
       )
 WHERE blocks IS NULL
   AND video_url IS NOT NULL AND trim(video_url) <> ''
   AND body      IS NOT NULL AND trim(body)      <> '';

UPDATE lp_pages
   SET blocks = json_array(json_object('id', lower(hex(randomblob(8))), 'type', 'video', 'url', video_url))
 WHERE blocks IS NULL
   AND video_url IS NOT NULL AND trim(video_url) <> ''
   AND (body IS NULL OR trim(body) = '');

UPDATE lp_pages
   SET blocks = json_array(json_object('id', lower(hex(randomblob(8))), 'type', 'markdown', 'text', body))
 WHERE blocks IS NULL
   AND body IS NOT NULL AND trim(body) <> ''
   AND (video_url IS NULL OR trim(video_url) = '');

UPDATE lp_pages SET blocks = '[]' WHERE blocks IS NULL;
```

冪等（`WHERE blocks IS NULL` 守り）。`schema.sql` 行628-650 にも `blocks TEXT` 追加。

### 4. API 層（`apps/worker/src/routes/lp-pages.ts`）

- **serializeLpPage（行20-39）**: `blocks` を必ず返す（`parseBlocks(row.blocks)` が空ならレガシーから derive）。`videoUrl`/`body` は引き続き返す。
- **POST（行65-129）/ PUT（行131-173）**:
  - バリデーション: `blocks` か `videoUrl`/`body` の少なくとも一方が空でないことを要求（現行の必須チェックを置き換え）。
  - 保存ロジック: `blocks` が来たら `normalizeBlocks()` → `deriveLegacyFromBlocks()` で `videoUrl`/`body` を再生成して DB に同時保存。旧フィールドのみなら `deriveBlocksFromLegacy()` で blocks を生成。
- **check-access（行254-270）**: payload に `blocks` を追加（旧フィールドも併存）。

### 5. 公開LPレンダラ（`apps/worker/src/index.ts` 行549-592）

`render(payload, hasExpiry)` を全面書き換え。

```js
function safeUrl(u){
  if(!u) return '#';
  var t = String(u).trim().toLowerCase();
  if(t.startsWith('javascript:') || t.startsWith('data:')) return '#';
  return u;
}

function renderBlock(block, index, plyrTargets){
  switch(block.type){
    case 'markdown': {
      var raw = window.marked ? window.marked.parse(block.text || '') : (block.text || '');
      var clean = window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
      return '<div class="body">' + clean + '</div>';
    }
    case 'video': {
      var ytId = youtubeId(block.url);
      var vmId = ytId ? null : vimeoId(block.url);
      var src  = videoEmbedUrl(block.url, ytId, vmId);
      var usePlyr = !!(ytId || vmId);
      var pid = 'lp-player-' + index;
      if(usePlyr){
        plyrTargets.push({ selector: '#' + pid, ytId: ytId });
        return '<div class="video-wrap"><div class="plyr__video-embed" id="' + pid + '">'
             + '<iframe src="'+escapeHtml(src)+'" allowtransparency allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
             + '</div></div>';
      }
      return '<div class="video-wrap"><iframe src="'+escapeHtml(src)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }
    case 'image': {
      var img = '<img src="'+escapeHtml(block.url)+'" alt="'+escapeHtml(block.alt||'')+'" loading="lazy">';
      return block.href
        ? '<a href="'+escapeHtml(safeUrl(block.href))+'" target="_blank" rel="noopener noreferrer">'+img+'</a>'
        : img;
    }
    case 'button': {
      var cls = block.style === 'secondary' ? 'btn btn-secondary' : 'btn btn-primary';
      return '<div class="block-button"><a class="'+cls+'" href="'+escapeHtml(safeUrl(block.href))+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(block.label)+'</a></div>';
    }
    case 'divider':
      return '<hr class="block-divider">';
    default:
      return '';
  }
}

function render(payload, hasExpiry){
  app.className = '';
  var html = '<h1 class="title">' + escapeHtml(payload.name) + '</h1>';
  var blocks = (payload.blocks && payload.blocks.length) ? payload.blocks : [];
  if(!blocks.length){
    if(payload.videoUrl) blocks.push({ id:'legacy-v', type:'video', url: payload.videoUrl });
    if(payload.body)     blocks.push({ id:'legacy-b', type:'markdown', text: payload.body });
  }
  var plyrTargets = [];
  for(var i=0; i<blocks.length; i++) html += renderBlock(blocks[i], i, plyrTargets);
  if(hasExpiry) html += /* 既存カウントダウンHTML */;
  app.innerHTML = html;

  plyrTargets.forEach(function(t){
    var p = new Plyr(t.selector, {
      youtube: { noCookie:false, rel:0, showinfo:0, iv_load_policy:3, modestbranding:1, playsinline:1 },
      vimeo:   { byline:false, portrait:false, title:false }
    });
    if(t.ytId) p.poster = 'https://img.youtube.com/vi/'+t.ytId+'/maxresdefault.jpg';
  });
}
```

CSS に追加: `.btn{ display:inline-block;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700; } .btn-primary{ background:#06C755;color:#fff; } .btn-secondary{ background:#f1f5f9;color:#0f172a; } .block-button{ text-align:center;margin:24px 0; } .block-divider{ margin:24px 0;border:none;border-top:1px solid #e2e8f0; } .body img{ max-width:100%;height:auto;border-radius:8px;margin:16px 0; }`

### 6. 管理画面 編集UI

**ライブラリ**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
理由: React 19 完全対応、軽量（~30KB）、アクセシビリティ標準対応、react-dnd より現代的。
インストール: `pnpm --filter web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**`app/lp-pages/[id]/edit/page.tsx`** — クライアントコンポーネント
- 初期ロードで `api.lpPages.get(id)` → `blocks` を state に
- `<BlockEditor blocks={blocks} onChange={setBlocks} />` を表示
- 保存ボタンで `api.lpPages.update(id, { blocks })`

**`components/lp-pages/block-editor.tsx`**
- `DndContext` + `SortableContext` で並び替え
- `onDragEnd` で `arrayMove(blocks, from, to)`
- `<AddBlockMenu onAdd={addBlock} />` でブロック追加（type選択）

**`components/lp-pages/sortable-block-item.tsx`**
- `useSortable({ id: block.id })` で drag handle
- type 別のインラインフォーム（markdown は textarea、video/image は URL input、button は label + href、divider はラベルのみ）
- 削除ボタン

**ブロック default ファクトリ**（`lib/lp-blocks.ts`）:
```ts
export function createDefaultBlock(type: LpBlock['type']): LpBlock {
  const id = crypto.randomUUID();
  switch(type){
    case 'video':    return { id, type, url: '' };
    case 'markdown': return { id, type, text: '' };
    case 'image':    return { id, type, url: '', alt: '' };
    case 'button':   return { id, type, label: 'ボタン', href: '', style: 'primary' };
    case 'divider':  return { id, type };
  }
}
```

**一覧画面（`app/lp-pages/page.tsx` 行146-160）**:
- 「🎬 動画あり / 📄 本文あり」の表示を `📦 ${blocks.length}ブロック` + 型サマリに置き換え
- 操作カラムに「編集」リンク（`<Link href={\`/lp-pages/\${lp.id}/edit\`}>`）追加
- 冒頭の案内文を「新規作成はClaude Code経由、編集はこの画面から可能」に更新

### 7. MCP ツール

`packages/mcp-server/src/tools/create-lp-page.ts` と `manage-lp-pages.ts`:

```ts
const lpBlockSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string().optional(), type: z.literal('video'),    url: z.string().url(), caption: z.string().optional() }),
  z.object({ id: z.string().optional(), type: z.literal('markdown'), text: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('image'),    url: z.string().url(), alt: z.string().optional(), href: z.string().url().optional() }),
  z.object({ id: z.string().optional(), type: z.literal('button'),   label: z.string(), href: z.string().url(), style: z.enum(['primary','secondary']).optional() }),
  z.object({ id: z.string().optional(), type: z.literal('divider') }),
]);

// 既存 videoUrl, body は残しつつ追加
blocks: z.array(lpBlockSchema).optional().describe(
  "コンテンツブロックの配列（video/markdown/image/button/divider を任意順）。" +
  "未指定なら videoUrl/body から自動構成（後方互換）。" +
  "blocks 指定時は videoUrl/body は blocks から自動導出される。"
),
```

ツール説明文も「動画→本文の順」表現を削除し「任意順で配置可能」に。

### 8. テスト

**既存テスト（`apps/worker/src/services/lp-pages.test.ts`）**: `baseLp` に `blocks: null` を1行追加するだけで全テスト維持。

**追加ユニットテスト**:
- `parseBlocks`: null/不正JSON/配列以外 → `[]`、正常 → parsed
- `deriveBlocksFromLegacy`: video のみ / body のみ / 両方 / 両方なし
- `deriveLegacyFromBlocks`: 最初の video が `videoUrl`、markdown 複数が連結
- `normalizeBlocks`: id 欠落補完、不正 type / 必須フィールド欠落で throw

## リスク・落とし穴

- **Plyr の重複ID**: 動画ブロックを複数許可するので `#lp-player-${index}` で一意ID化。HTML5 仕様違反の重複ID は禁止。
- **DOMPurify 範囲**: markdown ブロック内のみ通す。image/button/divider はサーバ payload を直接埋め込むので `escapeHtml` + `safeUrl`（javascript:/data: 弾き）で防御。
- **後方互換の整合**: `blocks` 保存時に必ず legacy フィールド（`video_url`/`body`）も再導出する規約をサーバ層で強制し、旧 SDK / 旧クライアントが期待する `videoUrl`/`body` が常に整合した値になるようにする。
- **D1 JSON 操作**: マイグレーションでは `json_array`/`json_object` を使用。アプリ層では `JSON.stringify`/`JSON.parse` で扱い、`json_extract` には依存しない。
- **ブロックID**: dnd-kit が再マウントを避けるため、ブロック作成時に必ず `crypto.randomUUID()` を割り当て、保存後も保持する。MCP 経由で未指定なら `normalizeBlocks()` が補完。
- **LIFF 内ブラウザ**: button の外部リンクは `target="_blank" rel="noopener noreferrer"` 付与。confirm が出る場合があるのは現状仕様として許容。
- **PR1 だけ入れても安全**: 公開LPは旧 render() のまま動作。blocks フィールドはレスポンスに増えるが旧クライアントは無視。PR2 で初めて新レンダラが動く。

## 検証手順

### ローカル（PR毎）
1. `pnpm install` （PR3 で `@dnd-kit/*` 追加後）
2. `pnpm --filter @line-crm/db build && pnpm --filter @line-crm/sdk build`
3. `pnpm --filter worker test` で `lp-pages.test.ts` をパス
4. ローカル D1 にマイグレーション適用 → `SELECT id, blocks FROM lp_pages` で JSON が入っていることを確認

### staging（PR1 + PR2 入った時点で実機検証）
1. 既存LPの公開URL（`/lp/{slug}`）にアクセス → 動画+本文が従来通り表示される
2. MCP `manage_lp_pages update` で blocks を直接編集 → markdown→動画→markdown→button の順で表示されることを確認
3. ブラウザコンソールで Plyr が複数インスタンス化されてエラーなく動作

### staging（PR3 入った後）
1. 管理画面 `/lp-pages/{id}/edit` を開く
2. ブロックの追加・並び替え（ドラッグ&ドロップ）・編集・削除がスムーズに動く
3. 保存後にプレビュー（公開URL）で順序が反映される
4. ブロック0個で保存しようとするとエラー（バリデーション）
5. 一覧画面で `📦 Nブロック` の表示が正しい

### staging（PR4 入った後）
1. Claude Code 経由で `create_lp_page` に blocks 引数を渡してLPを作成
2. 作成されたLPが管理画面でも編集可能、公開URLでも正しく描画
3. 旧形式（videoUrl + body のみ）でも引き続き作成できる（後方互換）
