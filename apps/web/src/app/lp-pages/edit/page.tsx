'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, type LpBlock, type LpPage } from '@/lib/api'
import Header from '@/components/layout/header'
import { BlockEditor } from '@/components/lp-pages/block-editor'

export default function EditLpPage() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''

  const [lp, setLp] = useState<LpPage | null>(null)
  const [blocks, setBlocks] = useState<LpBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('id が指定されていません')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await api.lpPages.get(id)
        if (cancelled) return
        if (res.success) {
          setLp(res.data)
          setBlocks(ensureIds(res.data.blocks ?? []))
        } else {
          setError(res.error)
        }
      } catch {
        if (!cancelled) setError('LPの読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const save = async () => {
    if (blocks.length === 0) {
      setError('ブロックが0個の状態では保存できません')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.lpPages.update(id, { blocks } as Partial<LpPage>)
      if (res.success) {
        setLp(res.data)
        setBlocks(ensureIds(res.data.blocks ?? []))
        setSuccess('保存しました')
        setTimeout(() => setSuccess(''), 2000)
      } else {
        setError(res.error)
      }
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="LP編集" />
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (!lp) {
    return (
      <div>
        <Header title="LP編集" />
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error || 'LPが見つかりません'}
        </div>
        <Link href="/lp-pages" className="text-sm text-blue-600 hover:underline">
          ← 一覧に戻る
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Header title={`編集: ${lp.name}`} />

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/lp-pages" className="text-sm text-gray-600 hover:text-gray-900">
          ← 一覧に戻る
        </Link>
        <div className="flex items-center gap-3">
          {success && <span className="text-sm text-green-700">{success}</span>}
          <a
            href={`/lp/${lp.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            公開URLを開く ↗
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-3 text-xs text-gray-500">
        ⋮⋮ をドラッグして並び替え、各ブロックをインライン編集できます。
      </div>

      <BlockEditor blocks={blocks} onChange={setBlocks} />
    </div>
  )
}

function ensureIds(blocks: LpBlock[]): LpBlock[] {
  return blocks.map((b) => (b.id ? b : { ...b, id: crypto.randomUUID() }))
}
