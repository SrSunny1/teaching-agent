import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [messages, setMessages] = useState<Message[]>([])
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [stats, setStats] = useState<SessionStats>({})
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const messagesRef = useRef<Message[]>([])
  const abortRef = useRef<AbortController | null>(null)

  messagesRef.current = messages

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

  /* ── 当前画布上该显示哪个功能 ── */
  const activeFeature: FeatureModule | undefined = useMemo(() => {
    if (activeFeatureId) {
      const f = featureById(activeFeatureId)
      if (f) return f
    }
    return artifact ? featureByArtifact(artifact.artifactType) : undefined
  }, [activeFeatureId, artifact])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setMessages((p) => p.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }, [])

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return

      const userId = uid()
      const asstId = uid()
      const history: Message[] = [
        ...messagesRef.current,
        { id: userId, role: 'user', content: q },
      ]
      setMessages([...history, { id: asstId, role: 'assistant', content: '', streaming: true }])
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
          if (owner) setActiveFeatureId(owner.id)
          setPanelOpen(true)
          return
        }
        if (e.type === 'done') {
          setMessages((p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
          return
        }
        if (e.type === 'tool_call') activeTool = e.label
        if (e.type === 'tool_result') activeTool = undefined
        if (e.type === 'token') tokenCount += e.text.length

        setMessages((p) => patchMsg(p, asstId, (m) => mergeEvent(m, e)))
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
            onEvent,
            signal: ctrl.signal,
          })
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          const message = err instanceof Error ? err.message : String(err)
          onEvent({ type: 'error', message })
          setMessages((p) =>
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
        setMessages((p) => patchMsg(p, asstId, (m) => ({ ...m, streaming: false })))
        setStats((s) => ({ ...s, activeTool: undefined, elapsedMs: Math.round(performance.now() - t0) }))
      }
    },
    [busy, connection],
  )

  const handlePickFeature = useCallback((f: FeatureModule) => {
    setActiveFeatureId(f.id)
    setPanelOpen(true)
    setArtifact((prev) => {
      // 当前产物本来就归这个功能管 → 保留，别把真实数据冲掉
      if (prev && f.artifactTypes.includes(prev.artifactType)) return prev
      // 否则用该功能的样例数据顶上，让 owner 能立刻看到自己的组件
      if (f.preview !== undefined && f.artifactTypes.length > 0) {
        return { artifactType: f.artifactTypes[0], data: f.preview }
      }
      return null
    })
  }, [])

  // 画布上现在展示的是样例数据还是 Agent 真实产出？
  // 用引用相等判断：真实 artifact 事件带的是新对象，不会等于 preview 常量。
  const isPreview = useMemo(
    () => Boolean(artifact && activeFeature?.preview && artifact.data === activeFeature.preview),
    [artifact, activeFeature],
  )

  const noArtifact = !panelOpen

  return (
    <div
      className={[
        'shell',
        noArtifact ? 'no-artifact' : '',
        sidebarOpen ? '' : 'sidebar-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Sidebar
        collapsed={!sidebarOpen}
        features={features}
        activeId={activeFeature?.id ?? null}
        onPick={handlePickFeature}
        connection={connection}
      />

      <div className="main">
        <TopBar
          title={activeFeature ? activeFeature.title : '材料物理实验教学 Agent'}
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
      </div>

      {panelOpen && (
        <ArtifactPanel
          feature={activeFeature}
          artifact={artifact}
          isPreview={isPreview}
          onClose={() => setPanelOpen(false)}
          onSendMessage={send}
          onEmitArtifact={(type, data) => setArtifact({ artifactType: type, data })}
        />
      )}
    </div>
  )
}
