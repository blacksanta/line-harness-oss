'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, type LpPage, type LpView } from '@/lib/api'
import Header from '@/components/layout/header'

const accessResultLabels: Record<string, { label: string; color: string }> = {
  allowed: { label: '視聴OK', color: 'bg-green-100 text-green-700' },
  expired: { label: '期限切れ', color: 'bg-red-100 text-red-700' },
  not_yet: { label: '開始前', color: 'bg-yellow-100 text-yellow-700' },
  not_friend: { label: '友だち外', color: 'bg-gray-100 text-gray-700' },
  inactive: { label: '無効', color: 'bg-gray-100 text-gray-500' },
}

const windowModeLabels: Record<string, string> = {
  absolute: '絶対日時',
  relative: '友だち登録から',
  both: '絶対日時 AND 相対',
  none: '無期限',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function describeWindow(lp: LpPage): string {
  const parts: string[] = [windowModeLabels[lp.accessWindowMode] ?? lp.accessWindowMode]
  if (lp.accessWindowMode === 'absolute' || lp.accessWindowMode === 'both') {
    if (lp.absoluteStartsAt) parts.push(`開始: ${formatDate(lp.absoluteStartsAt)}`)
    if (lp.absoluteEndsAt) parts.push(`終了: ${formatDate(lp.absoluteEndsAt)}`)
  }
  if (lp.accessWindowMode === 'relative' || lp.accessWindowMode === 'both') {
    if (lp.relativeDaysAfterFriendAdd) parts.push(`${lp.relativeDaysAfterFriendAdd}日間`)
  }
  return parts.join(' / ')
}

export default function LpPagesPage() {
  const [items, setItems] = useState<LpPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewsModal, setViewsModal] = useState<{ lp: LpPage; views: LpView[] } | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(process.env.NEXT_PUBLIC_API_URL || '')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.lpPages.list()
      if (res.success) setItems(res.data)
      else setError(res.error)
    } catch {
      setError('LP一覧の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleActive = async (lp: LpPage) => {
    try {
      await api.lpPages.update(lp.id, { isActive: !lp.isActive })
      load()
    } catch {
      setError('更新に失敗しました')
    }
  }

  const handleDelete = async (lp: LpPage) => {
    if (!confirm(`「${lp.name}」を削除しますか？視聴ログも一緒に削除されます。`)) return
    try {
      await api.lpPages.delete(lp.id)
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const showViews = async (lp: LpPage) => {
    try {
      const res = await api.lpPages.getViews(lp.id)
      if (res.success) setViewsModal({ lp, views: res.data })
    } catch {
      setError('視聴ログの取得に失敗しました')
    }
  }

  const copyUrl = async (slug: string) => {
    const url = `${origin}/lp/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      alert('公開URLをコピーしました\n' + url)
    } catch {
      prompt('公開URL（コピーしてご利用ください）', url)
    }
  }

  return (
    <div>
      <Header title="ランディングページ" />

      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <p className="font-semibold mb-1">📝 新規作成は Claude Code から</p>
        <p className="text-xs leading-relaxed">
          MCPツール <code className="px-1 py-0.5 bg-blue-100 rounded">create_lp_page</code> で作成してください。
          管理画面では一覧表示・視聴ログ参照・有効化/無効化・削除のみ可能です。
        </p>
        <p className="text-xs mt-2 text-blue-700">
          例: <span className="font-mono">「友だち登録から7日間視聴できる動画LPを作って」</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">読み込み中...</p>
      ) : items.length === 0 ? (
        <div className="p-8 bg-white border border-gray-200 rounded-lg text-center text-sm text-gray-500">
          まだランディングページがありません。Claude Code から create_lp_page を実行してください。
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">名前 / 種別</th>
                <th className="px-4 py-3 text-left">公開URL</th>
                <th className="px-4 py-3 text-left">期限</th>
                <th className="px-4 py-3 text-right">視聴</th>
                <th className="px-4 py-3 text-center">状態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lp) => (
                <tr key={lp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{lp.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {lp.contentType === 'video' ? '🎬 動画' : '📄 ページ'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyUrl(lp.slug)}
                      className="text-xs font-mono text-blue-600 hover:underline"
                    >
                      /lp/{lp.slug}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{describeWindow(lp)}</td>
                  <td className="px-4 py-3 text-right font-medium">{lp.viewCount}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(lp)}
                      className={`px-2 py-1 text-xs rounded-full font-medium ${
                        lp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {lp.isActive ? '有効' : '無効'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 text-xs">
                    <button onClick={() => showViews(lp)} className="text-blue-600 hover:underline">
                      視聴ログ
                    </button>
                    <button onClick={() => handleDelete(lp)} className="text-red-600 hover:underline">
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setViewsModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">視聴ログ — {viewsModal.lp.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewsModal.views.length}件</p>
              </div>
              <button onClick={() => setViewsModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto">
              {viewsModal.views.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-500">まだ視聴履歴がありません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">日時</th>
                      <th className="px-4 py-2 text-left">友だち</th>
                      <th className="px-4 py-2 text-left">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewsModal.views.map((v) => {
                      const r = accessResultLabels[v.access_result] ?? { label: v.access_result, color: 'bg-gray-100 text-gray-700' }
                      return (
                        <tr key={v.id} className="border-t border-gray-100">
                          <td className="px-4 py-2 text-xs text-gray-600">{formatDate(v.viewed_at)}</td>
                          <td className="px-4 py-2 text-sm">
                            {v.friend_name ?? <span className="text-gray-400">（不明）</span>}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${r.color}`}>{r.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
