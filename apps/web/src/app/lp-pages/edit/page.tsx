'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, type LpPage } from '@/lib/api'
import LpEditor from '@/components/lp-pages/lp-editor'

function EditLpInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [lp, setLp] = useState<LpPage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setError('id パラメータが指定されていません')
      return
    }
    api.lpPages.get(id).then((res) => {
      if (res.success) setLp(res.data)
      else setError(res.error)
    })
  }, [id])

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
        <button
          onClick={() => router.push('/lp-pages')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← 一覧に戻る
        </button>
      </div>
    )
  }

  if (!lp) {
    return <div className="p-6 text-sm text-gray-500">読み込み中…</div>
  }

  return <LpEditor mode="edit" initial={lp} />
}

export default function EditLpPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">読み込み中…</div>}>
      <EditLpInner />
    </Suspense>
  )
}
