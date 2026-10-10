import { useState } from 'react'
import type { FeatureProps } from '../../lib/types'

/**
 * 知识库 · 术语库问答
 *
 * 画布要把 **RAG 干了什么** 摊开给评委看：检索命中的教材原文、出处、术语卡。
 * 这是本模块存在的意义 —— 纯聊天框看不出「答案有据可依」，这块画布能。
 *
 * 数据由 search_knowledge 工具下发，形状见 README.md 的「三、契约」。
 */

interface Chunk {
  source?: string
  experiment?: string
  section?: string
  text?: string
}

interface Term {
  zh?: string
  en?: string
  definition?: string
  refs?: string[]
}

interface Payload {
  query?: string
  chunks?: Chunk[]
  terms?: Term[]
}

function ChunkCard({ c, index }: { c: Chunk; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const text = c.text ?? ''
  const long = text.length > 180
  const shown = open || !long ? text : `${text.slice(0, 180)}…`

  return (
    <div className="chunk">
      <div className="chunk-head">
        <span className="src-badge">{c.source ?? '未知来源'}</span>
        {c.experiment && <span className="chunk-exp">{c.experiment}</span>}
        {c.section && <span className="chunk-sec">{c.section}</span>}
      </div>
      <div className="chunk-text">{shown}</div>
      {long && (
        <button className="chunk-more" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}

function TermCard({ t }: { t: Term }) {
  return (
    <div className="term-card">
      <div className="term-head">
        <span className="term-zh">{t.zh ?? '—'}</span>
        {t.en && <span className="term-en">{t.en}</span>}
      </div>
      {t.definition && <div className="term-def">{t.definition}</div>}
      {t.refs && t.refs.length > 0 && (
        <div className="term-refs">
          {t.refs.map((r) => (
            <span key={r} className="src-badge">
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Component({ artifact, onSendMessage }: FeatureProps) {
  const data = (artifact?.data ?? null) as Payload | null
  const chunks = data?.chunks ?? []
  const terms = data?.terms ?? []

  if (!data) {
    return (
      <div className="feat">
        <h3>知识库 · 术语库问答</h3>
        <div className="sub">检索教材与任务书原文，逐条给出出处</div>
        <div className="box">
          在对话里提问，Agent 检索到原文后会把命中的片段和出处显示在这里
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="sub" style={{ marginBottom: 6 }}>可以试试</div>
          {['250 目筛分的作用是什么？', '金相试样为什么要镶嵌？', '实验废弃物怎么分类？'].map((q) => (
            <button
              key={q}
              className="chip"
              style={{ marginRight: 6, marginBottom: 6 }}
              onClick={() => onSendMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="feat">
      <h3>知识库 · 术语库问答</h3>
      <div className="sub">
        {data.query ? (
          <>
            检索词「<span style={{ color: 'var(--accent)' }}>{data.query}</span>」 · 命中{' '}
            {chunks.length} 段原文
            {terms.length > 0 && ` · ${terms.length} 个术语`}
          </>
        ) : (
          '检索结果'
        )}
      </div>

      {chunks.length === 0 && terms.length === 0 && (
        <div className="box">
          知识库中未收录相关内容
          <div style={{ marginTop: 6, fontSize: 'var(--fs-xs)', opacity: 0.75 }}>
            Agent 应当如实告知，而不是编造 —— 这是本模块的硬性要求
          </div>
        </div>
      )}

      {chunks.length > 0 && (
        <>
          <div className="sub" style={{ margin: '2px 0 8px' }}>命中原文</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chunks.map((c, i) => (
              <ChunkCard key={i} c={c} index={i} />
            ))}
          </div>
        </>
      )}

      {terms.length > 0 && (
        <>
          <div className="sub" style={{ margin: '16px 0 8px' }}>相关术语</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {terms.map((t, i) => (
              <TermCard key={i} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
