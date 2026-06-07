import type { LpBlock, LpPage, LpPageWritable } from '@/lib/api'

export type AccessWindowMode = 'absolute' | 'relative' | 'both' | 'none'

export interface LpFormState {
  name: string
  slug: string
  lineAccountId: string
  blocks: LpBlock[]
  accessWindowMode: AccessWindowMode
  absoluteStartsAt: string
  absoluteEndsAt: string
  relativeDaysAfterFriendAdd: string
  expiredRedirectUrl: string
  notFriendRedirectUrl: string
  isActive: boolean
}

export function emptyFormState(): LpFormState {
  return {
    name: '',
    slug: '',
    lineAccountId: '',
    blocks: [],
    accessWindowMode: 'none',
    absoluteStartsAt: '',
    absoluteEndsAt: '',
    relativeDaysAfterFriendAdd: '',
    expiredRedirectUrl: '',
    notFriendRedirectUrl: '',
    isActive: true,
  }
}

// ISO 文字列 (例: 2026-05-17T03:00:00.000Z) → datetime-local 入力欄向け JST "YYYY-MM-DDTHH:mm"
export function isoToDatetimeLocalJst(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // sv-SE は "YYYY-MM-DD HH:mm:ss" のスペース区切りで返ってくる → 先頭16文字+T変換
  const formatted = d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
  return formatted.slice(0, 16).replace(' ', 'T')
}

// datetime-local の "YYYY-MM-DDTHH:mm" を JST タイムゾーン付き ISO 風文字列に変換
function datetimeLocalJstToIso(s: string): string | null {
  if (!s) return null
  return `${s}:00.000+09:00`
}

export function lpToFormState(lp: LpPage): LpFormState {
  return {
    name: lp.name,
    slug: lp.slug,
    lineAccountId: lp.lineAccountId ?? '',
    blocks: ensureBlockIds(lp.blocks ?? []),
    accessWindowMode: lp.accessWindowMode,
    absoluteStartsAt: isoToDatetimeLocalJst(lp.absoluteStartsAt),
    absoluteEndsAt: isoToDatetimeLocalJst(lp.absoluteEndsAt),
    relativeDaysAfterFriendAdd:
      lp.relativeDaysAfterFriendAdd != null ? String(lp.relativeDaysAfterFriendAdd) : '',
    expiredRedirectUrl: lp.expiredRedirectUrl,
    notFriendRedirectUrl: lp.notFriendRedirectUrl ?? '',
    isActive: lp.isActive,
  }
}

function ensureBlockIds(blocks: LpBlock[]): LpBlock[] {
  return blocks.map((b) => (b.id ? b : { ...b, id: crypto.randomUUID() }))
}

export function formToApiPayload(form: LpFormState): LpPageWritable {
  const useAbsolute = form.accessWindowMode === 'absolute' || form.accessWindowMode === 'both'
  const useRelative = form.accessWindowMode === 'relative' || form.accessWindowMode === 'both'

  const trimmedSlug = form.slug.trim()
  const trimmedAccount = form.lineAccountId.trim()
  const trimmedNotFriend = form.notFriendRedirectUrl.trim()

  return {
    name: form.name.trim(),
    ...(trimmedSlug ? { slug: trimmedSlug } : {}),
    lineAccountId: trimmedAccount === '' ? null : trimmedAccount,
    blocks: form.blocks,
    accessWindowMode: form.accessWindowMode,
    absoluteStartsAt: useAbsolute ? datetimeLocalJstToIso(form.absoluteStartsAt) : null,
    absoluteEndsAt: useAbsolute ? datetimeLocalJstToIso(form.absoluteEndsAt) : null,
    relativeDaysAfterFriendAdd:
      useRelative && form.relativeDaysAfterFriendAdd
        ? Number(form.relativeDaysAfterFriendAdd)
        : null,
    expiredRedirectUrl: form.expiredRedirectUrl.trim(),
    notFriendRedirectUrl: trimmedNotFriend === '' ? null : trimmedNotFriend,
    isActive: form.isActive,
  }
}

export function validateForm(form: LpFormState): string | null {
  if (!form.name.trim()) return '名前を入力してください'
  if (!form.expiredRedirectUrl.trim()) return '期限切れリダイレクトURLを入力してください'
  if (form.blocks.length === 0) return '少なくとも1つのブロックを追加してください'
  // 予約ブロックは公開時に「LINEアカウントの liff_id」を予約用LIFFとして使うため、
  // LPに line_account_id が無いと公開ページで予約ボタンが無効化される。保存時点で弾く。
  const hasReservation = form.blocks.some((b) => b.type === 'reservation')
  if (hasReservation && !form.lineAccountId.trim()) {
    return '予約ブロックを使う場合はLINEアカウントを指定してください'
  }
  for (const b of form.blocks) {
    if (b.type === 'video' && !b.url.trim()) return '動画ブロックのURLを入力してください'
    if (b.type === 'image' && !b.url.trim()) return '画像ブロックのURLを入力してください'
    if (b.type === 'button') {
      if (!b.label.trim()) return 'ボタンのラベルを入力してください'
      if (!b.href.trim()) return 'ボタンのリンク先URLを入力してください'
    }
    if (b.type === 'reservation') {
      if (!b.label.trim()) return '予約ボタンのラベルを入力してください'
      if (b.reservationType === 'event' && !b.eventId)
        return '予約ボタンのイベントを選択してください'
    }
  }
  if (form.accessWindowMode === 'relative' || form.accessWindowMode === 'both') {
    if (!form.relativeDaysAfterFriendAdd || Number(form.relativeDaysAfterFriendAdd) <= 0) {
      return '友だち登録からの日数を1以上で入力してください'
    }
  }
  return null
}
