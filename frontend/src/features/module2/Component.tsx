import { useEffect, useMemo, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { isEnabled, setEnabled } from './enable'
import { preview } from './preview'
import {
  KB_CATEGORIES,
  type KbArtifact,
  type KbCategory,
  type KbDocItem,
  type KbEvidenceItem,
} from './types'

const KB_STYLE = `
.kbc-root { font-family: var(--font-sans); font-size: var(--fs-base); color: var(--text); line-height: 1.65; }
.kbc-banner {
  background: color-mix(in srgb, var(--kb-accent) 8%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--kb-accent) 30%, var(--border));
  border-radius: var(--r-md); padding: 10px 14px; margin-bottom: 12px;
}
.kbc-banner-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.kbc-banner b { color: var(--kb-accent); font-size: var(--fs-md); }
.kbc-banner .hint { font-size: var(--fs-xs); color: var(--text-dim); margin-top: 3px; }
.kbc-lock-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); font-weight: 600; color: var(--kb-accent);
  background: color-mix(in srgb, var(--kb-accent) 14%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--kb-accent) 40%, var(--border));
  border-radius: 999px; padding: 2px 10px;
}
.kbc-lock-pill button {
  appearance: none; border: none; background: transparent; cursor: pointer;
  color: var(--text-muted); font-size: var(--fs-xs); padding: 0 2px;
}
.kbc-lock-pill button:hover { color: var(--err); }

.kbc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.kbc-tab {
  appearance: none; border: none; background: transparent; cursor: pointer; font: inherit;
  font-size: var(--fs-base); color: var(--text-muted); padding: 7px 12px;
  border-bottom: 2px solid transparent;
}
.kbc-tab:hover { color: var(--text); }
.kbc-tab.on { color: var(--kb-accent); font-weight: 600; border-bottom-color: var(--kb-accent); }

.kbc-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.kbc-chip {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-xs);
  color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 999px; padding: 4px 11px; transition: all 0.15s;
}
.kbc-chip:hover:not(:disabled) { color: var(--kb-accent); border-color: var(--kb-accent); }
.kbc-chip.on {
  color: var(--kb-accent); font-weight: 600;
  background: color-mix(in srgb, var(--kb-accent) 12%, var(--bg-panel));
  border-color: color-mix(in srgb, var(--kb-accent) 45%, var(--border));
}
.kbc-chip:disabled { opacity: 0.5; cursor: default; }

.kbc-btn {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-sm); font-weight: 600;
  color: var(--kb-accent); background: color-mix(in srgb, var(--kb-accent) 10%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--kb-accent) 35%, var(--border));
  border-radius: var(--r-md); padding: 6px 13px;
}
.kbc-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--kb-accent) 16%, var(--bg-panel)); }
.kbc-btn:disabled { opacity: 0.5; cursor: default; }
.kbc-btn.plain { color: var(--text-dim); background: var(--bg-elevated); border-color: var(--border); font-weight: 500; }
.kbc-btn.plain:hover:not(:disabled) { color: var(--text); border-color: var(--border-strong); }
.kbc-btn.xs { font-size: var(--fs-xs); padding: 3px 9px; border-radius: var(--r-sm); }

.kbc-query-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; margin-bottom: 10px; border-radius: var(--r-sm);
  background: var(--bg-elevated); border: 1px solid var(--border-soft); font-size: var(--fs-sm);
}
.kbc-query-bar .q { font-weight: 600; color: var(--text); }
.kbc-query-bar .n { font-size: var(--fs-xs); color: var(--text-muted); }

.kbc-card {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: 13px 15px; margin-bottom: 10px;
}
.kbc-card.locked {
  border-color: color-mix(in srgb, var(--kb-accent) 50%, var(--border));
  background: color-mix(in srgb, var(--kb-accent) 4%, var(--bg-panel));
}
.kbc-ev-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 7px; }
.kbc-no {
  flex-shrink: 0; min-width: 22px; height: 22px; border-radius: 999px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--fs-xs); font-weight: 700; color: var(--kb-accent);
  background: color-mix(in srgb, var(--kb-accent) 14%, transparent);
}
.kbc-cat {
  font-size: var(--fs-xs); color: var(--kb-accent);
  background: color-mix(in srgb, var(--kb-accent) 10%, transparent);
  border-radius: 999px; padding: 2px 9px; font-weight: 600;
}
.kbc-doc-title { font-weight: 600; font-size: var(--fs-sm); color: var(--text); }
.kbc-sec { font-size: var(--fs-xs); color: var(--text-muted); }
.kbc-score {
  margin-left: auto; font-family: var(--font-mono); font-size: var(--fs-xs);
  color: var(--ok); background: var(--ok-soft); border-radius: 999px; padding: 1px 8px;
}
.kbc-ev-body {
  white-space: pre-wrap; word-break: break-word; font-size: var(--fs-sm); color: var(--text);
  background: var(--bg-elevated); border-left: 3px solid var(--kb-accent);
  border-radius: 0 var(--r-sm) var(--r-sm) 0; padding: 9px 12px; margin: 6px 0 8px;
}
.kbc-ev-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.kbc-cid { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--text-faint); }
.kbc-actions { display: flex; flex-wrap: wrap; gap: 6px; }

.kbc-scope-box {
  background: color-mix(in srgb, var(--kb-accent) 6%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--kb-accent) 35%, var(--border));
  border-radius: var(--r-md); padding: 10px 12px; margin-bottom: 12px;
}
.kbc-scope-box .title { font-size: var(--fs-xs); font-weight: 600; color: var(--kb-accent); margin-bottom: 6px; }
.kbc-input-row { display: flex; gap: 8px; }
.kbc-input, .kbc-textarea, .kbc-select {
  width: 100%; box-sizing: border-box; font: inherit; font-size: var(--fs-sm); color: var(--text);
  background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: 7px 10px; outline: none;
}
.kbc-input:focus, .kbc-textarea:focus, .kbc-select:focus { border-color: var(--kb-accent); }
.kbc-textarea { resize: vertical; min-height: 84px; }

.kbc-doc-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg-panel); margin-bottom: 8px;
}
.kbc-doc-row.locked {
  border-color: color-mix(in srgb, var(--kb-accent) 55%, var(--border));
  background: color-mix(in srgb, var(--kb-accent) 6%, var(--bg-panel));
}
.kbc-doc-main { display: flex; align-items: flex-start; gap: 9px; min-width: 0; flex: 1; }
.kbc-doc-main input[type="checkbox"] { margin-top: 4px; cursor: pointer; accent-color: var(--kb-accent); }
.kbc-doc-meta { min-width: 0; flex: 1; }
.kbc-doc-meta .t { font-size: var(--fs-sm); font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.kbc-doc-meta .s { font-size: var(--fs-xs); color: var(--text-muted); margin-top: 2px; }

.kbc-form label { display: block; font-size: var(--fs-xs); color: var(--text-dim); margin: 8px 0 4px; font-weight: 600; }
.kbc-swatches { display: flex; gap: 8px; align-items: center; }
.kbc-swatch { width: 24px; height: 24px; border-radius: 999px; cursor: pointer; border: 2px solid transparent; }
.kbc-swatch.on { border-color: var(--text); }
`

const ACCENTS = [
  { name: '靛青', v: '#3b6ea8' },
  { name: '墨金', v: '#a4761f' },
  { name: '松绿', v: '#3d7a5a' },
  { name: '朱砂', v: '#a84a3c' },
]
const ACCENT_KEY = 'plugin.knowledgeBase.accent'
const URL_KEY = 'plugin.knowledgeBase.baseUrl'

const QUICK_TOPICS = [
  { label: '金相制样五步流程', query: '金相试样制备的取样、镶嵌、磨光、抛光、浸蚀完整规范是什么？' },
  { label: '45钢回火温度与硬度区间', query: '45钢淬火后低温、中温、高温回火的温度与洛氏硬度区间各是多少？' },
  { label: 'BCC/FCC/HCP配位数与致密度', query: '典型金属晶体结构 BCC、FCC、HCP 的晶胞原子数、配位数与致密度对比' },
  { label: '硬度测定原理对比', query: '布氏硬度、洛氏硬度、维氏硬度的压头类型与适用范围有什么区别？' },
  { label: '热膨胀法测相变点', query: '膨胀系数测定实验中如何从热膨胀曲线确定钢的相变温度 Ac1 与 Ac3？' },
  { label: '硝酸酒精安全与废液规范', query: '金相腐蚀剂硝酸酒精的配制使用安全规定与实验废液处置要求是什么？' },
]

function readAccent(): string {
  try {
    return window.localStorage.getItem(ACCENT_KEY) || ACCENTS[0].v
  } catch {
    return ACCENTS[0].v
  }
}

function resolveBaseUrl(artifactUrl?: string): string {
  try {
    const saved = window.localStorage.getItem(URL_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    // 本地开发：原系统直接开在 :8765；单容器部署：/rag/ 由后端反代到容器内服务
    return import.meta.env.DEV
      ? `http://${window.location.hostname}:8765`
      : `${window.location.origin}/rag/`
  }
  return artifactUrl || 'http://127.0.0.1:8765'
}

function asKbArtifact(raw: unknown): KbArtifact {
  if (!raw || typeof raw !== 'object') return preview
  const r = raw as Partial<KbArtifact>
  return {
    mode: r.mode || 'search',
    query: r.query ?? preview.query,
    answer: r.answer,
    focusedDocIds: Array.isArray(r.focusedDocIds) ? r.focusedDocIds : [],
    evidences:
      Array.isArray(r.evidences) && r.evidences.length > 0
        ? r.evidences
        : r.mode === 'search'
          ? []
          : preview.evidences,
    documents:
      Array.isArray(r.documents) && r.documents.length > 0 ? r.documents : preview.documents,
    totalDocs: typeof r.totalDocs === 'number' && r.totalDocs > 0 ? r.totalDocs : preview.documents.length,
    baseUrl: r.baseUrl || preview.baseUrl,
    note: r.note,
  }
}

export function Component({ artifact, onSendMessage, busy }: FeatureProps) {
  const [enabled, setEnabledState] = useState(isEnabled)
  const [accent, setAccent] = useState(readAccent)
  const [tab, setTab] = useState<'evidence' | 'docs' | 'admin'>('evidence')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [catFilter, setCatFilter] = useState<'全部' | KbCategory>('全部')
  const [docSearch, setDocSearch] = useState('')
  const [scopedQuery, setScopedQuery] = useState('')

  // 补充资料入库表单
  const [noteTitle, setNoteTitle] = useState('')
  const [noteSource, setNoteSource] = useState('课程讲义补充')
  const [noteTags, setNoteTags] = useState('实验笔记,课程补充')
  const [noteContent, setNoteContent] = useState('')

  const data = useMemo(() => asKbArtifact(artifact?.data), [artifact?.data])
  const fullUrl = resolveBaseUrl(data.baseUrl)

  // 当后端返回新的检索证据时，自动切到「证据溯源」tab 展示
  useEffect(() => {
    if (!artifact?.data) return
    const r = artifact.data as Partial<KbArtifact>
    if (r.mode === 'search' || r.mode === 'ask' || r.mode === 'get') {
      setTab('evidence')
    } else if (r.mode === 'list') {
      setTab('docs')
    }
  }, [artifact?.data])

  const pickAccent = (v: string) => {
    setAccent(v)
    try {
      window.localStorage.setItem(ACCENT_KEY, v)
    } catch {
      /* ignore */
    }
  }

  const toggleDocLock = (id: string) => {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const lockedDocs = useMemo(
    () => data.documents.filter((d) => selectedDocIds.includes(d.id)),
    [data.documents, selectedDocIds],
  )

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase()
    return data.documents.filter((d) => {
      if (catFilter !== '全部' && d.category !== catFilter) return false
      if (q && !d.title.toLowerCase().includes(q) && !d.source.toLowerCase().includes(q)) return false
      return true
    })
  }, [data.documents, catFilter, docSearch])

  const catCounts = useMemo(() => {
    const map: Record<string, number> = { 全部: data.documents.length }
    for (const c of KB_CATEGORIES) map[c] = 0
    for (const d of data.documents) map[d.category] = (map[d.category] ?? 0) + 1
    return map
  }, [data.documents])

  const sendScopedSearch = (q: string, docIds: string[] = selectedDocIds) => {
    const trimmed = q.trim()
    if (!trimmed || busy) return
    if (docIds.length > 0) {
      const titles = data.documents
        .filter((d) => docIds.includes(d.id))
        .map((d) => `《${d.title}》`)
        .join('、')
      onSendMessage(
        `请调用 materials_rag（action="search", documentIds=${JSON.stringify(docIds)}）限定在${titles}中检索：「${trimmed}」，将原文证据推送到知识库画布并标注出处作答。`,
      )
    } else {
      onSendMessage(
        `请调用 materials_rag（action="search"）在课程知识库中检索：「${trimmed}」，将命中的原文证据推送到画布并逐条依据证据作答。`,
      )
    }
  }

  const toggleExpand = (chunkId: string) => {
    setExpandedIds((p) => ({ ...p, [chunkId]: !p[chunkId] }))
  }

  const submitAddNote = () => {
    const t = noteTitle.trim()
    const c = noteContent.trim()
    if (!t || !c || busy) return
    onSendMessage(
      `请调用 materials_rag（action="add_text", title=${JSON.stringify(t)}, source=${JSON.stringify(noteSource)}, tags=${JSON.stringify(noteTags)}, content=${JSON.stringify(c)}）将这段课程补充笔记入库。`,
    )
    setNoteTitle('')
    setNoteContent('')
  }

  if (!enabled) {
    return (
      <div className="kbc-root" style={{ ['--kb-accent' as string]: accent }}>
        <style>{KB_STYLE}</style>
        <div className="kbc-card" style={{ textAlign: 'center', padding: '24px 18px' }}>
          <h3 style={{ margin: '0 0 6px' }}>插件已禁用</h3>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', margin: '0 0 12px' }}>
            「知识库RAG」画布当前处于关闭状态，启用后即可查看原文证据溯源与 15 份课程资料精读。
          </p>
          <button
            className="kbc-btn"
            onClick={() => {
              setEnabled(true)
              setEnabledState(true)
            }}
          >
            启用插件
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="kbc-root" style={{ ['--kb-accent' as string]: accent }}>
      <style>{KB_STYLE}</style>

      {/* 顶部身份横幅（与错题集、费曼同款工作台风格） */}
      <div className="kbc-banner">
        <div className="kbc-banner-top">
          <b>课程文献与证据溯源画布</b>
          {lockedDocs.length > 0 && (
            <span className="kbc-lock-pill" title="当前提问将限定在所选资料内检索">
              🎯 已锁定 {lockedDocs.length} 份资料定向精读
              <button onClick={() => setSelectedDocIds([])} title="取消锁定">
                ×
              </button>
            </span>
          )}
        </div>
        <div className="hint">
          封闭课程语料（教材 1 · 课程讲义 6 · 教学大纲 2 · 劳动教育 6） · 每条结论对照原文段落与匹配度，可锁定指定讲义定向追问
        </div>
      </div>

      {/* 三栏画布内 Tab 导航 */}
      <div className="kbc-tabs">
        <button
          className={`kbc-tab ${tab === 'evidence' ? 'on' : ''}`}
          onClick={() => setTab('evidence')}
        >
          证据溯源（{data.evidences.length}）
        </button>
        <button
          className={`kbc-tab ${tab === 'docs' ? 'on' : ''}`}
          onClick={() => setTab('docs')}
        >
          课程资料库（{data.documents.length}）
        </button>
        <button
          className={`kbc-tab ${tab === 'admin' ? 'on' : ''}`}
          onClick={() => setTab('admin')}
        >
          补充资料与后台
        </button>
      </div>

      {/* ─────────────── Tab 1：证据溯源卡片 ─────────────── */}
      {tab === 'evidence' && (
        <div>
          <div className="kbc-toolbar">
            {QUICK_TOPICS.map((item) => (
              <button
                key={item.label}
                className="kbc-chip"
                disabled={busy}
                onClick={() => sendScopedSearch(item.query)}
                title={
                  lockedDocs.length > 0
                    ? `在已锁定的 ${lockedDocs.length} 份资料中检索「${item.label}」`
                    : `检索「${item.label}」的课程原文证据`
                }
              >
                {lockedDocs.length > 0 ? '🎯 ' : '🔍 '}
                {item.label}
              </button>
            ))}
          </div>

          <div className="kbc-query-bar">
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>当前溯源主题：</span>
              <span className="q">{data.query || '课程核心实验规范'}</span>
            </div>
            <span className="n">
              {data.note || `共命中 ${data.evidences.length} 段课程原文`}
            </span>
          </div>

          {data.evidences.length === 0 ? (
            <div className="kbc-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>未命中匹配的课程原文段落</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 12 }}>
                本知识库严格限定在《材料科学基础实验》7 个实验与劳动教育范围内；请换个课程关键词或点上方快捷主题检索。
              </div>
              <button
                className="kbc-btn plain xs"
                disabled={busy}
                onClick={() => sendScopedSearch('金相试样制备的完整流程是什么？', [])}
              >
                恢复示例证据
              </button>
            </div>
          ) : (
            data.evidences.map((ev: KbEvidenceItem, idx: number) => {
              const expanded = Boolean(expandedIds[ev.chunkId])
              const hasMore = ev.content.length > ev.snippet.length
              const pct = ev.score > 0 ? `${Math.round(Math.min(1, ev.score) * 100)}%` : null
              const isDocLocked = Boolean(ev.documentId && selectedDocIds.includes(ev.documentId))
              return (
                <div key={ev.chunkId || idx} className={`kbc-card ${isDocLocked ? 'locked' : ''}`}>
                  <div className="kbc-ev-head">
                    <span className="kbc-no">{idx + 1}</span>
                    <span className="kbc-cat">{ev.category}</span>
                    <span className="kbc-doc-title">《{ev.documentTitle}》</span>
                    {ev.section && <span className="kbc-sec">· {ev.section}</span>}
                    {pct && <span className="kbc-score">匹配度 {pct}</span>}
                  </div>

                  <div className="kbc-ev-body">
                    {expanded || !hasMore ? ev.content : ev.snippet}
                  </div>

                  <div className="kbc-ev-foot">
                    <span className="kbc-cid" title="段落溯源 ID（可用于核查原文）">
                      出处标识：{ev.chunkId || '—'}
                    </span>
                    <div className="kbc-actions">
                      {hasMore && (
                        <button
                          className="kbc-btn plain xs"
                          onClick={() => toggleExpand(ev.chunkId)}
                        >
                          {expanded ? '收起原文' : '展开完整段落'}
                        </button>
                      )}
                      {ev.chunkId && (
                        <button
                          className="kbc-btn plain xs"
                          disabled={busy}
                          onClick={() =>
                            onSendMessage(
                              `请调用 materials_rag（action="get", chunkId="${ev.chunkId}"）调阅《${ev.documentTitle}》该段完整原文，并结合实验操作要点为我详细解读。`,
                            )
                          }
                        >
                          调阅解读
                        </button>
                      )}
                      <button
                        className="kbc-btn xs"
                        disabled={busy}
                        onClick={() =>
                          onSendMessage(
                            `针对《${ev.documentTitle}》（${ev.section || '正文'}）这段原文：「${ev.snippet.slice(0, 90)}」，请结合课程实验要求，深入讲解背后的原理与常见操作误区。`,
                          )
                        }
                      >
                        围绕此段追问
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ─────────────── Tab 2：15 篇课程资料分组精读与定向提问 ─────────────── */}
      {tab === 'docs' && (
        <div>
          {/* 定向检索盒：区别于全局对话的独家能力 */}
          <div className="kbc-scope-box">
            <div className="title">
              {lockedDocs.length > 0
                ? `🎯 定向检索范围（已选 ${lockedDocs.length} 份）：${lockedDocs.map((d) => `《${d.title}》`).join('、')}`
                : '💡 勾选下方 1~3 份讲义即可「锁定范围定向提问」（避免跨实验干扰，全局对话无此功能）'}
            </div>
            <div className="kbc-input-row">
              <input
                className="kbc-input"
                value={scopedQuery}
                onChange={(e) => setScopedQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && scopedQuery.trim()) {
                    sendScopedSearch(scopedQuery)
                    setScopedQuery('')
                  }
                }}
                placeholder={
                  lockedDocs.length > 0
                    ? `仅在已勾选的 ${lockedDocs.length} 份资料中检索问题…（Enter 发送）`
                    : '输入问题检索全部 15 份课程资料，或先勾选下方讲义定向检索…'
                }
                disabled={busy}
              />
              <button
                className="kbc-btn"
                disabled={busy || !scopedQuery.trim()}
                onClick={() => {
                  sendScopedSearch(scopedQuery)
                  setScopedQuery('')
                }}
              >
                {lockedDocs.length > 0 ? '定向检索' : '检索证据'}
              </button>
              {lockedDocs.length >= 2 && (
                <button
                  className="kbc-btn plain"
                  disabled={busy}
                  onClick={() => {
                    const titles = lockedDocs.map((d) => `《${d.title}》`).join('与')
                    onSendMessage(
                      `请调用 materials_rag（action="search", documentIds=${JSON.stringify(selectedDocIds)}, query="实验目的 原理 操作步骤 注意事项"）检索${titles}的原文要点，对比梳理它们的实验原理、工艺参数与关键异同。`,
                    )
                  }}
                >
                  对比所选资料
                </button>
              )}
            </div>
          </div>

          {/* 分类筛选与本地搜索 */}
          <div className="kbc-toolbar" style={{ alignItems: 'center' }}>
            {(['全部', ...KB_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                className={`kbc-chip ${catFilter === cat ? 'on' : ''}`}
                onClick={() => setCatFilter(cat)}
              >
                {cat}（{catCounts[cat] ?? 0}）
              </button>
            ))}
            <input
              className="kbc-input"
              style={{ width: 170, marginLeft: 'auto', padding: '4px 9px', fontSize: 'var(--fs-xs)' }}
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="筛选资料标题…"
            />
          </div>

          {filteredDocs.map((doc: KbDocItem) => {
            const locked = selectedDocIds.includes(doc.id)
            return (
              <div key={doc.id} className={`kbc-doc-row ${locked ? 'locked' : ''}`}>
                <label className="kbc-doc-main" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={locked}
                    onChange={() => toggleDocLock(doc.id)}
                  />
                  <div className="kbc-doc-meta">
                    <div className="t">
                      <span className="kbc-cat">{doc.category}</span>
                      <span>{doc.title}</span>
                    </div>
                    <div className="s">{doc.source}</div>
                  </div>
                </label>
                <div className="kbc-actions" style={{ flexShrink: 0 }}>
                  <button
                    className="kbc-btn plain xs"
                    disabled={busy}
                    onClick={() =>
                      onSendMessage(
                        `请调用 materials_rag（action="search", documentIds=["${doc.id}"], query="${doc.title} 核心内容 实验原理 操作要点"）提炼《${doc.title}》的核心原文段落并推送到画布。`,
                      )
                    }
                  >
                    提炼本篇要点
                  </button>
                  <button
                    className={`kbc-btn xs ${locked ? '' : 'plain'}`}
                    onClick={() => toggleDocLock(doc.id)}
                  >
                    {locked ? '已锁定' : '🎯 只问这篇'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─────────────── Tab 3：补充资料入库与后台管理 ─────────────── */}
      {tab === 'admin' && (
        <div>
          <div className="kbc-card kbc-form">
            <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-md)' }}>录入实验笔记 / 补充资料</h3>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              通过 <code>materials_rag(action=&quot;add_text&quot;)</code> 将课堂实验记录或教师补充讲义直接切块并建立向量索引。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label>资料标题 *</label>
                <input
                  className="kbc-input"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="例如：课程讲义·45钢淬火缺陷补充说明"
                />
              </div>
              <div>
                <label>归属来源</label>
                <select
                  className="kbc-select"
                  value={noteSource}
                  onChange={(e) => setNoteSource(e.target.value)}
                >
                  <option value="课程讲义补充">课程讲义补充</option>
                  <option value="实验课堂笔记">实验课堂笔记</option>
                  <option value="劳动教育补充">劳动教育补充</option>
                </select>
              </div>
            </div>
            <label>检索标签（逗号分隔）</label>
            <input
              className="kbc-input"
              value={noteTags}
              onChange={(e) => setNoteTags(e.target.value)}
              placeholder="例如：45钢,热处理,金相"
            />
            <label>正文内容 *</label>
            <textarea
              className="kbc-textarea"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="粘贴需要加入课程知识库的实验补充段落或课堂重点笔记…"
            />
            <div className="kbc-actions" style={{ marginTop: 10 }}>
              <button
                className="kbc-btn"
                disabled={busy || !noteTitle.trim() || !noteContent.trim()}
                onClick={submitAddNote}
              >
                提交入库并建索引
              </button>
            </div>
          </div>

          <div className="kbc-card">
            <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-md)' }}>底层混合检索引擎与完整后台</h3>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' }}>
              本模块后端连接项目内置的「材料科学RAG系统」（语义向量 + BM25 混合检索）。如需上传 PDF 原件、查看分块细节或调整检索超参数，可在新窗口打开原系统后台。
            </p>
            <div className="kbc-actions">
              <button
                className="kbc-btn"
                onClick={() => window.open(fullUrl, '_blank')}
                title="在新窗口打开 8765 完整管理界面"
              >
                新窗口打开 RAG 后台（完整版）
              </button>
              <button
                className="kbc-btn plain"
                disabled={busy}
                onClick={() =>
                  onSendMessage('请调用 materials_rag 的 status 与 list 动作，检查知识库在线状态并刷新全部课程资料列表。')
                }
              >
                同步知识库状态
              </button>
            </div>
          </div>

          <div className="kbc-card">
            <h3 style={{ margin: '0 0 8px', fontSize: 'var(--fs-md)' }}>画布外观与插件开关</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div className="kbc-swatches">
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' }}>主题色：</span>
                {ACCENTS.map((a) => (
                  <button
                    key={a.v}
                    className={`kbc-swatch ${accent === a.v ? 'on' : ''}`}
                    style={{ background: a.v }}
                    title={a.name}
                    onClick={() => pickAccent(a.v)}
                  />
                ))}
              </div>
              <button
                className="kbc-btn plain xs"
                onClick={() => {
                  setEnabled(false)
                  setEnabledState(false)
                }}
              >
                临时禁用本模块画布
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Component
