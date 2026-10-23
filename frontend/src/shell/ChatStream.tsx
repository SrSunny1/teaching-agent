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

const NAILONG_STICKERS = [
  {
    img: '/nailong/wave.gif',
    label: '奶龙打招呼',
    prompt: '你好呀！请介绍一下这门材料物理实验课包含哪些实验，以及你能怎么帮我学习？',
  },
  {
    img: '/nailong/peek.gif',
    label: '盯紧制样细节',
    prompt: '金相试样磨制和抛光时最容易踩哪些坑？',
  },
  {
    img: '/nailong/confused.webp',
    label: '相图怎么看？',
    prompt: '用好懂的话帮我梳理铁碳相图里的关键相变点',
  },
  {
    img: '/nailong/cute.png',
    label: '考考我热处理',
    prompt: '来一道 45 钢淬火与回火的快问快答考考我',
  },
]

const HERO_QUOTES = [
  '点下面任意一只奶龙，快速开启实验问答～',
  '奶龙拍了拍圆肚皮：今天也要把实验原理搞得明明白白！',
  '做金相抛光记得拿稳试样，小心飞出去变成暗器哦～',
  '45 钢淬火完赶紧回火，马氏体太脆啦！',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="caret" aria-label="生成中" />
            <span className="nl-streaming-pet">
              <img src="/nailong/peek.gif" alt="奶龙陪读中" />
              <span>奶龙正在翻实验讲义…</span>
            </span>
          </div>
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
  const [quoteIdx, setQuoteIdx] = useState(0)
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
            <img
              className="nl-hero-avatar"
              src="/agent-logo.png"
              alt=""
              onClick={() => setQuoteIdx((i) => i + 1)}
              title="点我换一句实验悄悄话"
              style={{
                display: 'block',
                margin: '0 auto 14px',
                width: 76,
                height: 76,
                borderRadius: '50%',
                objectFit: 'cover',
                objectPosition: '47.5% 50%',
                boxShadow: '0 8px 28px rgba(96, 68, 200, 0.35)',
              }}
            />
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 4 }}>
              材料物理实验教学 Agent
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              《材料科学基础》7 大实验 · 劳动教育 · 原文溯源伴学
            </div>

            <div className="nl-mascot-strip">
              {NAILONG_STICKERS.map((s, idx) => (
                <button
                  key={s.label}
                  type="button"
                  className="nl-sticker-btn"
                  style={{ animationDelay: `${idx * 65}ms` }}
                  onClick={() => onSend(s.prompt)}
                >
                  <img src={s.img} alt={s.label} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <div>
              <span key={quoteIdx} className="nl-toast">
                <img
                  src="/nailong/cute.png"
                  alt=""
                  style={{ width: 20, height: 20, objectFit: 'contain' }}
                />
                <span>{HERO_QUOTES[quoteIdx % HERO_QUOTES.length]}</span>
              </span>
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
