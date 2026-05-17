'use client'

import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { videoEmbedUrl, youtubeId, youtubePosterUrl, vimeoId } from '@/lib/lp-video'
import type { LpFormState } from './lp-form-state'

interface Props {
  form: LpFormState
}

interface CountdownSample {
  days: number
  hours: number
  minutes: number
  seconds: number
}

// プレビューでは実時間ではなく見た目だけ確認できればよいので、固定値で表示する。
function sampleCountdown(form: LpFormState): CountdownSample | null {
  if (form.accessWindowMode === 'none') return null
  if (form.accessWindowMode === 'relative' || form.accessWindowMode === 'both') {
    const n = Number(form.relativeDaysAfterFriendAdd)
    if (!Number.isFinite(n) || n <= 0) return { days: 0, hours: 23, minutes: 59, seconds: 59 }
    return { days: Math.max(0, n - 1), hours: 23, minutes: 59, seconds: 59 }
  }
  // absolute mode
  if (form.absoluteEndsAt) {
    const end = new Date(`${form.absoluteEndsAt}:00.000+09:00`).getTime()
    const remaining = end - Date.now()
    if (remaining <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
    const total = Math.floor(remaining / 1000)
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
    }
  }
  return null
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export default function LpPreview({ form }: Props) {
  // marked + dompurify は SSR では走らない。クライアントマウント後に計算する。
  const [bodyHtml, setBodyHtml] = useState('')

  useEffect(() => {
    if (!form.body.trim()) {
      setBodyHtml('')
      return
    }
    const raw = marked.parse(form.body, { async: false }) as string
    const clean = DOMPurify.sanitize(raw)
    setBodyHtml(clean)
  }, [form.body])

  const videoSrc = useMemo(() => videoEmbedUrl(form.videoUrl), [form.videoUrl])
  const ytPoster = useMemo(() => youtubePosterUrl(form.videoUrl), [form.videoUrl])
  const isPlayerEmbed = useMemo(
    () => !!(youtubeId(form.videoUrl) || vimeoId(form.videoUrl)),
    [form.videoUrl],
  )
  const countdown = sampleCountdown(form)

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-gray-500 mb-2">📱 スマホプレビュー</p>

      <div
        className="relative"
        style={{
          width: 375,
          height: 720,
          borderRadius: 36,
          background: '#111',
          padding: 10,
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        <div
          className="lp-preview-screen"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 28,
            overflowY: 'auto',
            background: '#fafafa',
            fontFamily: "'Hiragino Sans','Helvetica Neue',system-ui,sans-serif",
            color: '#1e293b',
            lineHeight: 1.7,
            padding: '24px 16px',
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: '0 0 12px',
              color: form.name ? '#0f172a' : '#94a3b8',
            }}
          >
            {form.name || '（タイトル未入力）'}
          </h1>

          {videoSrc && (
            <div
              style={{
                position: 'relative',
                paddingBottom: '56.25%',
                height: 0,
                borderRadius: 12,
                overflow: 'hidden',
                background: '#000',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                marginBottom: 20,
              }}
            >
              {ytPoster && isPlayerEmbed && (
                // youtube サムネを背景に置いて Plyr 風の見た目に近づける
                <img
                  src={ytPoster}
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: 0,
                  }}
                />
              )}
              <iframe
                src={videoSrc}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 0,
                  zIndex: 1,
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {bodyHtml && (
            <div
              className="lp-preview-body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          )}

          {!videoSrc && !bodyHtml && (
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 24 }}>
              動画URLまたは本文を入力するとここに表示されます。
            </p>
          )}

          {countdown && (
            <div style={{ margin: '24px 0 8px', textAlign: 'center' }}>
              <p
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  marginBottom: 12,
                  color: '#0f172a',
                }}
              >
                公開終了まであと…
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  flexWrap: 'nowrap',
                }}
              >
                {countdown.days >= 1 && <CountdownCell num={String(countdown.days)} label="日" />}
                <CountdownCell num={pad(countdown.hours)} label="時間" />
                <CountdownCell num={pad(countdown.minutes)} label="分" />
                <CountdownCell num={pad(countdown.seconds)} label="秒" />
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                ※ プレビューはサンプル表示です
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 公開 LP と同じ Markdown 用 CSS */}
      <style jsx global>{`
        .lp-preview-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }
        .lp-preview-body h1,
        .lp-preview-body h2,
        .lp-preview-body h3 { margin: 24px 0 12px; font-weight: 700; color: #0f172a; }
        .lp-preview-body h1 { font-size: 24px; }
        .lp-preview-body h2 { font-size: 20px; }
        .lp-preview-body h3 { font-size: 17px; }
        .lp-preview-body p { margin: 12px 0; }
        .lp-preview-body a { color: #06c755; text-decoration: underline; }
        .lp-preview-body ul,
        .lp-preview-body ol { margin: 12px 0 12px 24px; }
        .lp-preview-body blockquote {
          border-left: 4px solid #06c755;
          padding: 8px 16px;
          background: #f0fdf4;
          margin: 16px 0;
          color: #475569;
        }
        .lp-preview-body code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: ui-monospace, monospace;
          font-size: 13px;
        }
        .lp-preview-body pre {
          background: #f1f5f9;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 16px 0;
        }
      `}</style>
    </div>
  )
}

function CountdownCell({ num, label }: { num: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          background: '#E85C3A',
          color: '#fff',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: '1.35rem',
          fontWeight: 700,
          boxShadow: '0 2px 4px rgba(0,0,0,.15)',
          minWidth: 46,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {num}
      </div>
      <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 6 }}>{label}</div>
    </div>
  )
}
