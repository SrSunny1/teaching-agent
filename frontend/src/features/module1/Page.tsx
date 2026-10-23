import { useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import AgentPanel from './AgentPanel'
import GraphBody from './GraphBody'
import { useGraphNav } from './graphNav'
import { KNOWLEDGE_EDGES, KNOWLEDGE_NODES, QUESTION_EDGES, QUESTION_NODES } from './graphData'

const STYLE = `
.mg-page { display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bg, #0b1020); color: var(--text, #eaf1ff); }
.mg-page-head { flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 9px 16px;
  border-bottom: 1px solid var(--border, rgba(120,150,220,.24)); background: var(--bg-panel, #0f172a); }
.mg-page-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.mg-page-mark { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0;
  background: radial-gradient(circle at 32% 28%, rgba(34,211,238,.95), rgba(99,102,241,.65) 58%, rgba(15,23,42,.9));
  box-shadow: 0 0 14px rgba(56,189,248,.45); font-size: 14px; color: #04121f; }
.mg-page-title { font-size: 13.5px; font-weight: 650; line-height: 1.3; }
.mg-page-sub { font-size: 10.5px; color: var(--text-faint, #6d80a6); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.mg-page-tabs { display: inline-flex; padding: 3px; gap: 3px; border-radius: 10px;
  background: var(--bg-input, rgba(125,165,255,.08)); border: 1px solid var(--border, rgba(120,150,220,.25)); }
.mg-page-tabs button { padding: 5px 15px; border-radius: 8px; border: 0; cursor: pointer; font-size: 12.5px;
  background: none; color: var(--text-dim, #b9c7e6); white-space: nowrap; }
.mg-page-tabs button.on { background: var(--bg-elevated, rgba(125,165,255,.18)); color: var(--text, #eaf1ff); font-weight: 600; }
.mg-page-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.mg-page-agentbtn { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 9px;
  cursor: pointer; font-size: 12px; color: var(--text-dim, #b9c7e6);
  background: var(--bg-input, rgba(125,165,255,.08)); border: 1px solid var(--border, rgba(120,150,220,.28)); }
.mg-page-agentbtn:hover { color: var(--text, #eaf1ff); border-color: rgba(125,165,255,.55); }
.mg-page-agentbtn.on { color: var(--accent, #7fe3f5); border-color: var(--accent-border, rgba(34,211,238,.5));
  background: var(--accent-soft, rgba(34,211,238,.14)); }
.mg-page-agentbtn .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--ok, #22c55e); }
.mg-page-agentbtn .pulse.busy { background: var(--accent, #22d3ee); animation: mg-page-pulse 1.1s ease-in-out infinite; }
@keyframes mg-page-pulse { 0%,100% { opacity: .3; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.15) } }
.mg-page-body { flex: 1; min-height: 0; display: flex; }
.mg-page-graph { position: relative; flex: 1; min-width: 0; min-height: 0; }
.mg-page-float { position: absolute; right: 14px; bottom: 46px; z-index: 30; display: inline-flex;
  align-items: center; gap: 7px; padding: 7px 12px; border-radius: 99px; cursor: pointer; font-size: 11.5px;
  background: var(--bg-panel, rgba(12,18,36,.94)); color: var(--text, #eaf1ff);
  border: 1px solid var(--accent-border, rgba(34,211,238,.45)); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.mg-page-float .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #22d3ee);
  animation: mg-page-pulse 1.1s ease-in-out infinite; }
`

/**
 * 课程图谱 · 整页工作台。
 *
 * 点左栏「课程图谱」后，壳的顶栏 / 对话栏 / 输入框全部让位，图谱占满中间与右侧，
 * 星图与问题链有足够的空间展开。按项目硬规矩 3，右上角保留「Agent 问答」抽屉：
 * 图谱里任何「让 Agent 讲解 / 深度解析」都会自动打开抽屉，能看到工具调用与流式回答。
 */
export default function Page({ artifact, onSendMessage, messages = [], busy = false }: FeatureProps) {
  const nav = useGraphNav(artifact)
  const [agentOpen, setAgentOpen] = useState(false)

  /** 图谱里点「让 Agent 讲解」时，顺手把问答抽屉打开，避免回答跑到看不见的地方 */
  const send = (text: string) => {
    onSendMessage(text)
    setAgentOpen(true)
  }

  return (
    <div className="mg-page">
      <style>{STYLE}</style>

      <header className="mg-page-head">
        <div className="mg-page-brand">
          <span className="mg-page-mark">✦</span>
          <div style={{ minWidth: 0 }}>
            <div className="mg-page-title">课程图谱</div>
            <div className="mg-page-sub">
              {KNOWLEDGE_NODES.length} 个知识点 · {KNOWLEDGE_EDGES.length} 条关系 · {QUESTION_NODES.length} 个课程问题 ·{' '}
              {QUESTION_EDGES.length} 条问题链
            </div>
          </div>
        </div>

        <div className="mg-page-tabs">
          <button className={nav.tab === 'knowledge' ? 'on' : ''} onClick={() => nav.setTab('knowledge')}>
            知识图谱
          </button>
          <button className={nav.tab === 'question' ? 'on' : ''} onClick={() => nav.setTab('question')}>
            问题图谱
          </button>
        </div>

        <div className="mg-page-right">
          <button
            className={`mg-page-agentbtn${agentOpen ? ' on' : ''}`}
            onClick={() => setAgentOpen((v) => !v)}
            title="展开 / 收起 Agent 问答"
          >
            <span className={`pulse${busy ? ' busy' : ''}`} />
            {agentOpen ? '收起问答' : 'Agent 问答'}
          </button>
        </div>
      </header>

      <div className="mg-page-body">
        <div className="mg-page-graph">
          <GraphBody nav={nav} onSend={send} />
          {!agentOpen && busy && (
            <button className="mg-page-float" onClick={() => setAgentOpen(true)}>
              <span className="pulse" />
              Agent 正在回答，点击查看
            </button>
          )}
        </div>
        {agentOpen && (
          <AgentPanel messages={messages} busy={busy} onSend={onSendMessage} onClose={() => setAgentOpen(false)} />
        )}
      </div>
    </div>
  )
}
