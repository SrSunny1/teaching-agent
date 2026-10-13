import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  Artifact,
  ConnectionState,
  FeatureModule,
  Message,
  SSEEvent,
  SessionStats,
} from '../lib/types'
import { featureByArtifact, featureById, features } from '../lib/registry'
import { probeBackend, streamChat } from '../lib/sse'
import { streamMock } from '../lib/mock'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ChatStream from './ChatStream'
import Composer from './Composer'
import ArtifactPanel from './ArtifactPanel'
import StatusBar from './StatusBar'

let seq = 0
const uid = () => `m${++seq}`

/** 全局对话（不在任何模块里）的 key */
const GLOBAL_CONV = '__global__'

/** 把一个 SSE 事件合并进指定的 assistant 消息，返回新数组。 */
function patchMsg(list: Message[], id: string, fn: (m: Message) => Message): Message[] {
  return list.map((m) => (m.id === id ? fn(m) : m))
}

function mergeEvent(m: Message, e: SSEEvent): Message {
  switch (e.type) {
    case 'thinking':
      return { ...m, thinking: (m.thinking ?? '') + e.text }
    case 'token':
      return { ...m, content: m.content + e.text }
    case 'tool_call':
      return {
        ...m,
        tools: [
          ...(m.tools ?? []),
          { id: e.id, name: e.name, label: e.label, args: e.args, status: 'running' as const },
        ],
      }
    case 'tool_result':
      return {
        ...m,
        tools: (m.tools ?? []).map((t) =>
          t.id === e.id ? { ...t, status: 'ok' as const, summary: e.summary, detail: e.detail } : t,
        ),
      }
    case 'error':
      return {
        ...m,
        tools: (m.tools ?? []).map((t) => (t.status === 'running' ? { ...t, status: 'error' as const } : t)),
      }
    default:
      return m
  }
}

export default function App() {
  /**
   * ★ 每个模块一条独立的对话（协作时不会搅在一起）。
   * key = 模块 id，或 GLOBAL_CONV（不属于任何模块的通用对话）。
   */
  const [conversations, setConversations] = useState<Record<string, Message[]>>({
    [GLOBAL_CONV]: [],
  })
  const [activeConvKey, setActiveConvKey] = useState<string>(GLOBAL_CONV)

  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null)
  /**
   * 右栏画布是否展开。
   *
   * ★ 默认**收起**：一进来是两栏（对话 + 左栏），画布只在真正需要时才出现 ——
   *   即模块声明了 autoOpenCanvas 并产出了 artifact（见下面 artifact 分支）。
   *   默认展开的话，每个只想问问题的学生都白白被占掉一块屏幕。
   */
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(580)
  const [resizingPanel, setResizingPanel] = useState(false)
  const [wideLayout, setWideLayout] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  /** 画布全屏：对话栏收起，画布占满主区。是「视图模式」不是布局重构 */
  const [canvasFull, setCanvasFull] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [stats, setStats] = useState<SessionStats>({})
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const messages = conversations[activeConvKey] ?? []
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages

  /** 当前对话的 key —— 发送时捕获它，保证回复写回原来的对话，而不是写到用户已切走的那条 */
  const convKeyRef = useRef<string>(GLOBAL_CONV)
  convKeyRef.current = activeConvKey

  const setConv = useCallback((key: string, updater: (prev: Message[]) => Message[]) => {
    setConversations((prev) => ({ ...prev, [key]: updater(prev[key] ?? []) }))
  }, [])

  /* ── 探测后端，决定走真实流还是 mock ── */
  useEffect(() => {
    let alive = true
    probeBackend().then(({ ok, hasKey }) => {
      if (alive) setConnection(ok && hasKey ? 'live' : 'mock')
    })
    return () => {
      alive = false
    }
  }, [])

  /* ── 主题落到 <html data-theme> ── */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)')
    const update = () => setWideLayout(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const maxPanelWidth = useCallback(() => {
    const root = document.querySelector<HTMLElement>('.shell')
    if (!root) return 900
    const sidebarWidth = Number.parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-w')) || 236
    return Math.max(360, Math.min(900, root.clientWidth - sidebarWidth - 360))
  }, [])

  const resizePanel = useCallback((clientX: number) => {
    const root = document.querySelector<HTMLElement>('.shell')
    if (!root) return
    const maxWidth = maxPanelWidth()
    const nextWidth = root.getBoundingClientRect().right - clientX
    setPanelWidth(Math.round(Math.max(360, Math.min(maxWidth, nextWidth))))
  }, [maxPanelWidth])

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const change = event.key === 'ArrowRight' ? 24 : -24
      setPanelWidth((width) => Math.max(360, Math.min(maxPanelWidth(), width + change)))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setPanelWidth(360)
    } else if (event.key === 'End') {
      event.preventDefault()
      setPanelWidth(maxPanelWidth())
    }
  }, [maxPanelWidth])

  /* ── Esc 退出画布全屏 ── */
  useEffect(() => {
    if (!canvasFull) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCanvasFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canvasFull])

  /* ── 当前画布上该显示哪个功能 ── */
  const activeFeature: FeatureModule | undefined = useMemo(() => {
    if (activeFeatureId) {
      const f = featureById(activeFeatureId)
      if (f) return f
    }
    return artifact ? featureByArtifact(artifact.artifactType) : undefined
  }, [activeFeatureId, artifact])

  // 画布上现在展示的是样例数据还是 Agent 真实产出？
  // 用引用相等判断：真实 artifact 事件带的是新对象，不会等于 preview 常量。
  const isPreview = useMemo(
    () => Boolean(artifact && activeFeature?.preview && artifact.data === activeFeature.preview),
    [artifact, activeFeature],
  )

  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setConv(convKeyRef.current, (p) => p.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }, [setConv])

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return

      const convKey = convKeyRef.current

      /*
       * ★ 模块身份取「对话 key」，不是「画布当前显示哪个模块」—— 这两者会分叉：
       *   在全局对话里触发了某个模块的 artifact 时（见下面 artifact 分支），画布切过去了、
       *   对话仍然是 __global__。那种情况下问「你负责什么」应当答通用身份，所以以对话为准。
       *   （这是有意为之的取舍，不是 bug —— 别改成 activeFeatureId。）
       */
      const mod = featureById(convKey)
      const featureCtx = mod
        ? { id: mod.id, title: mod.title, persona: mod.persona }
        : undefined

      const userId = uid()
      const asstId = uid()
      const history: Message[] = [
        ...(conversations[convKey] ?? []),
        { id: userId, role: 'user', content: q },
      ]
      setConv(convKey, () => [...history, { id: asstId, role: 'assistant', content: '', streaming: true }])
      setBusy(true)
      setStats({})

      const ctrl = new AbortController()
      abortRef.current = ctrl
      const t0 = performance.now()
      let tokenCount = 0
      let activeTool: string | undefined

      const onEvent = (e: SSEEvent) => {
        if (e.type === 'artifact') {
          setArtifact({ artifactType: e.artifactType, data: e.data })
          const owner = featureByArtifact(e.artifactType)
          if (owner) {
            setActiveFeatureId(owner.id)
            // ★ 只有模块自己声明了 autoOpenCanvas 才抢屏（见 lib/types.ts）。
            //   展示型模块（3D 晶体这类）弹出来是「你要看的东西来了」；
            //   对话型模块（费曼追问这类）弹出来只是从问答区抢走一块屏幕。
            //   壳不认具体模块名 —— 判据由模块在自己的 index.ts 里声明。
            if (owner.autoOpenCanvas) setPanelOpen(true)
          }
          return
        }
        if (e.type === 'done') {
          setConv(convKey, (p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
          return
        }
        if (e.type === 'tool_call') activeTool = e.label
        if (e.type === 'tool_result') activeTool = undefined
        if (e.type === 'token') tokenCount += e.text.length

        setConv(convKey, (p) => patchMsg(p, asstId, (m) => mergeEvent(m, e)))
        setStats({
          activeTool,
          elapsedMs: Math.round(performance.now() - t0),
          tokens: Math.round(tokenCount / 1.6),
        })
      }

      try {
        if (connection === 'mock') {
          await streamMock(q, onEvent, ctrl.signal)
        } else {
          await streamChat({
            sessionId: 'local',
            messages: history,
            feature: featureCtx,
            onEvent,
            signal: ctrl.signal,
          })
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          const message = err instanceof Error ? err.message : String(err)
          onEvent({ type: 'error', message })
          setConv(convKey, (p) =>
            patchMsg(p, asstId, (m) => ({
              ...m,
              streaming: false,
              content: m.content || `**请求失败**：${message}\n\n请确认后端已启动，或检查控制台。`,
            })),
          )
        }
      } finally {
        abortRef.current = null
        setBusy(false)
        setConv(convKey, (p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
        setStats((s) => ({ ...s, activeTool: undefined, elapsedMs: Math.round(performance.now() - t0) }))
      }
    },
    [busy, connection, conversations, setConv],
  )

  /**
   * 点模块 = 进入该模块的对话。
   * ★ 不自动加载 preview —— 可视化要等对话触发，否则会盖住真正的对话意图。
   *   想看样例数据，画布空态里有个按钮。
   */
  const handlePickFeature = useCallback((f: FeatureModule | null) => {
    if (f) {
      setActiveFeatureId(f.id)
      setActiveConvKey(f.id)
    } else {
      setActiveFeatureId(null)
      setActiveConvKey(GLOBAL_CONV)
    }
    // ★ 画布跟着模块走：只有声明了 autoOpenCanvas 的展示型模块，点进去才展开（见 lib/types.ts）。
    //   对话型模块（费曼追问这类）点进去就是纯对话；想看画布再点顶栏的按钮。
    //   ⚠️ 代价：没声明 autoOpenCanvas 的模块，作者看自己的 preview 要多点一下顶栏按钮 ——
    //     这一点已写进 README 第一节 / 协作流程 六①。
    setPanelOpen(Boolean(f?.autoOpenCanvas))
    // 换模块时清掉画布，让新模块的对话自己产出
    setArtifact(null)
  }, [])

  /** 手动加载当前模块的样例数据（画布空态里的按钮） */
  const loadPreview = useCallback(() => {
    const f = activeFeature
    if (f && f.preview !== undefined && f.artifactTypes.length > 0) {
      setArtifact({ artifactType: f.artifactTypes[0], data: f.preview })
    }
  }, [activeFeature])

  /** ★ 整页模式：模块自带了 page 组件，主区整个让给它 */
  const PageComp = activeFeature?.page
  const pageMode = Boolean(PageComp)

  // 全屏时画布必须显示，panelOpen 不再参与
  const noArtifact = !panelOpen && !canvasFull

  return (
    <div
      className={[
          'shell',
          pageMode ? 'page-mode' : '',
          !pageMode && noArtifact ? 'no-artifact' : '',
          canvasFull ? 'canvas-full' : '',
          sidebarOpen ? '' : 'sidebar-collapsed',
        ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--artifact-w': `${panelWidth}px`, position: 'relative' } as CSSProperties}
    >
      <Sidebar
        collapsed={!sidebarOpen}
        features={features}
        activeId={activeConvKey}
        onPick={handlePickFeature}
        connection={connection}
      />

      <div className="main">
        {PageComp ? (
          /* ★ 整页模式：模块接管主区。它拿得到 artifact / onSendMessage / onEmitArtifact，
             所以照样能驱动 Agent —— 只是界面完全由它自己决定。 */
          <div className="page-slot">
            <PageComp
              artifact={artifact}
              onSendMessage={send}
              onEmitArtifact={(type, data) => setArtifact({ artifactType: type, data })}
              messages={messages}
              busy={busy}
            />
          </div>
        ) : (
          <>
            <TopBar
          title={activeFeature ? activeFeature.title : '全局对话'}
          theme={theme}
          panelOpen={panelOpen}
          sidebarOpen={sidebarOpen}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <ChatStream messages={messages} />

        <Composer busy={busy} onSend={send} onStop={stop} />

            <StatusBar connection={connection} stats={stats} messageCount={messages.length} />
          </>
        )}
      </div>

      {!pageMode && (panelOpen || canvasFull) && (
        <ArtifactPanel
          feature={activeFeature}
          artifact={artifact}
          isPreview={isPreview}
          onClose={() => setPanelOpen(false)}
          onSendMessage={send}
          onEmitArtifact={(type, data) => setArtifact({ artifactType: type, data })}
          onLoadPreview={loadPreview}
          canvasFull={canvasFull}
          onToggleFullscreen={() => setCanvasFull((v) => !v)}
        />
      )}

      {!pageMode && panelOpen && !canvasFull && wideLayout && (
        <div
          role="separator"
          aria-label="调整可视化区域宽度"
          aria-orientation="vertical"
          aria-valuemin={360}
          aria-valuemax={900}
          aria-valuenow={panelWidth}
          tabIndex={0}
          title="拖动调整画布宽度；方向键微调；双击恢复默认宽度"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setResizingPanel(true)
          }}
          onPointerMove={(event) => {
            if (resizingPanel) resizePanel(event.clientX)
          }}
          onPointerUp={() => setResizingPanel(false)}
          onPointerCancel={() => setResizingPanel(false)}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => setPanelWidth(580)}
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 0,
            bottom: 0,
            right: `${panelWidth - 4}px`,
            width: 8,
            display: 'grid',
            placeItems: 'center',
            cursor: 'col-resize',
            touchAction: 'none',
            outline: 'none',
          }}
        >
          <span style={{ width: resizingPanel ? 3 : 2, height: 44, borderRadius: 99, background: resizingPanel ? 'var(--accent)' : 'var(--border-strong)', boxShadow: resizingPanel ? '0 0 12px var(--accent-border)' : undefined, pointerEvents: 'none' }} />
        </div>
      )}
    </div>
  )
}
