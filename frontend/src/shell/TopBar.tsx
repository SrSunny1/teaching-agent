import { IconMoon, IconPanel, IconSun } from './icons'

interface Props {
  title: string
  theme: 'dark' | 'light'
  panelOpen: boolean
  sidebarOpen: boolean
  onToggleTheme: () => void
  onTogglePanel: () => void
  onToggleSidebar: () => void
}

export default function TopBar({
  title,
  theme,
  panelOpen,
  onToggleTheme,
  onTogglePanel,
  onToggleSidebar,
}: Props) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button className="icon-btn" onClick={onToggleSidebar} title="折叠侧栏">
          <IconPanel />
        </button>
        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-actions">
        <span className="chip mono" title="模型由环境变量 MODEL 配置">
          deepseek-chat
        </span>
        <button className="icon-btn" onClick={onToggleTheme} title="切换主题">
          {theme === 'dark' ? <IconMoon /> : <IconSun />}
        </button>
        <button
          className="icon-btn"
          onClick={onTogglePanel}
          title={panelOpen ? '收起画布' : '展开画布'}
          style={{ color: panelOpen ? 'var(--accent)' : undefined }}
        >
          <IconPanel />
        </button>
      </div>
    </header>
  )
}
