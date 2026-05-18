import type { LpBlock, LpBlockType } from './api'

export const BLOCK_LABELS: Record<LpBlockType, string> = {
  video: '動画',
  markdown: 'テキスト',
  image: '画像',
  button: 'ボタン',
  divider: '区切り線',
}

export const BLOCK_ICONS: Record<LpBlockType, string> = {
  video: '🎬',
  markdown: '📝',
  image: '🖼️',
  button: '🔘',
  divider: '➖',
}

export function createDefaultBlock(type: LpBlockType): LpBlock {
  const id = crypto.randomUUID()
  switch (type) {
    case 'video':
      return { id, type, url: '' }
    case 'markdown':
      return { id, type, text: '' }
    case 'image':
      return { id, type, url: '', alt: '' }
    case 'button':
      return { id, type, label: 'ボタン', href: '', style: 'primary' }
    case 'divider':
      return { id, type }
  }
}

export function summarizeBlocks(blocks: LpBlock[]): string {
  if (blocks.length === 0) return '空'
  const counts: Partial<Record<LpBlockType, number>> = {}
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1
  return (Object.entries(counts) as [LpBlockType, number][])
    .map(([t, n]) => `${BLOCK_ICONS[t]}${BLOCK_LABELS[t]}×${n}`)
    .join(' ')
}
