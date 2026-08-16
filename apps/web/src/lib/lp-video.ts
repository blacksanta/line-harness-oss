// 公開 LP（apps/worker/src/index.ts）と同じ動画 URL 解釈ロジックを TS で再実装。
// 管理画面プレビューと公開 LP で見た目の差を出さないために、抽出規則をここ一箇所に集約する。

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/)
  return m ? m[1] : null
}

export function vimeoId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const yt = youtubeId(url)
  if (yt) return `https://www.youtube.com/embed/${yt}?playsinline=1`
  const vm = vimeoId(url)
  if (vm) return `https://player.vimeo.com/video/${vm}`
  return url
}

export function youtubePosterUrl(videoUrl: string | null | undefined): string | null {
  const yt = youtubeId(videoUrl)
  return yt ? `https://img.youtube.com/vi/${yt}/maxresdefault.jpg` : null
}
