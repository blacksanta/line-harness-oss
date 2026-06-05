'use client'

import dynamic from 'next/dynamic'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LpBlock, EventListItem, BookingMenu } from '@/lib/api'
import { BLOCK_ICONS, BLOCK_LABELS } from '@/lib/lp-blocks'
import { youtubeId, vimeoId } from '@/lib/lp-video'

// 動画ゲートの構成不正をエディタ上で警告する（質問13-B: 警告のみ・保存は許可）。
function gateWarning(block: LpBlock, blocks: LpBlock[], index: number): string | null {
  if (block.type === 'videoGateStart') {
    const starts = blocks.filter((b) => b.type === 'videoGateStart')
    if (starts.length > 1) return '動画ゲートは1ページに1組までです。余分な開始ゲートを削除してください。'
    const hasEndAfter = blocks.slice(index + 1).some((b) => b.type === 'videoGateEnd')
    if (!hasEndAfter) return 'このゲートより下に「動画ゲート終了」がありません。ペアで配置してください。'
    const hasTrackableVideoAbove = blocks
      .slice(0, index)
      .some((b) => b.type === 'video' && !!(youtubeId(b.url) || vimeoId(b.url)))
    if (!hasTrackableVideoAbove)
      return 'このゲートより上にYouTube/Vimeo動画がありません。このままだと判定できず、公開時はゲートを無視して最初から表示されます。'
    return null
  }
  if (block.type === 'videoGateEnd') {
    const ends = blocks.filter((b) => b.type === 'videoGateEnd')
    if (ends.length > 1) return '動画ゲートは1ページに1組までです。余分な終了ゲートを削除してください。'
    const hasStartBefore = blocks.slice(0, index).some((b) => b.type === 'videoGateStart')
    if (!hasStartBefore) return 'このゲートより上に「動画ゲート開始」がありません。ペアで配置してください。'
    return null
  }
  return null
}

const RichTextEditor = dynamic(() => import('./rich-text-editor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[120px] p-3 border border-gray-200 rounded bg-gray-50 text-xs text-gray-400">
      エディタを読み込み中...
    </div>
  ),
})

interface Props {
  block: LpBlock
  index?: number
  allBlocks?: LpBlock[]
  onChange: (next: LpBlock) => void
  onRemove: () => void
  events?: EventListItem[]
  menus?: BookingMenu[]
  accountId?: string
}

export function SortableBlockItem({
  block,
  index,
  allBlocks,
  onChange,
  onRemove,
  events,
  menus,
  accountId,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-gray-200 rounded-lg p-3 mb-3 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-2 py-1 select-none touch-none"
          aria-label="並び替え"
        >
          ⋮⋮
        </button>
        <span className="text-xs font-medium text-gray-600 flex-1">
          {BLOCK_ICONS[block.type]} {BLOCK_LABELS[block.type]}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-600 hover:text-red-800 hover:underline px-2 py-1"
        >
          削除
        </button>
      </div>

      <BlockBody
        block={block}
        onChange={onChange}
        events={events}
        menus={menus}
        accountId={accountId}
      />

      {allBlocks &&
        typeof index === 'number' &&
        (() => {
          const warn = gateWarning(block, allBlocks, index)
          return warn ? (
            <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠ {warn}
            </p>
          ) : null
        })()}
    </div>
  )
}

function BlockBody({
  block,
  onChange,
  events = [],
  menus = [],
  accountId,
}: {
  block: LpBlock
  onChange: (b: LpBlock) => void
  events?: EventListItem[]
  menus?: BookingMenu[]
  accountId?: string
}) {
  switch (block.type) {
    case 'markdown':
      return (
        <RichTextEditor
          value={block.text}
          onChange={(html) => onChange({ ...block, text: html })}
          placeholder="本文を入力..."
        />
      )

    case 'video':
      return (
        <div className="space-y-2">
          <input
            type="url"
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="YouTube / Vimeo URL"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500">
            例: https://youtu.be/xxxx / https://vimeo.com/12345
          </p>
        </div>
      )

    case 'image':
      return (
        <div className="space-y-2">
          <input
            type="url"
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="画像URL"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <input
            type="text"
            value={block.alt ?? ''}
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
            placeholder="alt テキスト（任意）"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <input
            type="url"
            value={block.href ?? ''}
            onChange={(e) => onChange({ ...block, href: e.target.value || null })}
            placeholder="リンク先URL（任意。指定するとクリックで遷移）"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
        </div>
      )

    case 'button':
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="ボタンラベル"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <input
            type="url"
            value={block.href}
            onChange={(e) => onChange({ ...block, href: e.target.value })}
            placeholder="リンク先URL"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <select
            value={block.style ?? 'primary'}
            onChange={(e) =>
              onChange({ ...block, style: e.target.value as 'primary' | 'secondary' })
            }
            className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="primary">プライマリ（緑）</option>
            <option value="secondary">セカンダリ（グレー）</option>
          </select>
        </div>
      )

    case 'reservation':
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            placeholder="ボタンラベル"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <select
            value={block.reservationType}
            onChange={(e) =>
              onChange({
                ...block,
                reservationType: e.target.value as 'event' | 'salon',
                eventId: null,
                menuId: null,
              })
            }
            className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="event">イベント予約</option>
            <option value="salon">通常予約（サロン）</option>
          </select>
          {block.reservationType === 'event' && (
            <select
              value={block.eventId ?? ''}
              onChange={(e) => onChange({ ...block, eventId: e.target.value || null })}
              className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="">— イベントを選択 —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          )}
          {block.reservationType === 'salon' && (
            <select
              value={block.menuId ?? ''}
              onChange={(e) => onChange({ ...block, menuId: e.target.value || null })}
              className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="">— メニュー指定なし —</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={block.style ?? 'primary'}
            onChange={(e) =>
              onChange({ ...block, style: e.target.value as 'primary' | 'secondary' })
            }
            className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="primary">プライマリ（緑）</option>
            <option value="secondary">セカンダリ（グレー）</option>
          </select>
          {block.reservationType === 'event' && events.length === 0 && (
            <p className="text-xs text-amber-600">
              {accountId
                ? '公開中のイベントがありません。先にイベントを作成・公開してください。'
                : '「LINEアカウント」を選択するとイベント一覧が表示されます。'}
            </p>
          )}
        </div>
      )

    case 'divider':
      return <div className="text-xs text-gray-400 text-center py-2">― 区切り線 ―</div>

    case 'countdown': {
      const color = block.color ?? '#E85C3A'
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={block.title ?? ''}
            onChange={(e) => onChange({ ...block, title: e.target.value || null })}
            placeholder="公開終了まであと…"
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={block.showTitle !== false}
              onChange={(e) => onChange({ ...block, showTitle: e.target.checked })}
            />
            タイトルを表示する
          </label>
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <span>数字セルの色</span>
            <input
              type="color"
              value={color}
              onChange={(e) => onChange({ ...block, color: e.target.value })}
              className="h-8 w-12 border border-gray-300 rounded cursor-pointer"
            />
            <code className="text-gray-500">{color}</code>
            {block.color && (
              <button
                type="button"
                onClick={() => onChange({ ...block, color: null })}
                className="text-gray-500 hover:text-gray-700 hover:underline ml-auto"
              >
                既定に戻す
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            期限はLPの「視聴期限」設定を使用します。期限未設定だと表示されません。
          </p>
        </div>
      )
    }

    case 'videoGateStart': {
      const minutes = block.minutes || 1
      return (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">直近上の動画を</span>
            <input
              type="number"
              min={1}
              step={1}
              value={minutes}
              onChange={(e) => {
                const n = Math.max(1, Math.floor(Number(e.target.value) || 1))
                onChange({ ...block, minutes: n })
              }}
              className="w-20 p-2 border border-gray-300 rounded text-sm"
            />
            <span className="whitespace-nowrap">分視聴すると以降を表示</span>
          </label>
          <input
            type="text"
            value={block.hintText ?? ''}
            onChange={(e) => onChange({ ...block, hintText: e.target.value || null })}
            placeholder={`未表示時のヒント文（未入力なら「動画を${minutes}分視聴すると表示されます」）`}
            className="w-full p-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500">
            このブロックと「動画ゲート終了」で挟んだ範囲を、指定分数の視聴（または動画の視聴完了）まで隠します。
          </p>
        </div>
      )
    }

    case 'videoGateEnd':
      return (
        <div className="text-xs text-gray-400 text-center py-2">
          ― ここまでをゲートで隠します ―
        </div>
      )
  }
}
