import type { ConnectionState, FeatureModule } from '../lib/types'

/** 知识边界导航。纯展示，用来告诉评委「Agent 的知识范围是封闭的」。 */
const TEXTBOOK = [
  '实验一 · 晶体结构与晶体缺陷',
  '实验二 · 凝固与结晶',
  '实验三 · 材料显微组织分析',
  '实验四 · 典型材料的物相组织观察',
  '实验十 · 材料表面硬度的测定',
  '实验十二 · 材料膨胀系数的测定',
  '实验二十 · 金属材料的热处理',
]

const LABOR = [
  '模块一 · 安全巡查与规范化整理',
  '模块二 · 材料制备工艺实践',
  '模块三 · 样品处理与仪器维护',
  '模块四 · 废弃物分类与资源回收',
]

interface Props {
  collapsed: boolean
  features: FeatureModule[]
  activeId: string | null
  onPick: (f: FeatureModule) => void
  connection: ConnectionState
}

export default function Sidebar({ collapsed, features, activeId, onPick, connection }: Props) {
  if (collapsed) {
    return (
      <aside className="sidebar">
        <div className="sidebar-head" style={{ justifyContent: 'center', padding: '14px 0 10px' }}>
          <div className="brand-mark" />
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark" />
          <span>材料实验 Agent</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">功能模块</div>
        {features.length === 0 && (
          <div style={{ padding: '4px 9px', fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
            尚未注册任何功能
          </div>
        )}
        {features.map((f) => (
          <button
            key={f.id}
            className={`nav-item${f.id === activeId ? ' active' : ''}`}
            onClick={() => onPick(f)}
            title={f.title}
          >
            <span className="label">{f.title}</span>
            {f.artifactTypes.length > 0 && <span className="nav-badge">画布</span>}
          </button>
        ))}

        <div className="sidebar-section" style={{ marginTop: 14 }}>
          知识边界 · 教材
        </div>
        {TEXTBOOK.map((t) => (
          <div key={t} className="nav-item" style={{ cursor: 'default', opacity: 0.62 }}>
            <span className="label" style={{ fontSize: 'var(--fs-sm)' }}>
              {t}
            </span>
          </div>
        ))}

        <div className="sidebar-section" style={{ marginTop: 14 }}>
          知识边界 · 劳育
        </div>
        {LABOR.map((t) => (
          <div key={t} className="nav-item" style={{ cursor: 'default', opacity: 0.62 }}>
            <span className="label" style={{ fontSize: 'var(--fs-sm)' }}>
              {t}
            </span>
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        {connection === 'mock' ? 'mock 模式 · 无后端或无 API Key' : 'v0.1.0 · 本地会话'}
      </div>
    </aside>
  )
}
