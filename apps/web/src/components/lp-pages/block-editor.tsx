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
import type { LpBlock, LpBlockType } from '@/lib/api'
import { createDefaultBlock } from '@/lib/lp-blocks'
import { SortableBlockItem } from './sortable-block-item'
import { AddBlockMenu } from './add-block-menu'

interface Props {
  blocks: LpBlock[]
  onChange: (next: LpBlock[]) => void
}

export function BlockEditor({ blocks, onChange }: Props) {
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

  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id))

  const addBlock = (type: LpBlockType) => onChange([...blocks, createDefaultBlock(type)])

  return (
    <div>
      {blocks.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-6 mb-3 bg-gray-50 rounded">
          ブロックがまだありません。下の「＋ ブロックを追加」から始めてください。
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((b) => (
              <SortableBlockItem
                key={b.id}
                block={b}
                onChange={(next) => updateBlock(b.id, next)}
                onRemove={() => removeBlock(b.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <AddBlockMenu onAdd={addBlock} />
    </div>
  )
}
