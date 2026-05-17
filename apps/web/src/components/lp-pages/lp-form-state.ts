import type { LpPage, LpPageWritable } from '@/lib/api'

export type AccessWindowMode = 'absolute' | 'relative' | 'both' | 'none'

export interface LpFormState {
  name: string
  slug: string
  lineAccountId: string
  videoUrl: string
  body: string
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
    videoUrl: '',
    body: '',
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
    videoUrl: lp.videoUrl ?? '',
    body: lp.body ?? '',
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

export function formToApiPayload(form: LpFormState): LpPageWritable {
  const useAbsolute = form.accessWindowMode === 'absolute' || form.accessWindowMode === 'both'
  const useRelative = form.accessWindowMode === 'relative' || form.accessWindowMode === 'both'

  const trimmedSlug = form.slug.trim()
  const trimmedVideo = form.videoUrl.trim()
  const trimmedBody = form.body
  const trimmedAccount = form.lineAccountId.trim()
  const trimmedNotFriend = form.notFriendRedirectUrl.trim()

  return {
    name: form.name.trim(),
    ...(trimmedSlug ? { slug: trimmedSlug } : {}),
    lineAccountId: trimmedAccount === '' ? null : trimmedAccount,
    videoUrl: trimmedVideo === '' ? null : trimmedVideo,
    body: trimmedBody.trim() === '' ? null : trimmedBody,
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
  const hasVideo = form.videoUrl.trim() !== ''
  const hasBody = form.body.trim() !== ''
  if (!hasVideo && !hasBody) return '動画URLまたは本文のどちらかを入力してください'
  if (form.accessWindowMode === 'relative' || form.accessWindowMode === 'both') {
    if (!form.relativeDaysAfterFriendAdd || Number(form.relativeDaysAfterFriendAdd) <= 0) {
      return '友だち登録からの日数を1以上で入力してください'
    }
  }
  return null
}
