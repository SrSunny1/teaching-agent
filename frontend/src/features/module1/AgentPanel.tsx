import { useEffect, useRef, useState } from 'react'
import type { Message } from '../../lib/types'

interface Props {
  messages: Message[]
  busy: boolean
  onSend: (text: string) => void
  onClose: () => void
}

const STYLE = `
.mg-agent { width: 372px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0;
  border-left: 1px solid var(--border, rgba(120,150,220,.24)); background: var(--bg-panel, #0f172a); }
.mg-agent-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; flex-shrink: 0;
  border-bottom: 1px solid var(--border-soft, rgba(120,150,220,.16)); font-size: 12.5px; font-weight: 600; }
.mg-agent-head .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok, #22c55e); }
.mg-agent-head .dot.busy { background: var(--accent, #22d3ee); animation: mg-agent-pulse 1.1s ease-in-out infinite; }
@keyframes mg-agent-pulse { 0%,100% { opacity: .35; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.15) } }
.mg-agent-head .sub { font-size: 10.5px; color: var(--text-faint, #6d80a6); font-weight: 400; }
.mg-agent-head .x { margin-left: auto; width: 24px; height: 24px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--border, rgba(120,150,220,.28)); background: none; color: var(--text-dim, #b9c7e6); }
.mg-agent-list { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
.mg-agent-empty { border: 1px dashed var(--border, rgba(120,150,220,.3)); border-radius: 10px;
  padding: 12px; font-size: 11.5px; line-height: 1.8; color: var(--text-muted, #8ea3c9); }
.mg-agent-empty button { display: block; width: 100%; text-align: left; margin-top: 6px; padding: 5px 8px;
  border-radius: 7px; cursor: pointer; font-size: 11px; color: var(--text-dim, #b9c7e6);
  background: rgba(125,165,255,.08); border: 1px solid rgba(125,165,255,.22); }
.mg-agent-empty button:hover { background: rgba(125,165,255,.18); color: var(--text, #eaf1ff); }
.mg-agent-msg { margin-bottom: 13px; }
.mg-agent-user { display: flex; justify-content: flex-end; }
.mg-agent-user > div { max-width: 84%; padding: 7px 11px; border-radius: 10px; white-space: pre-wrap;
  font-size: 12px; line-height: 1.65; background: var(--bg-elevated, rgba(125,165,255,.16));
  border: 1px solid var(--border-soft, rgba(120,150,220,.18)); }
.mg-agent-bot { font-size: 12.4px; line-height: 1.78; white-space: pre-wrap; color: var(--text, #eaf1ff); }
.mg-agent-tool { border: 1px solid var(--border, rgba(120,150,220,.26)); border-radius: 9px;
  background: var(--bg, rgba(10,16,32,.5)); margin-bottom: 6px; overflow: hidden; }
.mg-agent-tool button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 9px;
  text-align: left; background: none; border: 0; cursor: pointer; }
.mg-agent-tool .label { font: 11px/1.5 var(--font-mono, monospace); color: var(--text-dim, #b9c7e6); }
.mg-agent-tool .sum { margin-left: auto; font-size: 10.5px; color: var(--text-muted, #8ea3c9);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 52%; }
.mg-agent-tool .detail { border-top: 1px solid var(--border-soft, rgba(120,150,220,.16)); padding: 8px 10px;
  font-size: 11px; color: var(--text-dim, #b9c7e6); white-space: pre-wrap; max-height: 220px; overflow-y: auto; }
.mg-agent-caret { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px;
  background: var(--accent, #22d3ee); animation: mg-agent-blink .9s steps(2) infinite; }
@keyframes mg-agent-blink { 50% { opacity: 0 } }
.mg-agent-input { flex-shrink: 0; border-top: 1px solid var(--border, rgba(120,150,220,.24)); padding: 9px 11px; }
.mg-agent-input .row { display: flex; gap: 7px; }
.mg-agent-input input { flex: 1; min-width: 0; padding: 8px 11px; border-radius: 9px; font-size: 12px;
  background: var(--bg-input, rgba(125,165,255,.08)); color: var(--text, #eaf1ff);
  border: 1px solid var(--border, rgba(120,150,220,.3)); outline: none; }
.mg-agent-input button { padding: 0 14px; border-radius: 9px; cursor: pointer; font-size: 12px;
  background: var(--accent-soft, rgba(34,211,238,.16)); color: var(--accent, #7fe3f5);
  border: 1px solid var(--accent-border, rgba(34,211,238,.45)); }
.mg-agent-input button:disabled { opacity: .45; cursor: default; }
`

/** 工具调用卡片（整页模式下让「Agent 在干活」可见） */
function ToolCard({ tool }: { tool: NonNullable<Message['tools']>[number] }) {
  const [open, setOpen] = useState(false)
  const color =
    tool.status === 'running' ? 'var(--accent, #22d3ee)' : tool.status === 'error' ? 'var(--err, #ef4444)' : 'var(--text-muted, #8ea3c9)'
  return (
    <div className="mg-agent-tool">
      <button onClick={() => tool.detail && setOpen((v) => !v)}>
        <span style={{ color, flexShrink: 0 }}>{tool.status === 'running' ? '◌' : tool.status === 'error' ? '×' : '▸'}</span>
        <span className="label">{tool.label}</span>
        {tool.summary && <span className="sum">{tool.summary}</span>}
      </button>
      {open && tool.detail && <div className="detail">{tool.detail}</div>}
    </div>
  )
}

/**
 * 整页模式下的 Agent 问答抽屉。
 *
 * 整页模式没有壳的对话栏，按项目硬规矩 3，模块必须自带一个「能看见 Agent 干活」的入口：
 * 这里能看到工具调用卡片、流式回答与输入框，数据来自 props.messages / props.busy。
 */
export default function AgentPanel({ messages, busy, onSend, onClose }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t)
    setText('')
  }

  return (
    <aside className="mg-agent">
      <style>{STYLE}</style>
      <div className="mg-agent-head">
        <span className={`dot${busy ? ' busy' : ''}`} />
        Agent 问答
        <span className="sub">{busy ? '正在回答…' : '与图谱联动'}</span>
        <button className="x" onClick={onClose} title="收起问答">
          ✕
        </button>
      </div>

      <div className="mg-agent-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="mg-agent-empty">
            在这里提问，Agent 的回答与工具调用会显示出来。试试：
            <button onClick={() => onSend('帮我梳理「工艺」星团的知识结构，并说明它与性能的关系')}>
              梳理「工艺」星团的知识结构
            </button>
            <button onClick={() => onSend('表面硬度由哪些因素决定？请给出课程出处')}>
              表面硬度由哪些因素决定
            </button>
            <button onClick={() => onSend('热处理四把火分别对应什么组织和性能？')}>
              热处理四把火对应什么组织
            </button>
          </div>
        )}
        {messages.map((m) => (
          <div className="mg-agent-msg" key={m.id}>
            {m.role === 'user' ? (
              <div className="mg-agent-user">
                <div>{m.content}</div>
              </div>
            ) : (
              <div>
                {(m.tools ?? []).map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
                {m.content && <div className="mg-agent-bot">{m.content}</div>}
                {m.streaming && <span className="mg-agent-caret" />}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mg-agent-input">
        <div className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
            }}
            placeholder={busy ? 'Agent 正在回答…' : '问点什么…（Enter 发送）'}
            disabled={busy}
          />
          <button onClick={submit} disabled={busy || !text.trim()}>
            发送
          </button>
        </div>
      </div>
    </aside>
  )
}
