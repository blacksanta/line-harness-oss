'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LineAccount } from '@line-crm/shared'
import { api, type LpPage } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import LpForm from './lp-form'
import LpPreview from './lp-preview'
import {
  emptyFormState,
  formToApiPayload,
  lpToFormState,
  validateForm,
  type LpFormState,
} from './lp-form-state'

interface Props {
  mode: 'create' | 'edit'
  initial?: LpPage  // edit のみ
}

export default function LpEditor({ mode, initial }: Props) {
  const router = useRouter()
  const { selectedAccountId } = useAccount()
  const [form, setForm] = useState<LpFormState>(() => {
    if (initial) return lpToFormState(initial)
    const base = emptyFormState()
    base.lineAccountId = selectedAccountId ?? ''
    return base
  })
  const [accounts, setAccounts] = useState<LineAccount[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)

  useEffect(() => {
    api.lineAccounts.list().then((res) => {
      if (res.success) setAccounts(res.data)
    })
  }, [])

  const patch = (p: Partial<LpFormState>) => setForm((prev) => ({ ...prev, ...p }))

  const handleSave = async () => {
    const validationError = validateForm(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = formToApiPayload(form)
      const res =
        mode === 'create'
          ? await api.lpPages.create(payload)
          : await api.lpPages.update(initial!.id, payload)
      if (res.success) {
        router.push('/lp-pages')
      } else {
        setError(res.error)
      }
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* 上部バー */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/lp-pages')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← 一覧に戻る
          </button>
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {mode === 'create' ? '新規ランディングページ' : `編集: ${initial?.name ?? ''}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreviewMobile((v) => !v)}
            className="lg:hidden px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {showPreviewMobile ? 'フォームを表示' : 'プレビュー'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {saving ? '保存中…' : mode === 'create' ? '作成' : '保存'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 p-4 lg:p-6">
        <div className={showPreviewMobile ? 'hidden lg:block' : ''}>
          <LpForm form={form} onChange={patch} accounts={accounts} mode={mode} />
        </div>
        <div
          className={`${showPreviewMobile ? '' : 'hidden lg:flex'} lg:flex justify-center lg:sticky lg:top-20 lg:self-start`}
        >
          <LpPreview form={form} />
        </div>
      </div>
    </div>
  )
}
