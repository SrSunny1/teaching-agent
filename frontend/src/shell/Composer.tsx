import { useEffect, useRef, useState } from 'react'
import { IconAttach, IconSend, IconStop } from './icons'

interface Props {
  busy: boolean
  /** image 是 data URL，只有真的附了图时才传 */
  onSend: (text: string, image?: string) => void
  onStop: () => void
}

/**
 * 图片最长边压到这个尺寸再发。
 * 手机拍的原图常见 3~8 MB，转 base64 还要再涨约 1/3 —— 不压的话一次请求能到 10 MB 以上，
 * 上传和视觉模型都跟着变慢，而诊断根本用不到那个分辨率。
 */
const MAX_EDGE = 1280

/** 读文件 → 等比缩到 MAX_EDGE 以内 → 转成 JPEG data URL。 */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context 不可用')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    bitmap.close()
  }
}

export default function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 自适应高度
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`
  }, [text])

  /** 选文件和粘贴共用这一段。 */
  const accept = async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('只能附加图片文件。')
      return
    }
    setError(null)
    try {
      setImage(await toDataUrl(file))
    } catch {
      // ★ 这里**不能**静默忽略。浏览器解不了的格式（典型是 iPhone 的 HEIC）如果什么都不显示，
      //   用户看到的就是「贴了/选了没反应」—— 和功能压根没做的症状一模一样，无从排查。
      setError('读不了这张图片。浏览器不支持这个格式（常见的是 iPhone 的 HEIC），请先转成 JPG 或 PNG。')
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.items)
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile()
    if (!file) return // 粘的是文字，交给默认行为
    e.preventDefault() // 否则图片可能以奇怪的形式混进 textarea
    void accept(file)
  }

  const canSend = Boolean(text.trim() || image)

  const submit = () => {
    if (busy || !canSend) return
    onSend(text, image ?? undefined)
    setText('')
    setImage(null)
    setError(null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {/* 附了图先给缩略图 —— 否则用户不知道自己到底选上没有 */}
        {image && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px 0' }}>
            <img
              src={image}
              alt="待发送的图片"
              style={{
                width: 52,
                height: 52,
                objectFit: 'cover',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-soft)',
              }}
            />
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              已附加 1 张图片 · 用于图像诊断
            </span>
            <span className="spacer" />
            <button
              className="icon-btn"
              title="移除图片"
              onClick={() => {
                setImage(null)
                setError(null)
              }}
            >
              ×
            </button>
          </div>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder="问点什么… 例如「250 目筛分的作用」（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            void accept(e.target.files?.[0])
            e.target.value = '' // 清掉才能连续选同一张图
          }}
        />

        {error && (
          <div
            style={{
              padding: '6px 12px 0',
              fontSize: 'var(--fs-xs)',
              color: 'var(--err)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div className="composer-bar">
          <button
            className="icon-btn"
            title="上传金相/试样图片（也可以直接粘贴）"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <IconAttach />
          </button>
          <span className="spacer" />
          {busy ? (
            <button className="send-btn" onClick={onStop} title="停止生成">
              <IconStop />
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!canSend} title="发送">
              <IconSend />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
