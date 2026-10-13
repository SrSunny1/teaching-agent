import { useState } from 'react'
import type { FeatureProps, Message } from '../../lib/types'

/**
 * 整页模式示例。
 *
 * 演示两件事：
 *   1. 模块怎么接管整个主区（自己的顶栏 / tab / 内容）—— 壳的对话栏、输入框全部让位
 *   2. 怎么在整页里保留「能看见 Agent 干活」的入口（硬规矩 3）—— 见「智能问答」tab
 *
 * ★ 样式全部用 tokens.css 的 CSS 变量，没有自造设计语言。
 *   模块可以有完全不同的**布局**，但必须在同一套**设计语言**里。
 *
 * ⚠️ 这里不能 import shell/ 下的东西（边界检查会报红）。工具卡片这类渲染
 *    要么自己写一份（像下面这样），要么请框架负责人提到 lib/ 里共享。
 */

/* ── 智能问答 tab 用的小组件 ── */

/** 工具调用卡片 —— 简化版，风格与壳保持一致 */
function ToolCard({ tool }: { tool: NonNullable<Message['tools']>[number] }) {
  const [open, setOpen] = useState(false)
  const color =
    tool.status === 'running' ? 'var(--accent)' : tool.status === 'error' ? 'var(--err)' : 'var(--text-muted)'
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-panel)',
        marginBottom: 6,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => tool.detail && setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '7px 10px',
          textAlign: 'left',
          cursor: tool.detail ? 'pointer' : 'default',
        }}
      >
        <span style={{ color, flexShrink: 0, fontSize: 'var(--fs-sm)' }}>
          {tool.status === 'running' ? '◌' : tool.status === 'error' ? '×' : '▸'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', color: 'var(--text-dim)' }}>
          {tool.label}
        </span>
        {tool.summary && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 'var(--fs-sm)',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '50%',
            }}
          >
            {tool.summary}
          </span>
        )}
      </button>
      {open && tool.detail && (
        <div
          style={{
            borderTop: '1px solid var(--border-soft)',
            padding: '9px 11px',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text-dim)',
            whiteSpace: 'pre-wrap',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {tool.detail}
        </div>
      )}
    </div>
  )
}

/**
 * ★ 硬规矩 3 的示范：整页模式下的「智能问答」区。
 *
 * 整页模式没有壳的对话栏，所以模块必须自己画一个出来 ——
 * 否则用户提问后看不到回答、看不到工具调用卡片，**「Agent」就消失了**，
 * 这个作品的核心卖点也就丢了。
 *
 * 数据来自 props.messages（只读）与 props.busy。
 */
function MiniChat({ messages, busy, onSend }: { messages: Message[]; busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim() || busy) return
    onSend(text)
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="box" style={{ marginTop: 16 }}>
            在下面提问，Agent 的回答和工具调用会显示在这里
            <div style={{ marginTop: 6, fontSize: 'var(--fs-xs)', opacity: 0.75 }}>
              试试「面心立方晶胞有几个原子」
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 16 }}>
            {m.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--r-md)',
                    padding: '8px 12px',
                    maxWidth: '78%',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div>
                {(m.tools ?? []).map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
                {m.content && (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{m.content}</div>
                )}
                {m.streaming && <span className="caret" />}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
            }}
            placeholder={busy ? 'Agent 正在回答…' : '问点什么…（Enter 发送）'}
            disabled={busy}
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '9px 13px',
              outline: 'none',
            }}
          />
          <button
            className="chip"
            onClick={submit}
            disabled={busy || !text.trim()}
            style={{ opacity: busy || !text.trim() ? 0.4 : 1 }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 模块自己的顶栏 + 内容 ── */

const TABS = [
  { id: 'content', label: '内容' },
  { id: 'chat', label: '智能问答' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function Page({ messages = [], busy = false, onSendMessage }: FeatureProps) {
  const [tab, setTab] = useState<TabId>('content')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── 模块自己的顶栏。壳的顶栏在这里是不存在的 ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 46,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600 }}>示例 · 整页模式</span>
        <span
          className="preview-badge"
          style={{ fontSize: 'var(--fs-xs)' }}
          title="这不是真实功能，只是整页模式的骨架示例"
        >
          示例
        </span>
        <span style={{ flex: 1 }} />
        {TABS.map((t) => (
          <button
            key={t.id}
            className="chip"
            onClick={() => setTab(t.id)}
            style={
              tab === t.id
                ? { borderColor: 'var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)' }
                : undefined
            }
          >
            {t.label}
          </button>
        ))}
      </header>

      {/* ── 内容区 ── */}
      {tab === 'content' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', minHeight: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 'var(--fs-lg)' }}>这一整块都是模块自己的</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: 640, lineHeight: 1.8 }}>
            壳的顶栏、对话栏、输入框全部让位了。你在这里可以放任何布局：
            上传区、卡片网格、表格、表单、分步向导…… 左边的导航栏仍然是壳的，
            点它就能离开这个模块。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
              marginTop: 20,
              maxWidth: 900,
            }}
          >
            {['布局自由', '配色受管', 'Agent 可见', '左栏是壳的'].map((t) => (
              <div
                key={t}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg-panel)',
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                  占位卡片 —— 真实模块换成自己的内容
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: '12px 14px',
              border: '1px solid var(--warn)',
              background: 'var(--warn-soft)',
              borderRadius: 'var(--r-md)',
              color: 'var(--warn)',
              fontSize: 'var(--fs-sm)',
              maxWidth: 640,
            }}
          >
            ⚠️ 切到「智能问答」tab 看看 —— 那是<b>硬规矩 3</b>的示范：整页模式下必须留一个
            能看见 Agent 干活的入口，否则评委看不到「Agent」在哪。
          </div>
        </div>
      ) : (
        <MiniChat messages={messages} busy={busy} onSend={onSendMessage} />
      )}
    </div>
  )
}
