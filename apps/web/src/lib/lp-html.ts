import DOMPurify from 'dompurify'

const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i

export function looksLikeHtml(s: string): boolean {
  return HTML_TAG_RE.test(s)
}

const SANITIZE_OPTIONS = {
  ADD_ATTR: ['style', 'target', 'rel'],
}

export function sanitizeLpHtml(raw: string): string {
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS) as unknown as string
}

export function isContentEmpty(html: string): boolean {
  return html.replace(/<[^>]+>/g, '').trim() === ''
}
