import { useEffect, useRef, useState } from 'react'
import { IconAttach, IconSend, IconStop } from './icons'

interface Props {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
}

const SLASH = ['/费曼追问', '/结构可视化', '/热处理沙盒', '/结晶条件', '/出题']

export default function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 自适应高度
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`
  }, [text])

  const submit = () => {
    if (busy || !text.trim()) return
    onSend(text)
    setText('')
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
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder="问点什么… 例如「250 目筛分的作用」（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer-bar">
          <button className="icon-btn" title="上传金相/试样图片（B2 图像诊断）">
            <IconAttach />
          </button>
          <span className="slash-hint">{SLASH.join('  ')}</span>
          <span className="spacer" />
          {busy ? (
            <button className="send-btn" onClick={onStop} title="停止生成">
              <IconStop />
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim()} title="发送">
              <IconSend />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
