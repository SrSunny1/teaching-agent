import { useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Message } from '../lib/types'
import ToolCallCard from './ToolCallCard'
import { IconChevron } from './icons'

const EXAMPLES = [
  { t: '250 目筛分的作用是什么？', d: '知识库问答 + 溯源' },
  { t: '45 钢淬火后为什么要回火？', d: '触发热处理沙盒' },
  { t: '面心立方晶胞有多少个原子？', d: '加载 3D 晶体结构' },
]

function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="thinking">
      <button className="thinking-toggle" onClick={() => setOpen((v) => !v)}>
        <span className={`chev${open ? ' open' : ''}`} style={{ display: 'grid' }}>
          <IconChevron size={12} />
        </span>
        <span>{open ? '收起思考过程' : '思考过程'}</span>
      </button>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  )
}

function AssistantMessage({ m }: { m: Message }) {
  return (
    <div className="msg msg-assistant">
      <div className="body">
        {m.thinking && <Thinking text={m.thinking} />}

        {m.tools && m.tools.length > 0 && (
          <div className="tool-stack">
            {m.tools.map((t) => (
              <ToolCallCard key={t.id} tool={t} />
            ))}
          </div>
        )}

        {m.content && <Markdown>{m.content}</Markdown>}

        {m.streaming && (
          <span className="caret" aria-label="生成中" />
        )}
      </div>
    </div>
  )
}

export default function ChatStream({ messages, onSend }: {
  messages: Message[]
  onSend: (text: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastUserMessageRef = useRef<string | undefined>(undefined)
  const latestUserMessageId = [...messages].reverse().find((message) => message.role === 'user')?.id

  // 只在用户贴着底部时才自动滚动，避免打断向上翻阅
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const newUserMessage = Boolean(
      latestUserMessageId && latestUserMessageId !== lastUserMessageRef.current,
    )
    if (latestUserMessageId) lastUserMessageRef.current = latestUserMessageId

    // 每次发送新问题都从旧消息位置跳到最新位置；后续生成仍尊重用户手动上翻。
    if (newUserMessage) pinnedRef.current = true
    if (newUserMessage || pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages, latestUserMessageId])

  if (messages.length === 0) {
    return (
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner" style={{ paddingTop: 60 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div
              style={{
                width: 44,
                height: 44,
                margin: '0 auto 14px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--accent), #9d7bff)',
              }}
            />
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 6 }}>
              材料物理实验教学 Agent
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              知识范围：教材 7 个实验 + 材料物理专业实验1/2 讲义/大纲 + 劳动教育四大模块
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {EXAMPLES.map((e) => (
              <button
                key={e.t}
                type="button"
                className="tool-card"
                onClick={() => onSend(e.t)}
                style={{
                  padding: '11px 13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                  font: 'inherit',
                  width: '100%',
                }}
              >
                <div style={{ marginBottom: 3 }}>{e.t}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>{e.d}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="chat-inner">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div className="msg msg-user" key={m.id}>
              <div className="bubble">
                {m.image && (
                  <img
                    src={m.image}
                    alt="你上传的图片"
                    style={{
                      display: 'block',
                      maxWidth: 220,
                      maxHeight: 180,
                      borderRadius: 'var(--r-sm)',
                      marginBottom: m.content ? 6 : 0,
                    }}
                  />
                )}
                {m.content}
              </div>
            </div>
          ) : (
            <AssistantMessage key={m.id} m={m} />
          ),
        )}
      </div>
    </div>
  )
}
