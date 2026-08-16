'use client'

import type { Editor } from '@tiptap/react'

interface Props {
  editor: Editor | null
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '32px']

export function RichTextToolbar({ editor }: Props) {
  if (!editor) return null

  const btnBase =
    'px-2 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40'
  const btnActive = 'bg-gray-200 border-gray-300'

  const cls = (active: boolean) => `${btnBase} ${active ? btnActive : ''}`

  const promptLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('リンク先 URL（空で解除）', prev ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? ''

  return (
    <div className="flex flex-wrap items-center gap-1 border border-gray-200 rounded-t bg-gray-50 p-1.5">
      <button
        type="button"
        className={cls(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="太字"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={cls(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="斜体"
      >
        <em>I</em>
      </button>

      <span className="mx-1 h-4 w-px bg-gray-300" />

      <button
        type="button"
        className={cls(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="見出し2"
      >
        H2
      </button>
      <button
        type="button"
        className={cls(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-label="見出し3"
      >
        H3
      </button>

      <span className="mx-1 h-4 w-px bg-gray-300" />

      <button
        type="button"
        className={cls(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="箇条書き"
      >
        ・リスト
      </button>
      <button
        type="button"
        className={cls(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="番号付きリスト"
      >
        1.リスト
      </button>

      <span className="mx-1 h-4 w-px bg-gray-300" />

      <button
        type="button"
        className={cls(editor.isActive({ textAlign: 'left' }))}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        aria-label="左揃え"
      >
        ⬅
      </button>
      <button
        type="button"
        className={cls(editor.isActive({ textAlign: 'center' }))}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        aria-label="中央揃え"
      >
        ↔
      </button>
      <button
        type="button"
        className={cls(editor.isActive({ textAlign: 'right' }))}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        aria-label="右揃え"
      >
        ➡
      </button>

      <span className="mx-1 h-4 w-px bg-gray-300" />

      <label className={`${btnBase} flex items-center gap-1 cursor-pointer`} title="文字色">
        <span>A</span>
        <input
          type="color"
          className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={(editor.getAttributes('textStyle').color as string | undefined) ?? '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
        <button
          type="button"
          className="text-[10px] text-gray-500 hover:text-gray-800"
          onClick={(e) => {
            e.preventDefault()
            editor.chain().focus().unsetColor().run()
          }}
          aria-label="文字色解除"
        >
          ×
        </button>
      </label>

      <label className={`${btnBase} flex items-center gap-1 cursor-pointer`} title="背景色">
        <span className="bg-yellow-200 px-1">A</span>
        <input
          type="color"
          className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={(editor.getAttributes('highlight').color as string | undefined) ?? '#ffff00'}
          onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
        />
        <button
          type="button"
          className="text-[10px] text-gray-500 hover:text-gray-800"
          onClick={(e) => {
            e.preventDefault()
            editor.chain().focus().unsetHighlight().run()
          }}
          aria-label="背景色解除"
        >
          ×
        </button>
      </label>

      <select
        className={`${btnBase} cursor-pointer`}
        value={currentFontSize}
        onChange={(e) => {
          const v = e.target.value
          if (!v) {
            editor.chain().focus().unsetFontSize().run()
            return
          }
          editor.chain().focus().setFontSize(v).run()
        }}
        aria-label="文字サイズ"
      >
        <option value="">サイズ</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <span className="mx-1 h-4 w-px bg-gray-300" />

      <button
        type="button"
        className={cls(editor.isActive('link'))}
        onClick={promptLink}
        aria-label="リンク"
      >
        🔗
      </button>
    </div>
  )
}
