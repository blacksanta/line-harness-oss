'use client'

import { useState, useRef, useEffect } from 'react'
import type { LpBlockType } from '@/lib/api'
import { BLOCK_ICONS, BLOCK_LABELS } from '@/lib/lp-blocks'

const TYPES: LpBlockType[] = ['markdown', 'video', 'image', 'button', 'countdown', 'divider']

export function AddBlockMenu({ onAdd }: { onAdd: (type: LpBlockType) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg py-3 text-sm text-gray-500 hover:text-gray-700 transition"
      >
        ＋ ブロックを追加
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onAdd(t)
                setOpen(false)
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span>{BLOCK_ICONS[t]}</span>
              <span>{BLOCK_LABELS[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
