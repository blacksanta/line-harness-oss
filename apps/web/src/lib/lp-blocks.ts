import type { LpBlock, LpBlockType } from './api'

export const BLOCK_LABELS: Record<LpBlockType, string> = {
  video: '動画',
  markdown: 'テキスト',
  image: '画像',
  button: 'ボタン',
  divider: '区切り線',
  countdown: '期限カウントダウン',
  reservation: '予約お申し込みボタン',
  videoGateStart: '動画ゲート開始',
  videoGateEnd: '動画ゲート終了',
}

export const BLOCK_ICONS: Record<LpBlockType, string> = {
  video: '🎬',
  markdown: '📝',
  image: '🖼️',
  button: '🔘',
  divider: '➖',
  countdown: '⏳',
  reservation: '📅',
  videoGateStart: '🔒',
  videoGateEnd: '🔓',
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
    case 'countdown':
      return { id, type, title: null, showTitle: true, color: null }
    case 'reservation':
      return {
        id,
        type,
        reservationType: 'event',
        eventId: null,
        menuId: null,
        label: '予約お申し込み',
        style: 'primary',
      }
    case 'videoGateStart':
      return { id, type, minutes: 3, hintText: null }
    case 'videoGateEnd':
      return { id, type }
  }
}

// 折りたたみ時にヘッダー横へ出す、ブロック中身の1行サマリ。
export function blockSummary(block: LpBlock): string {
  switch (block.type) {
    case 'markdown': {
      const text = block.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      if (!text) return '（未入力）'
      return text.length > 30 ? `${text.slice(0, 30)}…` : text
    }
    case 'video':
      return block.url.trim() || '（URL未設定）'
    case 'image':
      return (block.alt ?? '').trim() || block.url.trim() || '（URL未設定）'
    case 'button':
      return block.label.trim() || '（ラベル未入力）'
    case 'reservation':
      return block.label.trim() || '（ラベル未入力）'
    case 'divider':
      return '―'
    case 'countdown':
      return (block.title ?? '').trim() || '公開終了まであと…'
    case 'videoGateStart':
      return `${block.minutes || 1}分視聴で開放`
    case 'videoGateEnd':
      return ''
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
