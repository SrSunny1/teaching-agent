import { useEffect, useState } from 'react'
import type { ConnectionState, FeatureModule } from '../lib/types'
import { GLOBAL_CONV } from '../lib/history'
import type { ConvMeta } from '../lib/history'
import { IconChat } from './icons'

interface Props {
  onOpenReport: () => void
  reportBusy: boolean
  collapsed: boolean
  features: FeatureModule[]
  /** 当前激活的模块空间（= 模块 id 或 __global__） */
  activeModuleKey: string
  /** 当前激活的会话 id（可能是 draft:<moduleKey> 空草稿） */
  activeConvId: string
  /** 全量历史会话元信息，已按 updatedAt 倒序 */
  threads: ConvMeta[]
  onPick: (f: FeatureModule | null) => void
  onPickThread: (convId: string) => void
  onNewThread: (moduleKey: string) => void
  onDeleteThread: (convId: string) => void
  onRenameThread: (convId: string, title: string) => void
  connection: ConnectionState
}

/** 右击菜单：会话条目（重命名/删除）或模块/全局对话行（＋ 新对话） */
type CtxMenu =
  | { kind: 'thread'; id: string; title: string; x: number; y: number; confirmDelete?: boolean }
  | { kind: 'module'; moduleKey: string; x: number; y: number }

/** 贴边点开菜单时往回收，别甩出屏幕 */
const menuPos = (e: { clientX: number; clientY: number }) => ({
  x: Math.min(e.clientX, window.innerWidth - 150),
  y: Math.min(e.clientY, window.innerHeight - 90),
})

export default function Sidebar({
  onOpenReport,
  reportBusy,
  collapsed,
  features,
  activeModuleKey,
  activeConvId,
  threads,
  onPick,
  onPickThread,
  onNewThread,
  onDeleteThread,
  onRenameThread,
  connection,
}: Props) {
  const [menu, setMenu] = useState<CtxMenu | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  /* Esc 关闭右击菜单 */
  useEffect(() => {
    if (!menu) return
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menu])

  const commitRename = () => {
    if (renaming) {
      const v = renaming.value.trim()
      const old = threads.find((t) => t.id === renaming.id)?.title
      if (v && v !== old) onRenameThread(renaming.id, v)
    }
    setRenaming(null)
  }

  if (collapsed) {
    return (
      <aside className="sidebar">
        <div className="sidebar-head" style={{ justifyContent: 'center', padding: '14px 0 10px' }}>
          <img className="brand-mark" src="/agent-logo.png" alt="" />
        </div>
      </aside>
    )
  }

  /**
   * 某个模块空间下的历史会话列表，只在模块激活时展开。
   * 历史条目右击出上下文菜单：重命名（行内编辑）/ 删除。
   * 「＋ 新对话」入口挪到模块行的右击菜单里，不再常驻显示。
   */
  const renderThreads = (moduleKey: string) => (
    <>
      {threads
        .filter((t) => t.moduleKey === moduleKey)
        .map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            className={`nav-item nav-sub${activeConvId === t.id ? ' active' : ''}`}
            onClick={() => {
              if (renaming?.id !== t.id) onPickThread(t.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPickThread(t.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ kind: 'thread', id: t.id, title: t.title, ...menuPos(e) })
            }}
            title={t.title}
          >
            {renaming?.id === t.id ? (
              <input
                className="thread-rename"
                value={renaming.value}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenaming({ id: t.id, value: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={commitRename}
              />
            ) : (
              <span className="label">{t.title}</span>
            )}
          </div>
        ))}
    </>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <img className="brand-mark" src="/agent-logo.png" alt="" />
          <span>材料实验 Agent</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">学习反馈</div>
        <button className="nav-item" disabled={reportBusy} onClick={onOpenReport} style={{ color: 'var(--accent)' }}>
          <span className="label">学习评价报告</span>
        </button>
        {/* ── 对话（每条互不干扰） ── */}
        <div className="sidebar-section">对话</div>
        <button
          className={`nav-item${activeModuleKey === GLOBAL_CONV ? ' active' : ''}`}
          onClick={() => onPick(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ kind: 'module', moduleKey: GLOBAL_CONV, ...menuPos(e) })
          }}
          title="不属于任何模块的通用对话"
        >
          <span style={{ display: 'grid', flexShrink: 0, opacity: 0.75 }}>
            <IconChat />
          </span>
          <span className="label">全局对话</span>
        </button>
        {activeModuleKey === GLOBAL_CONV && renderThreads(GLOBAL_CONV)}

        {/* ── 功能模块：点进某个模块 = 进入它的对话空间 ── */}
        <div className="sidebar-section" style={{ marginTop: 14 }}>
          模块对话
        </div>
        {features.length === 0 && (
          <div style={{ padding: '4px 9px', fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
            尚未注册任何模块
          </div>
        )}
        {features.map((f) => (
          <div key={f.id}>
            <button
              className={`nav-item${activeModuleKey === f.id ? ' active' : ''}`}
              onClick={() => onPick(f)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ kind: 'module', moduleKey: f.id, ...menuPos(e) })
              }}
              title={f.title}
            >
              <span className="label">{f.title}</span>
            </button>
            {activeModuleKey === f.id && renderThreads(f.id)}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        {connection === 'mock' ? 'mock 模式 · 无后端或无 API Key' : 'v0.1.0 · 本地会话'}
      </div>

      {/* ── 历史会话右击菜单（fixed 定位，跳出 sidebar 的 overflow） ── */}
      {menu && (
        <>
          <div
            className="ctx-mask"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.kind === 'module' ? (
              <button
                className="ctx-item"
                onClick={() => {
                  onNewThread(menu.moduleKey)
                  setMenu(null)
                }}
              >
                ＋ 新对话
              </button>
            ) : (
              <>
                <button
                  className="ctx-item"
                  onClick={() => {
                    setRenaming({ id: menu.id, value: menu.title })
                    setMenu(null)
                  }}
                >
                  重命名
                </button>
                <button
                  className={`ctx-item danger${menu.confirmDelete ? ' confirm' : ''}`}
                  onClick={() => {
                    if (!menu.confirmDelete) {
                      setMenu({ ...menu, confirmDelete: true })
                      return
                    }
                    const targetId = menu.id
                    setMenu(null)
                    onDeleteThread(targetId)
                  }}
                >
                  {menu.confirmDelete ? '确认删除？' : '删除'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
