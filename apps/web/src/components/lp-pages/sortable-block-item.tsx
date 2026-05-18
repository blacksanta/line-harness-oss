'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LpBlock } from '@/lib/api'
import { BLOCK_ICONS, BLOCK_LABELS } from '@/lib/lp-blocks'

interface Props {
  block: LpBlock
  onChange: (next: LpBlock) => void
  onRemove: () => void
}

export function SortableBlockItem({ block, onChange, onRemove }: Props) {
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

      <BlockBody block={block} onChange={onChange} />
    </div>
  )
}

function BlockBody({ block, onChange }: { block: LpBlock; onChange: (b: LpBlock) => void }) {
  switch (block.type) {
    case 'markdown':
      return (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          rows={6}
          placeholder="# 見出し&#10;&#10;Markdown 本文..."
          className="w-full p-2 border border-gray-300 rounded text-sm font-mono"
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

    case 'divider':
      return <div className="text-xs text-gray-400 text-center py-2">― 区切り線 ―</div>
  }
}
