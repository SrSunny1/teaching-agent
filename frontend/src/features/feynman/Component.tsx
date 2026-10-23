import { useEffect, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { concepts } from './concepts'

type MarkKind = 'vague' | 'jump' | 'good'

interface Segment {
  text: string
  /** null / 缺失 = 未标注的普通文字 */
  kind?: MarkKind | null
  note?: string
}

interface Round {
  question: string
  userAnswer: string
  critique: string
  /**
   * ★ 后端 `_annotate` 切好的**互不重叠的完整分段**（把 userAnswer 拼起来与原文逐字相同）。
   *   前端只负责渲染，不做任何切分或定位计算。
   *   缺失或只剩一段无标注时，退回渲染 userAnswer 纯文本。
   */
  annotated?: Segment[]
}

interface Payload {
  concept?: string
  rounds?: Round[]
  score?: number | null
  overall?: string
  suggestions?: string[]
}

/**
 * 三种标注的样式。**只改底色和下划线，不动文字颜色** —— 保住正文可读性，
 * 颜色语义靠下划线区分（黄波浪=模糊、红实线=跳跃、绿实线=讲对）。
 */
const MARK_STYLE: Record<MarkKind, { bg: string; underline: string; line: string }> = {
  vague: { bg: 'var(--warn-soft)', underline: '2px dotted var(--warn)', line: 'var(--warn)' },
  jump: { bg: 'var(--err-soft)', underline: '2px solid var(--err)', line: 'var(--err)' },
  good: { bg: 'var(--ok-soft)', underline: '2px solid var(--ok)', line: 'var(--ok)' },
}

const MARK_LABEL: Record<MarkKind, string> = {
  vague: '表述模糊',
  jump: '逻辑跳跃',
  good: '讲对了',
}

const MARK_ORDER: MarkKind[] = ['vague', 'jump', 'good']

const isMark = (value: MarkKind | null | undefined): value is MarkKind =>
  value === 'vague' || value === 'jump' || value === 'good'

/**
 * 学生的原话 + 逐句标注。
 *
 * 点击某一段看这一句的点评 —— **刻意不用 hover 浮层**：录屏评审时鼠标悬停的
 * `title` 提示根本录不进去，点击后固定显示的那条才看得见。
 */
function AnnotatedAnswer({ round, roundIndex, selected, onSelect }: {
  round: Round
  roundIndex: number
  selected: { round: number; seg: number } | null
  onSelect: (next: { round: number; seg: number } | null) => void
}) {
  const segments = round.annotated

  // 兜底路径：模型没产 marks，或引文全部对不上原文（后端此时返回单个无标注分段）。
  // 这条不能省 —— 少了它，标注一旦拿不到数据整个回答区就空了。
  if (!segments || segments.length === 0) {
    return <div style={{ marginTop: 4, lineHeight: 1.55 }}>{round.userAnswer || '等待你的回答'}</div>
  }

  return (
    <div style={{ marginTop: 4, lineHeight: 1.8 }}>
      {segments.map((segment, index) => {
        if (!isMark(segment.kind)) return <span key={index}>{segment.text}</span>
        const style = MARK_STYLE[segment.kind]
        const active = selected?.round === roundIndex && selected?.seg === index
        return (
          <button
            key={index}
            type="button"
            aria-pressed={active}
            title={`${MARK_LABEL[segment.kind]}（点击查看这一句的点评）`}
            onClick={() => onSelect(active ? null : { round: roundIndex, seg: index })}
            style={{
              display: 'inline',
              margin: 0,
              padding: '0 2px',
              border: 0,
              borderBottom: style.underline,
              borderRadius: 3,
              background: style.bg,
              boxShadow: active ? '0 0 0 2px var(--accent)' : undefined,
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              lineHeight: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {segment.text}
          </button>
        )
      })}
    </div>
  )
}

export default function Component({ artifact, onSendMessage }: FeatureProps) {
  const data = artifact?.data as Payload | undefined
  const rounds = Array.isArray(data?.rounds) ? data.rounds : []
  // ★ 「已回答」的轮次才算有效轮次。后端现在在 Agent 刚抛出问题、学生还没开口时也会记一轮
  //   （否则整个问答过程画布都是空的），那种 userAnswer 为空的轮次不能算进三轮门槛 ——
  //   否则学生会看到「第 4 轮 / 至少 3 轮」这种自相矛盾的进度。
  const answered = rounds.filter((round) => round.userAnswer).length
  // 分数只可能在后端判定满三轮后才下发，所以「有没有分」就是完成与否的权威信号
  const complete = typeof data?.score === 'number'
  const latestAnsweredIndex = rounds.reduce(
    (latest, round, index) => round.userAnswer ? index : latest, -1,
  )
  const [selected, setSelected] = useState<{ round: number; seg: number } | null>(null)

  // 画布是整块替换的，新产物到达时旧的分段下标可能已经失效 —— 清掉选中态
  useEffect(() => { setSelected(null) }, [data])

  const hasMarks = rounds.some((round) => (round.annotated ?? []).some((segment) => isMark(segment.kind)))

  return (
    <div className="feat" style={{ overflowY: 'auto' }}>
      <h3>费曼追问</h3>
      {!data && <details style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-sm)', padding: '4px 0' }}>
          没有思路？从这些课程概念开始（{concepts.length} 条）
        </summary>
        <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
          {concepts.map((item) => (
            <article key={item.id} style={{
              padding: '9px 11px', border: '1px solid var(--border-soft)',
              borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)',
            }}>
              <strong style={{ fontSize: 'var(--fs-sm)' }}>{item.concept}</strong>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                <strong>常被追问：</strong>{item.blindSpot}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 'var(--fs-xs)', lineHeight: 1.55, color: 'var(--text-faint)' }}>
                <strong>常见误区：</strong>{item.misconception}
              </p>
              <button className="chip" style={{ marginTop: 7 }}
                onClick={() => onSendMessage(`我想用费曼技巧学习「${item.concept}」。请先让我用自己的话讲，然后从表述模糊点和逻辑跳跃开始追问；至少完成三轮后再给总评。`)}>
                开始追问
              </button>
            </article>
          ))}
        </div>
      </details>}

      {!data && (
        <div className="box">
          还没有追问记录。回到对话区说「我来讲讲什么是回火」，Agent 会围绕你的解释继续追问。
        </div>
      )}

      {data && (
        <>
          <div className="box" style={{ marginBottom: 14 }}>
            <div className="sub">正在讨论</div>
            <strong>{data.concept || '待确定概念'}</strong>
            <div className="sub" style={{ marginTop: 6 }}>
              {complete ? '追问已完成' : `已回答 ${answered} 轮 / 至少 3 轮`}
            </div>
          </div>

          {/* 图例：不给的话观众不知道这三种颜色是什么意思 */}
          {hasMarks && (
            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
              marginBottom: 10, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)',
            }}>
              {MARK_ORDER.map((kind) => (
                <span key={kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    width: 11, height: 11, borderRadius: 3,
                    background: MARK_STYLE[kind].bg,
                    borderBottom: MARK_STYLE[kind].underline,
                  }} />
                  {MARK_LABEL[kind]}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>点击标注看逐句点评</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
            {rounds.map((round, index) => {
              const picked = selected?.round === index ? (round.annotated ?? [])[selected.seg] : undefined
              const pickedStyle = picked && isMark(picked.kind) ? MARK_STYLE[picked.kind] : null
              // 学生直接以「我来讲讲…」开场时，第 1 轮记录的是他的开场自述而非对某个追问的回答
              const isOpening = index === 0 && /开场|自述|初始讲解/.test(round.question)
              return (
                <details
                  className="box"
                  key={`${index}-${round.question}-${latestAnsweredIndex}-${complete}`}
                  open={!complete && (index === latestAnsweredIndex || index === rounds.length - 1)}
                  style={{
                    textAlign: 'left',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 600, lineHeight: 1.6, color: 'var(--text)' }}>
                    第 {index + 1} 轮 · {isOpening ? '你的开场讲解' : 'Agent 追问'}
                  </summary>
                  <div style={{ marginTop: 8, color: 'var(--text)' }}>
                    {!isOpening && (
                      <>
                        <div style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{round.question}</div>
                        <div style={{ marginTop: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>你的回答</div>
                      </>
                    )}
                    <AnnotatedAnswer
                      round={round}
                      roundIndex={index}
                      selected={selected}
                      onSelect={setSelected}
                    />

                    {picked && pickedStyle && (
                      <div style={{
                        marginTop: 9,
                        padding: '8px 10px',
                        border: '1px solid var(--border-soft)',
                        borderLeft: `3px solid ${pickedStyle.line}`,
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--bg-elevated)',
                      }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 650, color: pickedStyle.line, marginBottom: 3 }}>
                          {MARK_LABEL[picked.kind as MarkKind]}
                        </div>
                        <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>{picked.note}</div>
                      </div>
                    )}

                    {round.critique && (
                      <details style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-soft)' }}>
                        <summary className="sub" style={{ cursor: 'pointer', marginBottom: 4 }}>本轮点评</summary>
                        <div style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{round.critique}</div>
                      </details>
                    )}
                  </div>
                </details>
              )
            })}
          </div>

          {complete ? (
            <section className="box" style={{ marginTop: 14, borderColor: 'var(--accent-border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <strong>对照评价</strong>
                <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-lg)', fontWeight: 650 }}>{data.score} 分</span>
              </div>
              {data.overall && <p style={{ lineHeight: 1.6 }}>{data.overall}</p>}
              {!!data.suggestions?.length && (
                <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>
                  {data.suggestions.map((suggestion, i) => <li key={i}>{suggestion}</li>)}
                </ul>
              )}
            </section>
          ) : (
            <button
              className="chip"
              style={{ marginTop: 14 }}
              onClick={() => onSendMessage(`继续对「${data.concept || '这个概念'}」进行费曼追问。先澄清我刚才回答中不清楚的地方，再逐层追问；至少完成三轮后再给总评。`)}
            >
              继续追问
            </button>
          )}
        </>
      )}
    </div>
  )
}
