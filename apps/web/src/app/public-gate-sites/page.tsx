'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import type { PublicGateSite, Tag } from '@line-crm/shared'

export default function PublicGateSitesPage() {
  const [sites, setSites] = useState<PublicGateSite[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const [sitesRes, tagsRes] = await Promise.all([api.publicGateSites.list(), api.tags.list()])
    if (sitesRes.success) setSites(sitesRes.data)
    else setError('一覧の取得に失敗しました')
    if (tagsRes.success) setTags(tagsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <Header
        title="外部サイト認証設定"
        description="LINE Loginでゲートする外部サイト（/public-gate/* が参照する設定）を管理します。site_keyごとに必須タグと戻り先オリジンを設定します。"
      />

      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">{sites.length} 件</span>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          + 新規追加
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          読み込み中...
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} tags={tags} onChange={load} />
          ))}
          {sites.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
              設定がありません
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateSiteModal
          tags={tags}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function SiteCard({
  site,
  tags,
  onChange,
}: {
  site: PublicGateSite
  tags: Tag[]
  onChange: () => void
}) {
  const requiredTag = tags.find((t) => t.id === site.requiredTagId)

  const onToggleActive = async () => {
    const res = await api.publicGateSites.update(site.id, { isActive: !site.isActive })
    if (res.success) onChange()
    else alert(res.error ?? '更新に失敗しました')
  }

  const onDelete = async () => {
    if (!confirm(`「${site.siteKey}」を削除しますか?`)) return
    const res = await api.publicGateSites.delete(site.id)
    if (res.success) onChange()
    else alert(res.error ?? '削除に失敗しました')
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-medium font-mono">
            {site.siteKey}
            {!site.isActive && (
              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                停止中
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            必須タグ: {requiredTag ? requiredTag.name : '(不明なタグ)'}
          </p>
          <p className="text-xs text-gray-500">
            戻り先オリジン: {site.allowedReturnOrigins.join(', ') || '(未設定)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleActive}
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
          >
            {site.isActive ? '停止する' : '再開する'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateSiteModal({
  tags,
  onClose,
  onCreated,
}: {
  tags: Tag[]
  onClose: () => void
  onCreated: () => void
}) {
  const [siteKey, setSiteKey] = useState('')
  const [requiredTagId, setRequiredTagId] = useState('')
  const [originsText, setOriginsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async () => {
    const allowedReturnOrigins = originsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!siteKey || !requiredTagId || allowedReturnOrigins.length === 0) return
    setSubmitting(true)
    setError('')
    const res = await api.publicGateSites.create({ siteKey, requiredTagId, allowedReturnOrigins })
    setSubmitting(false)
    if (res.success) onCreated()
    else setError(res.error ?? '作成に失敗しました')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 space-y-3">
        <h2 className="text-lg font-medium">外部サイト認証設定を追加</h2>
        {error && (
          <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}
        <input
          value={siteKey}
          onChange={(e) => setSiteKey(e.target.value)}
          placeholder="site_key (例: kr-note)"
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono"
        />
        <select
          value={requiredTagId}
          onChange={(e) => setRequiredTagId(e.target.value)}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
        >
          <option value="">必須タグを選択</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <textarea
          value={originsText}
          onChange={(e) => setOriginsText(e.target.value)}
          placeholder="戻り先オリジン（カンマ区切り。例: https://kr-note-3887c3.pages.dev）"
          rows={2}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-600">
            キャンセル
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !siteKey || !requiredTagId || !originsText.trim()}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {submitting ? '作成中…' : '作成'}
          </button>
        </div>
      </div>
    </div>
  )
}
