import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { QuestionNode } from './graphData'
import {
  BLOOM_COLOR,
  QUESTION_EDGES,
  QUESTION_NODES,
  TIER_DESC,
  TIER_STYLE,
  nodeById,
  questionById,
  questionPath,
} from './graphData'

interface Props {
  focusId?: string | null
  /** 点击知识点 chip → 切到知识图谱并聚焦 */
  onJumpKnowledge: (id: string) => void
  onSend: (text: string) => void
}

interface Anchors {
  /** 卡片左缘中点（第二、三层级的入口） */
  left: { x: number; y: number }
  /** 卡片右缘中点（第一、二层级的出口） */
  right: { x: number; y: number }
}

const STYLE = `
.mg-qg { position: absolute; inset: 0; overflow: auto; color: var(--text, #eaf1ff);
  background:
    radial-gradient(900px 520px at 18% 0%, rgba(99,102,241,.10), transparent 62%),
    radial-gradient(820px 520px at 82% 8%, rgba(20,184,166,.08), transparent 62%),
    radial-gradient(760px 520px at 50% 100%, rgba(245,158,11,.07), transparent 60%),
    var(--bg, #0b1020);
}
.mg-qg-inner { position: relative; display: grid; grid-template-columns: repeat(3, minmax(280px, 1fr));
  gap: 30px; padding: 14px 18px 30px; min-height: 100%; align-items: start; }

.mg-col-head { margin: 2px 2px 12px; }
.mg-col-head .line { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 650; }
.mg-col-head .line span.count { font-size: 11px; color: var(--text-faint, #6d80a6); font-weight: 400; }
.mg-col-head .desc { margin-top: 3px; font-size: 10.5px; color: var(--text-faint, #6d80a6); }
.mg-col-head .bar { margin-top: 8px; height: 2px; border-radius: 2px; opacity: .55; }
.mg-col { position: relative; display: flex; flex-direction: column; gap: 13px; }

.mg-qcard { position: relative; border-radius: 13px; padding: 12px 15px 12px 17px; cursor: pointer;
  background: var(--bg-panel, #111a30); border: 1px solid var(--border, rgba(120,150,220,.28));
  transition: opacity .2s ease, box-shadow .2s ease, transform .2s ease; overflow: visible; }
.mg-qcard::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px;
  border-radius: 3px; background: var(--mg-accent); opacity: .75; }
.mg-qcard:hover { transform: translateY(-1.5px); box-shadow: 0 8px 22px rgba(0,0,0,.22); }
.mg-qcard.sel { box-shadow: 0 0 0 1.5px var(--mg-accent), 0 12px 30px rgba(0,0,0,.3); }
.mg-qcard.dim { opacity: .24; }
.mg-qcard .top { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; }
.mg-qcard .idx { font: 600 10px/1 var(--font-mono, monospace); color: var(--mg-accent);
  background: color-mix(in srgb, var(--mg-accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--mg-accent) 38%, transparent);
  padding: 2px 5px; border-radius: 5px; }
.mg-qcard .tier { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--mg-accent); }
.mg-qcard .detail { margin-left: auto; font-size: 10.5px; color: var(--text-faint, #6d80a6);
  background: none; border: 0; cursor: pointer; padding: 0; }
.mg-qcard .detail:hover { color: var(--mg-accent); }
.mg-qcard .title { font-size: 12.8px; line-height: 1.62; margin-bottom: 8px; }
.mg-qcard .foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mg-qcard .bloom { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 5px;
  border: 1px solid currentColor; }
.mg-qcard .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.mg-qchip { font-size: 10.5px; padding: 2px 7px; border-radius: 6px; cursor: pointer;
  background: rgba(125,165,255,.08); border: 1px solid rgba(125,165,255,.22); color: var(--text-dim, #b9c7e6); }
.mg-qchip:hover { background: rgba(125,165,255,.18); color: var(--text, #eaf1ff); }
.mg-anchor { position: absolute; width: 19px; height: 19px; border-radius: 50%; transform: translateY(-50%);
  display: grid; place-items: center; font: 9.5px/1 var(--font-mono, monospace); cursor: pointer; z-index: 3;
  background: var(--bg, #0b1020); border: 1.5px solid var(--mg-accent); color: var(--mg-accent);
  transition: box-shadow .18s ease; }
.mg-anchor:hover { box-shadow: 0 0 12px var(--mg-accent); }
.mg-anchor.r { right: -10px; }
.mg-anchor.l { left: -10px; }

.mg-qsvg { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.mg-flow { animation: mg-dash 1.1s linear infinite; }
@keyframes mg-dash { to { stroke-dashoffset: -32 } }

.mg-qbar { position: sticky; top: 0; z-index: 9; display: flex; align-items: center; gap: 8px;
  padding: 7px 18px; font-size: 10.5px; color: var(--text-faint, #6d80a6);
  background: color-mix(in srgb, var(--bg, #0b1020) 90%, transparent);
  backdrop-filter: blur(6px); border-bottom: 1px solid var(--border-soft, rgba(120,150,220,.14)); }
.mg-qbar button { margin-left: auto; font-size: 10.5px; padding: 3px 10px; border-radius: 99px; cursor: pointer;
  background: var(--bg-panel, rgba(16,22,40,.85)); color: var(--text-dim, #b9c7e6);
  border: 1px solid var(--border, rgba(120,150,220,.28)); }
.mg-qbar button:hover { color: var(--text, #eaf1ff); border-color: rgba(125,165,255,.55); }

.mg-drawer { position: absolute; right: 12px; top: 46px; bottom: 12px; width: 344px; z-index: 12;
  overflow-y: auto; border-radius: 14px; padding: 15px 15px 18px; background: var(--bg-panel, #101a30);
  border: 1px solid var(--border, rgba(120,150,220,.32)); box-shadow: 0 16px 46px rgba(0,0,0,.4); }
.mg-drawer h4 { margin: 0 0 8px; font-size: 13.5px; line-height: 1.6; padding-right: 24px; }
.mg-drawer .close { position: absolute; right: 10px; top: 10px; width: 22px; height: 22px;
  border-radius: 7px; border: 1px solid var(--border, rgba(120,150,220,.3)); background: none;
  color: var(--text-dim, #b9c7e6); cursor: pointer; font-size: 11px; }
.mg-drawer p, .mg-drawer li { font-size: 12px; line-height: 1.74; color: var(--text-dim, #b9c7e6); }
.mg-drawer ul { margin: 4px 0 0; padding-left: 16px; }
.mg-drawer b.sec { display: block; margin: 13px 0 5px; font-size: 11px; color: var(--text-muted, #8ea3c9); }
.mg-drawer .warn { margin-top: 10px; padding: 8px 10px; border-radius: 9px; font-size: 11.5px; line-height: 1.66;
  color: #fbbf24; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.28); }
.mg-drawer .acts { margin-top: 15px; display: flex; gap: 8px; }
.mg-drawer .acts button { flex: 1; padding: 7px 0; border-radius: 9px; cursor: pointer; font-size: 12px;
  background: rgba(34,211,238,.14); color: #7fe3f5; border: 1px solid rgba(34,211,238,.45); }
.mg-drawer .acts button.ghost { background: rgba(125,165,255,.10); color: #cfe0ff;
  border-color: rgba(125,165,255,.35); }
.mg-drawer .updown { display: flex; flex-wrap: wrap; gap: 5px; }
.mg-drawer .updown button { font-size: 10.5px; }
`

export default function QuestionGraph({ focusId, onJumpKnowledge, onSend }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [anchors, setAnchors] = useState<Record<string, Anchors>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (focusId) setSelected(focusId)
  }, [focusId])

  const measure = () => {
    const inner = innerRef.current
    if (!inner) return
    const base = inner.getBoundingClientRect()
    const next: Record<string, Anchors> = {}
    for (const [id, el] of cardRefs.current) {
      const r = el.getBoundingClientRect()
      next[id] = {
        left: { x: r.left - base.left, y: r.top - base.top + r.height / 2 },
        right: { x: r.right - base.left, y: r.top - base.top + r.height / 2 },
      }
    }
    setAnchors(next)
  }

  useLayoutEffect(() => {
    measure()
    const t = window.setTimeout(measure, 120)
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 卡片展开更多知识点后高度会变，重新测锚点 */
  useEffect(() => {
    const t = window.setTimeout(measure, 40)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const active = hover ?? selected
  const path = useMemo(() => (active ? questionPath(active) : null), [active])
  const activeIds = useMemo(() => {
    if (!path || !active) return null
    return new Set<string>([active, ...path.upstream, ...path.downstream])
  }, [path, active])

  const byTier = useMemo(() => {
    const t1 = QUESTION_NODES.filter((q) => q.tier === 1)
    const t2 = QUESTION_NODES.filter((q) => q.tier === 2)
    const t3 = QUESTION_NODES.filter((q) => q.tier === 3)
    return [t1, t2, t3] as const
  }, [])

  /** 同一出口的多条连线在锚点处扇形散开，避免重叠 */
  const edgeGeometry = useMemo(() => {
    const groups = new Map<string, typeof QUESTION_EDGES>()
    for (const e of QUESTION_EDGES) {
      const list = groups.get(e.source) ?? []
      list.push(e)
      groups.set(e.source, list)
    }
    const out: { key: string; d: string; on: boolean; dim: boolean }[] = []
    for (const [, list] of groups) {
      const sorted = [...list].sort((a, b) => (anchors[a.target]?.left.y ?? 0) - (anchors[b.target]?.left.y ?? 0))
      sorted.forEach((e, i) => {
        const a = anchors[e.source]
        const b = anchors[e.target]
        if (!a || !b) return
        const off = (i - (sorted.length - 1) / 2) * 10
        const x1 = a.right.x
        const y1 = a.right.y + off
        const x2 = b.left.x
        const y2 = b.left.y + off * 0.4
        const dx = Math.max(48, (x2 - x1) * 0.46)
        const on = activeIds ? activeIds.has(e.source) && activeIds.has(e.target) : false
        const dim = activeIds ? !on : false
        out.push({
          key: `${e.source}-${e.target}`,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
          on,
          dim,
        })
      })
    }
    return out
  }, [anchors, activeIds])

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    const inc: Record<string, number> = {}
    for (const e of QUESTION_EDGES) {
      out[e.source] = (out[e.source] ?? 0) + 1
      inc[e.target] = (inc[e.target] ?? 0) + 1
    }
    return { out, inc }
  }, [])

  const selectedQ = selected ? questionById(selected) : undefined

  const renderCard = (q: QuestionNode, index: number) => {
    const tier = TIER_STYLE[q.tier]
    const isSel = selected === q.id
    const dim = activeIds ? !activeIds.has(q.id) : false
    const isExpanded = expanded.has(q.id)
    const chips = isExpanded ? q.knowledgeIds : q.knowledgeIds.slice(0, 3)
    const rest = q.knowledgeIds.length - chips.length
    return (
      <div
        key={q.id}
        ref={(el) => {
          if (el) cardRefs.current.set(q.id, el)
          else cardRefs.current.delete(q.id)
        }}
        className={`mg-qcard${isSel ? ' sel' : ''}${dim ? ' dim' : ''}`}
        style={{ ['--mg-accent' as string]: tier.accent, background: tier.bg, borderColor: tier.border }}
        onClick={() => setSelected(isSel ? null : q.id)}
        onMouseEnter={() => setHover(q.id)}
        onMouseLeave={() => setHover((h) => (h === q.id ? null : h))}
      >
        <div className="top">
          <span className="idx">{String(index + 1).padStart(2, '0')}</span>
          <span className="tier">💡 {tier.name}</span>
          <button
            className="detail"
            onClick={(e) => {
              e.stopPropagation()
              setSelected(q.id)
            }}
          >
            详情 ›
          </button>
        </div>
        <div className="title">{q.title}</div>
        <div className="foot">
          <span className="bloom" style={{ color: BLOOM_COLOR[q.bloom] }}>
            {q.bloom}
          </span>
        </div>
        <div className="chips">
          {chips.map((kid) => {
            const kn = nodeById(kid)
            if (!kn) return null
            return (
              <button
                key={kid}
                className="mg-qchip"
                title={`在知识图谱中查看「${kn.label}」`}
                onClick={(e) => {
                  e.stopPropagation()
                  onJumpKnowledge(kid)
                }}
              >
                {kn.label.length > 12 ? `${kn.label.slice(0, 12)}…` : kn.label}
              </button>
            )
          })}
          {rest > 0 && (
            <button
              className="mg-qchip"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((prev) => {
                  const next = new Set(prev)
                  next.add(q.id)
                  return next
                })
              }}
            >
              +{rest}
            </button>
          )}
        </div>

        {q.tier < 3 && (
          <span className="mg-anchor r" style={{ top: '50%' }} title={`下游 ${counts.out[q.id] ?? 0} 个问题`}>
            {counts.out[q.id] ?? 0}
          </span>
        )}
        {q.tier > 1 && (
          <span className="mg-anchor l" style={{ top: '50%' }} title={`上游 ${counts.inc[q.id] ?? 0} 个问题`}>
            {counts.inc[q.id] ?? 0}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="mg-qg" ref={wrapRef}>
      <style>{STYLE}</style>

      <div className="mg-qbar">
        <span>三层递进问题链 · 悬停或点击卡片，高亮整条问题演进路径；点知识点 chip 可跳回知识图谱</span>
        {selected && <button onClick={() => setSelected(null)}>清空聚焦</button>}
      </div>

      <div className="mg-qg-inner" ref={innerRef}>
        <svg className="mg-qsvg">
          <defs>
            <marker id="mg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#22d3ee" />
            </marker>
            <marker id="mg-arrow-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="rgba(125,165,255,.5)" />
            </marker>
          </defs>
          {edgeGeometry.map((e) => (
            <g key={e.key}>
              <path
                d={e.d}
                fill="none"
                stroke={e.on ? '#22d3ee' : 'rgba(125,165,255,.34)'}
                strokeWidth={e.on ? 2.1 : 1.1}
                opacity={e.dim ? 0.1 : 1}
                markerEnd={e.on ? 'url(#mg-arrow)' : 'url(#mg-arrow-dim)'}
              />
              {e.on && (
                <path
                  className="mg-flow"
                  d={e.d}
                  fill="none"
                  stroke="rgba(190,240,255,.95)"
                  strokeWidth={2.6}
                  strokeDasharray="6 10"
                  opacity={0.85}
                />
              )}
            </g>
          ))}
        </svg>

        {byTier.map((group, i) => {
          const tier = TIER_STYLE[(i + 1) as 1 | 2 | 3]
          return (
            <div className="mg-col" key={tier.name}>
              <div className="mg-col-head">
                <div className="line" style={{ color: tier.accent }}>
                  {tier.name}
                  <span className="count">（{group.length} 个问题）</span>
                </div>
                <div className="desc">{TIER_DESC[(i + 1) as 1 | 2 | 3]}</div>
                <div className="bar" style={{ background: tier.accent }} />
              </div>
              {group.map((q, idx) => renderCard(q, idx))}
            </div>
          )
        })}
      </div>

      {selectedQ && (
        <div className="mg-drawer" style={{ ['--mg-accent' as string]: TIER_STYLE[selectedQ.tier].accent }}>
          <button className="close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <h4>{selectedQ.title}</h4>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <span className="mg-qchip" style={{ color: BLOOM_COLOR[selectedQ.bloom], borderColor: BLOOM_COLOR[selectedQ.bloom] }}>
              {selectedQ.bloom}
            </span>
            <span className="mg-qchip">{TIER_STYLE[selectedQ.tier].name}</span>
            <span className="mg-qchip">{selectedQ.knowledgeIds.length} 个关联知识点</span>
          </div>

          <b className="sec">解答要点</b>
          <ul>
            {selectedQ.answer.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>

          {selectedQ.blindSpot && <div className="warn">⚠ 常见错误：{selectedQ.blindSpot}</div>}

          <b className="sec">关联知识点</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {selectedQ.knowledgeIds.map((kid) => {
              const kn = nodeById(kid)
              if (!kn) return null
              return (
                <button key={kid} className="mg-qchip" onClick={() => onJumpKnowledge(kid)}>
                  {kn.label}
                </button>
              )
            })}
          </div>

          {(() => {
            const p = questionPath(selectedQ.id)
            const up = QUESTION_NODES.filter((q) => p.upstream.has(q.id))
            const down = QUESTION_NODES.filter((q) => p.downstream.has(q.id))
            if (!up.length && !down.length) return null
            return (
              <>
                {!!up.length && (
                  <>
                    <b className="sec">上游问题（{up.length}）</b>
                    <div className="updown">
                      {up.map((q) => (
                        <button
                          key={q.id}
                          className="mg-qchip"
                          style={{ borderColor: TIER_STYLE[q.tier].border }}
                          onClick={() => setSelected(q.id)}
                        >
                          {q.title.length > 18 ? `${q.title.slice(0, 18)}…` : q.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {!!down.length && (
                  <>
                    <b className="sec">下游进阶（{down.length}）</b>
                    <div className="updown">
                      {down.map((q) => (
                        <button
                          key={q.id}
                          className="mg-qchip"
                          style={{ borderColor: TIER_STYLE[q.tier].border }}
                          onClick={() => setSelected(q.id)}
                        >
                          {q.title.length > 18 ? `${q.title.slice(0, 18)}…` : q.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )
          })()}

          <b className="sec">课程出处</b>
          <p style={{ fontSize: 11 }}>{selectedQ.refs.join('；')}</p>

          <div className="acts">
            <button
              onClick={() =>
                onSend(
                  `请围绕问题「${selectedQ.title}」展开深度解析：先给出要点，再指出学生常见错误，` +
                    '并联系相关知识点的课程出处。',
                )
              }
            >
              让 Agent 深度解析
            </button>
            <button
              className="ghost"
              onClick={() => {
                const first = selectedQ.knowledgeIds[0]
                if (first) onJumpKnowledge(first)
              }}
            >
              查看关联知识点
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
