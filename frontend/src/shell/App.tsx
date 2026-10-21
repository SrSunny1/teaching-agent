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

/**
 * 模块导航的别名表。
 *
 * 用户在全局对话里说「进入 3D 可视化」「打开错题集」「用知识库查一下」时，
 * 壳直接把对话切到对应模块，不把这句话发给模型。模块自己声明的 `title` 也会参与匹配。
 */
const MODULE_ALIASES: Record<string, string[]> = {
  visual3d: ['3d', '3d可视化', '可视化', '晶体结构', '晶胞', '三维', '晶体'],
  feynman: ['费曼', '费曼追问', '追问', '费曼学习法'],
  mistakeBook: ['错题', '错题集', '错题本', '材料科学错题集'],
  knowledgeBase: ['知识库', 'rag', '材料科学rag', '构建你的知识库'],
  module4: ['金相', '金相组织', '组织辨析', '金相组织辨析', '微观组织', '金相分析'],
  module1: ['模块1', '模块一'],
  module2: ['模块2', '模块二'],
}

const NAV_VERBS = [
  '进入', '打开', '切换到', '切到', '我想用', '我要用', '帮我打开', '帮我进入',
  '帮我切到', '请打开', '请进入', '去', '看看', '看', '我想看', '使用', '用',
]
const BACK_VERBS = ['退出', '回到', '返回', '离开']

const normalizeNav = (text: string) => text.toLowerCase().replace(/[\s，。！？、：:；;,.!?]/g, '')

/**
 * 从一句话里识别「进入某个模块」的意图。
 *
 * 只有两种情况算导航：
 *   1. 句子以模块名/别名开头（「知识库里有哪些文献」）；
 *   2. 句子以导航动词开头（「进入 3D 可视化」「用错题集分析这道题」）。
 * 其他情况（「什么是错题集」）照常发给模型，由 artifact 自动跳转兜底。
 */
function detectModuleIntent(text: string): { moduleId: string; rest: string } | null {
  const norm = normalizeNav(text)
  if (!norm) return null

  if (BACK_VERBS.some((v) => norm.startsWith(normalizeNav(v)))) {
    return { moduleId: GLOBAL_CONV, rest: '' }
  }

  let best: { id: string; alias: string } | null = null
  for (const f of features) {
    const aliases = [f.title, f.id, ...(MODULE_ALIASES[f.id] ?? [])]
    for (const alias of aliases) {
      const a = normalizeNav(alias)
      if (!a) continue
      if (norm.includes(a) && (!best || a.length > best.alias.length)) best = { id: f.id, alias: a }
    }
  }
  if (!best) return null

  const startsWithVerb = NAV_VERBS.some((v) => norm.startsWith(normalizeNav(v)))
  if (!startsWithVerb && !norm.startsWith(best.alias)) return null

  // 把导航动词和模块名从原句里剥掉，剩下的作为模块里的第一句话。
  // 只剥「最长的一个」模块名候选，避免把「晶体缺陷」里的「晶体」也误删。
  let rest = text
  for (const v of [...NAV_VERBS, ...BACK_VERBS]) {
    rest = rest.replace(new RegExp(`^\\s*${v}\\s*`), '')
  }
  const candidates = [featureById(best.id)?.title, ...(MODULE_ALIASES[best.id] ?? [])]
    .filter((item): item is string => Boolean(item))
    .sort((a, b) => b.length - a.length)
  const matched = candidates.find((item) =>
    new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(rest),
  )
  if (matched) rest = rest.replace(new RegExp(matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  rest = rest.replace(/^[\s，。！？、：:；;,]*模块[\s，。！？、：:；;,]*/, '').trim()
  rest = rest.replace(/^[\s，。！？、：:；;,]+/, '').trim()
  return { moduleId: best.id, rest }
}


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
  /** 后端实际在用的模型名，给顶栏展示。空字符串 = 还没探测到 */
  const [modelName, setModelName] = useState('')
  const [stats, setStats] = useState<SessionStats>({})
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const messages = conversations[activeConvKey] ?? []
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages

  /** 当前对话的 key —— 发送时捕获它，保证回复写回原来的对话，而不是写到用户已切走的那条 */
  const convKeyRef = useRef<string>(GLOBAL_CONV)
  convKeyRef.current = activeConvKey

  /**
   * 本轮流式回复当前写到哪个对话 key。
   *
   * 正常情况下就是发送时的 convKey。但在全局对话里触发了某个模块的 artifact 时，
   * 我们会把这条对话整体搬进该模块、并自动切过去；后续 token 必须继续写到新 key，
   * 否则用户会看到模块对话一直空着、答案还在全局对话里流。
   */
  const streamConvKeyRef = useRef<string>(GLOBAL_CONV)

  const setConv = useCallback((key: string, updater: (prev: Message[]) => Message[]) => {
    setConversations((prev) => ({ ...prev, [key]: updater(prev[key] ?? []) }))
  }, [])

  /* ── 探测后端，决定走真实流还是 mock ── */
  useEffect(() => {
    let alive = true
    probeBackend().then(({ ok, hasKey, model }) => {
      if (!alive) return
      setConnection(ok && hasKey ? 'live' : 'mock')
      // 顶栏芯片显示后端**实际**用的模型 —— 以前这里是写死的字符串，
      // 换了 .env 界面始终显示旧名字，看起来像配置没生效。
      setModelName(model ?? '')
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
    async (text: string, image?: string) => {
      const trimmed = text.trim()
      // 只发一张图、不打字也是合法的（「这张金相有什么缺陷？」可以省略）
      if ((!trimmed && !image) || busy) return

      // ★ 模块导航意图：先切对话，再把剩下的内容作为该模块的第一句话发出去。
      //   例如「进入错题集，帮我分析第三题」→ 切到错题集，发送「帮我分析第三题」。
      let content = trimmed
      if (!image) {
        const intent = detectModuleIntent(trimmed)
        if (intent) {
          const targetId = intent.moduleId
          const target = targetId === GLOBAL_CONV ? null : featureById(targetId)
          const prevKey = convKeyRef.current
          setActiveFeatureId(target ? target.id : null)
          setActiveConvKey(targetId)
          convKeyRef.current = targetId
          setPanelOpen(Boolean(target?.autoOpenCanvas))
          if (prevKey !== targetId) setArtifact(null)
          if (!intent.rest) return
          content = intent.rest
        }
      }

      const q = content.trim()
      if (!q && !image) return

      const convKey = convKeyRef.current
      streamConvKeyRef.current = convKey

      /*
       * ★ 模块身份取「发送时所在对话」。
       *   全局对话里如果触发了某个模块的 artifact，本轮仍按全局身份作答；
       *   随后 UI 会自动切到该模块的对话（见下面 artifact 分支），下一轮就带模块 persona 了。
       */
      const mod = featureById(convKey)
      if (mod?.answerFromSources) setCanvasFull(false)
      const featureCtx = mod
        ? { id: mod.id, title: mod.title, persona: mod.persona }
        : undefined

      const userId = uid()
      const asstId = uid()
      const history: Message[] = [
        ...(conversations[convKey] ?? []),
        { id: userId, role: 'user', content: q, image },
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
          const owner = featureByArtifact(e.artifactType)
          // ★ 没有模块认领的类型（knowledge / heatTreatment / micrograph / graph）不进画布。
          //   否则同一轮里 Agent 先 load_structure 再 search_knowledge 时，
          //   后到的 knowledge 会把 visual3d 的原子数据覆盖掉，画布就成了
          //   「3D 模块的组件 + 检索结果的 data」→ 组件读不到 atoms，显示空白。
          if (!owner) return

          setArtifact({ artifactType: e.artifactType, data: e.data })
          setActiveFeatureId(owner.id)

          // ★ 全局对话里触发了模块产物：把整条对话搬进该模块，并自动切过去。
          //   后续 token 继续写到新 key（streamConvKeyRef），所以答案不会留在全局对话里。
          //   只有用户此刻仍停留在全局对话才搬；如果他已经手动切走，不要把人拽回来。
          const fromGlobal =
            streamConvKeyRef.current === GLOBAL_CONV && convKeyRef.current === GLOBAL_CONV
          if (fromGlobal && owner.id !== GLOBAL_CONV) {
            const target = owner.id
            setConversations((prev) => {
              const moved = prev[GLOBAL_CONV] ?? []
              if (moved.length === 0) return prev
              // 模块里可能已经有历史对话：把全局这条接在后面，别覆盖掉。
              return { ...prev, [target]: [...(prev[target] ?? []), ...moved], [GLOBAL_CONV]: [] }
            })
            streamConvKeyRef.current = target
            convKeyRef.current = target
            setActiveConvKey(target)
            // 与左栏点模块一致：展示型模块自动展开画布，对话型模块保持收起。
            setPanelOpen(Boolean(owner.autoOpenCanvas))
          } else if (owner.autoOpenCanvas) {
            // 已经在模块对话里：只按 autoOpenCanvas 决定要不要抢屏。
            setPanelOpen(true)
          }
          return
        }
        if (e.type === 'done') {
          setConv(streamConvKeyRef.current, (p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
          return
        }
        if (e.type === 'tool_call') activeTool = e.label
        if (e.type === 'tool_result') activeTool = undefined
        if (e.type === 'token') tokenCount += e.text.length

        setConv(streamConvKeyRef.current, (p) => patchMsg(p, asstId, (m) => mergeEvent(m, e)))
        setStats({
          activeTool,
          elapsedMs: Math.round(performance.now() - t0),
          tokens: Math.round(tokenCount / 1.6),
        })
      }

      try {
        const local = mod?.answerFromSources?.(q, connection === 'mock')
        if (local) {
          const lookupId = uid()
          onEvent({ type: 'tool_call', id: lookupId, name: 'local_source_lookup', label: '本地资料检索（非模型调用）', args: { query: q } })
          onEvent({ type: 'tool_result', id: lookupId, summary: local.summary, detail: local.content })
          onEvent({ type: 'token', text: local.content })
          onEvent({ type: 'done' })
        } else if (connection === 'mock') {
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
          setConv(streamConvKeyRef.current, (p) =>
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
        setConv(streamConvKeyRef.current, (p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
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
    // 这一跳要切到哪个对话。跟 Sidebar 的高亮（activeId={activeConvKey}）用的是同一个值。
    const nextKey = f ? f.id : GLOBAL_CONV

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
    // ★ 只有**真的换了对话**才清画布，让新模块的对话自己产出。
    //   以前这里是无条件 setArtifact(null)，于是重复点左栏里已经高亮的那一项
    //   也会把刚产出的结果抹掉 —— 而费曼追问这类对话型模块 autoOpenCanvas 是 false、
    //   画布本来就不展开，学生「点一下模块想看看结果」看到的是一片空白，像是坏了。
    //   （其余行为刻意保持不变：比如展示型模块靠这一跳重新展开画布。）
    if (nextKey !== activeConvKey) setArtifact(null)
  }, [activeConvKey])

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
          model={modelName}
          panelOpen={panelOpen}
          sidebarOpen={sidebarOpen}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <ChatStream messages={messages} onSend={send} />

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
