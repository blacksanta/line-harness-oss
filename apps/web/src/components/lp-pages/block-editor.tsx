'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import {
  eventsApi,
  bookingApi,
  type LpBlock,
  type LpBlockType,
  type EventListItem,
  type BookingMenu,
} from '@/lib/api'
import { createDefaultBlock } from '@/lib/lp-blocks'
import { SortableBlockItem } from './sortable-block-item'
import { AddBlockMenu } from './add-block-menu'

interface Props {
  blocks: LpBlock[]
  onChange: (next: LpBlock[]) => void
  accountId?: string
}

export function BlockEditor({ blocks, onChange, accountId }: Props) {
  const hasReservation = blocks.some((b) => b.type === 'reservation')
  const [events, setEvents] = useState<EventListItem[]>([])
  const [menus, setMenus] = useState<BookingMenu[]>([])
  // 折りたたみ中のブロックid集合（保存しないローカルUI状態）。
  // 初期はすべて折りたたみ、追加直後のブロックだけ展開する。
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(blocks.map((b) => b.id)))

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const collapseAll = () => setCollapsed(new Set(blocks.map((b) => b.id)))
  const expandAll = () => setCollapsed(new Set())
  useEffect(() => {
    if (!accountId || !hasReservation) return
    let cancelled = false
    eventsApi
      .listEvents(accountId)
      .then((r) => {
        if (!cancelled) setEvents(r.items.filter((e) => e.is_published === 1))
      })
      .catch(() => {})
    bookingApi
      .listMenus(accountId)
      .then((r) => {
        if (!cancelled) setMenus(r.menus.filter((m) => m.is_active === 1))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accountId, hasReservation])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = blocks.findIndex((b) => b.id === active.id)
    const to = blocks.findIndex((b) => b.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(blocks, from, to))
  }

  const updateBlock = (id: string, next: LpBlock) =>
    onChange(blocks.map((b) => (b.id === id ? next : b)))

  const removeBlock = (id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    onChange(blocks.filter((b) => b.id !== id))
  }

  const addBlock = (type: LpBlockType) => {
    const block = createDefaultBlock(type)
    // 新規ブロックは折りたたみ集合に入れない → 展開状態で追加される
    setCollapsed((prev) => {
      if (!prev.has(block.id)) return prev
      const next = new Set(prev)
      next.delete(block.id)
      return next
    })
    onChange([...blocks, block])
  }

  return (
    <div>
      {blocks.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-6 mb-3 bg-gray-50 rounded">
          ブロックがまだありません。下の「＋ ブロックを追加」から始めてください。
        </p>
      ) : (
        <>
          <div className="flex items-center justify-end gap-3 mb-2 text-xs text-gray-500">
            <button type="button" onClick={expandAll} className="hover:text-gray-700 hover:underline">
              すべて開く
            </button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={collapseAll} className="hover:text-gray-700 hover:underline">
              すべて閉じる
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((b, i) => (
                <SortableBlockItem
                  key={b.id}
                  block={b}
                  index={i}
                  allBlocks={blocks}
                  collapsed={collapsed.has(b.id)}
                  onToggleCollapse={() => toggleCollapse(b.id)}
                  onChange={(next) => updateBlock(b.id, next)}
                  onRemove={() => removeBlock(b.id)}
                  events={events}
                  menus={menus}
                  accountId={accountId}
                />
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}

      <AddBlockMenu onAdd={addBlock} />
    </div>
  )
}
