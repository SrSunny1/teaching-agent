import type { FeatureProps } from '../../lib/types'
import GraphBody from './GraphBody'
import { useGraphNav } from './graphNav'

const STYLE = `
.mg-topbar { flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border-bottom: 1px solid var(--border, rgba(120,150,220,.22)); background: var(--bg-panel, #0f172a); }
.mg-tabs { display: inline-flex; padding: 3px; gap: 3px; border-radius: 10px;
  background: var(--bg-input, rgba(125,165,255,.08)); border: 1px solid var(--border, rgba(120,150,220,.25)); }
.mg-tabs button { padding: 5px 14px; border-radius: 8px; border: 0; cursor: pointer; font-size: 12.5px;
  background: none; color: var(--text-dim, #b9c7e6); }
.mg-tabs button.on { background: var(--bg-elevated, rgba(125,165,255,.18)); color: var(--text, #eaf1ff); font-weight: 600; }
.mg-sub { font-size: 11px; color: var(--text-faint, #6d80a6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

/** 画布模式：全局对话里触发 query_graph 时，在右栏画布中展示图谱（含全屏 ⛶） */
export default function Component({ artifact, onSendMessage }: FeatureProps) {
  const nav = useGraphNav(artifact)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{STYLE}</style>
      <div className="mg-topbar">
        <div className="mg-tabs">
          <button className={nav.tab === 'knowledge' ? 'on' : ''} onClick={() => nav.setTab('knowledge')}>
            知识图谱
          </button>
          <button className={nav.tab === 'question' ? 'on' : ''} onClick={() => nav.setTab('question')}>
            问题图谱
          </button>
        </div>
        <span className="mg-sub">
          {nav.tab === 'knowledge'
            ? '五级知识点 · 六大星团 · 点击星点飞越查看关联网络'
            : '三层递进问题链 · 点击卡片高亮上下游路径'}
        </span>
      </div>
      <GraphBody nav={nav} onSend={onSendMessage} />
    </div>
  )
}
