import type { FeatureProps } from '../../lib/types'

interface Round {
  question: string
  userAnswer: string
  critique: string
}

interface Payload {
  concept?: string
  rounds?: Round[]
  score?: number | null
  overall?: string
  suggestions?: string[]
}

export default function Component({ artifact, onSendMessage }: FeatureProps) {
  const data = artifact?.data as Payload | undefined
  const rounds = Array.isArray(data?.rounds) ? data.rounds : []
  const complete = rounds.length >= 3 && typeof data?.score === 'number'

  return (
    <div className="feat" style={{ overflowY: 'auto' }}>
      <h3>费曼追问</h3>
      <div className="sub" style={{ marginBottom: 14 }}>
        用自己的话讲清一个概念，逐轮检查表述和推理
      </div>

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
              {complete ? '追问已完成' : `第 ${rounds.length + 1} 轮 / 至少 3 轮`}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {rounds.map((round, index) => (
              <section className="box" key={`${index}-${round.question}`}>
                <div className="sub" style={{ marginBottom: 6 }}>第 {index + 1} 轮 · Agent 追问</div>
                <div style={{ lineHeight: 1.55 }}>{round.question}</div>
                <div style={{ marginTop: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>你的回答</div>
                <div style={{ marginTop: 4, lineHeight: 1.55 }}>{round.userAnswer || '等待你的回答'}</div>
                {round.critique && (
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-soft)' }}>
                    <div className="sub" style={{ marginBottom: 4 }}>点评</div>
                    <div style={{ lineHeight: 1.55 }}>{round.critique}</div>
                  </div>
                )}
              </section>
            ))}
          </div>

          {complete ? (
            <section className="box" style={{ marginTop: 14, borderColor: 'var(--accent-border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <strong>对照评价</strong>
                <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-xl)' }}>{data.score} 分</span>
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
