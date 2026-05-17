'use client'

import type { LineAccount } from '@line-crm/shared'
import type { LpFormState, AccessWindowMode } from './lp-form-state'

interface Props {
  form: LpFormState
  onChange: (patch: Partial<LpFormState>) => void
  accounts: LineAccount[]
  mode: 'create' | 'edit'
}

const inputBase =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const labelBase = 'block text-xs font-medium text-gray-600 mb-1'

const windowModeOptions: { value: AccessWindowMode; label: string }[] = [
  { value: 'none', label: '無期限' },
  { value: 'absolute', label: '絶対日時で指定' },
  { value: 'relative', label: '友だち登録からN日間' },
  { value: 'both', label: '絶対日時 かつ 相対日数（両方満たす）' },
]

export default function LpForm({ form, onChange, accounts, mode }: Props) {
  const showAbsolute = form.accessWindowMode === 'absolute' || form.accessWindowMode === 'both'
  const showRelative = form.accessWindowMode === 'relative' || form.accessWindowMode === 'both'

  return (
    <div className="space-y-5">
      {/* 基本情報 */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">基本情報</h2>

        <div>
          <label className={labelBase}>名前 <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="例: 6月キャンペーン動画LP"
            className={inputBase}
          />
        </div>

        <div>
          <label className={labelBase}>スラッグ（公開URLの一部）</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => onChange({ slug: e.target.value })}
            placeholder={mode === 'create' ? '空欄で自動生成（8文字）' : ''}
            className={`${inputBase} font-mono`}
          />
          <p className="text-xs text-gray-500 mt-1">公開URL: <span className="font-mono">/lp/{form.slug || '（自動生成）'}</span></p>
        </div>

        <div>
          <label className={labelBase}>LINEアカウント（任意）</label>
          <select
            value={form.lineAccountId}
            onChange={(e) => onChange({ lineAccountId: e.target.value })}
            className={inputBase}
          >
            <option value="">— 指定しない（全アカウント共通） —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onChange({ isActive: e.target.checked })}
            className="w-4 h-4"
          />
          有効化する（オフだとURLにアクセスしても表示されない）
        </label>
      </section>

      {/* コンテンツ */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">コンテンツ <span className="text-xs font-normal text-gray-500">（動画URL・本文の少なくとも一方が必要）</span></h2>

        <div>
          <label className={labelBase}>動画URL（YouTube / Vimeo / 直リンク）</label>
          <input
            type="url"
            value={form.videoUrl}
            onChange={(e) => onChange({ videoUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
            className={inputBase}
          />
        </div>

        <div>
          <label className={labelBase}>Markdown本文</label>
          <textarea
            value={form.body}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={10}
            placeholder={'# タイトル\n\n本文をMarkdownで記述できます。\n\n- リスト項目\n- [リンク](https://example.com)'}
            className={`${inputBase} font-mono leading-relaxed`}
          />
        </div>
      </section>

      {/* 視聴期限 */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">視聴期限</h2>

        <div>
          <label className={labelBase}>期限モード</label>
          <select
            value={form.accessWindowMode}
            onChange={(e) => onChange({ accessWindowMode: e.target.value as AccessWindowMode })}
            className={inputBase}
          >
            {windowModeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {showAbsolute && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelBase}>開始日時（JST）</label>
              <input
                type="datetime-local"
                value={form.absoluteStartsAt}
                onChange={(e) => onChange({ absoluteStartsAt: e.target.value })}
                className={inputBase}
              />
            </div>
            <div>
              <label className={labelBase}>終了日時（JST）</label>
              <input
                type="datetime-local"
                value={form.absoluteEndsAt}
                onChange={(e) => onChange({ absoluteEndsAt: e.target.value })}
                className={inputBase}
              />
            </div>
          </div>
        )}

        {showRelative && (
          <div>
            <label className={labelBase}>友だち登録から何日間視聴可能か <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="1"
              value={form.relativeDaysAfterFriendAdd}
              onChange={(e) => onChange({ relativeDaysAfterFriendAdd: e.target.value })}
              placeholder="例: 7"
              className={inputBase}
            />
          </div>
        )}
      </section>

      {/* リダイレクト */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">リダイレクト先</h2>

        <div>
          <label className={labelBase}>期限切れ時のリダイレクトURL <span className="text-red-500">*</span></label>
          <input
            type="url"
            value={form.expiredRedirectUrl}
            onChange={(e) => onChange({ expiredRedirectUrl: e.target.value })}
            placeholder="https://example.com/expired"
            className={inputBase}
          />
        </div>

        <div>
          <label className={labelBase}>友だち外ユーザーのリダイレクトURL（任意）</label>
          <input
            type="url"
            value={form.notFriendRedirectUrl}
            onChange={(e) => onChange({ notFriendRedirectUrl: e.target.value })}
            placeholder="未指定の場合は LINE 友だち追加ページへ"
            className={inputBase}
          />
        </div>
      </section>
    </div>
  )
}
