'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect } from 'react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { marked } from 'marked'
import { looksLikeHtml } from '@/lib/lp-html'
import { RichTextToolbar } from './rich-text-toolbar'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function toInitialHtml(value: string): string {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  return marked.parse(value, { async: false }) as string
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: placeholder ?? '本文を入力...' }),
    ],
    content: toInitialHtml(value),
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'lp-rte-content prose prose-sm max-w-none min-h-[120px] p-3 border border-gray-200 border-t-0 rounded-b bg-white focus:outline-none',
      },
    },
  })

  // 外部から value がリセットされたとき（form 全体クリアなど）に同期する
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const next = toInitialHtml(value)
    // current が空エディタ HTML(<p></p>) のときと next が空文字の場合は同期不要
    if (current === next) return
    if (!value && (current === '<p></p>' || current === '')) return
    editor.commands.setContent(next, { emitUpdate: false })
  }, [value, editor])

  return (
    <div className="lp-rte">
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} />
      <style jsx global>{`
        .lp-rte-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .lp-rte-content h1,
        .lp-rte-content h2,
        .lp-rte-content h3 {
          font-weight: 700;
          margin: 12px 0 8px;
        }
        .lp-rte-content h2 {
          font-size: 18px;
        }
        .lp-rte-content h3 {
          font-size: 16px;
        }
        .lp-rte-content ul,
        .lp-rte-content ol {
          margin: 8px 0 8px 24px;
        }
        .lp-rte-content ul {
          list-style: disc;
        }
        .lp-rte-content ol {
          list-style: decimal;
        }
        .lp-rte-content a {
          color: #06c755;
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
