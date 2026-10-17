import { useState } from 'react'
import { qaData, qaSources, retrieveQa, type QaEntry } from './qaData'

export default function QuestionAnswer() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ReturnType<typeof retrieveQa> | null>(null)
  const [asked, setAsked] = useState('')
  const answer = (entry: QaEntry) => { setQuery(entry.question); setAsked(entry.question); setResult({ exact: entry, candidates: [] }) }
  return <div className="m4-knowledge">
    <h4>实验四资料问答</h4>
    <p className="sub">{qaData.length} 条参考问答 · 课件文字整理与网络补充 · 待教师审核</p>
    <form onSubmit={e => { e.preventDefault(); setAsked(query.trim()); setResult(retrieveQa(query)) }}>
      <label className="m4-field">你的问题<textarea maxLength={500} rows={3} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button className="chip" type="submit" disabled={!query.trim()}>查询资料</button>
    </form>
    {result && <section aria-label="问答结果" aria-live="polite">
      <h4>提问：{asked}</h4>
      {result.exact ? <><h4>参考回答</h4><p>{result.exact.answer}</p><p><strong>易错点：</strong>{result.exact.difficulty}</p><h4>依据</h4><ul>{result.exact.sources.map(id => { const source = qaSources[id]; return <li key={id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title} · {source.location}</li> })}</ul></> : <><p>当前资料中没有与该问题直接对应的答案。{result.candidates.length ? '以下仅为相关问题，请确认是否符合你的意思。' : '请补充实验四相关的问题或向老师核实；本模块不回答课程范围外的问题。'}</p><ul>{result.candidates.map(entry => <li key={entry.id}><button className="m4-question" onClick={() => answer(entry)}>{entry.question}</button></li>)}</ul></>}
    </section>}
    <details><summary>常见难点与全部问答（{qaData.length}）</summary><ul>{qaData.map(entry => <li key={entry.id}><button className="m4-question" onClick={() => answer(entry)}>{entry.question}</button></li>)}</ul></details>
    <details><summary>资料覆盖与限制</summary><p>课件共19页，本版使用第2、5至8、19页可提取文字。以图片为主的页尚未逐图审核；铝硅合金、铜合金具体组织和显微镜操作步骤暂未建立答案。课件中个别温度表述不一致，不提供相关工艺参数建议。</p><p>这是本地问答检索，不是图像识别或大模型生成。未命中时不自动拼接答案。学生难点为教学设计假设，尚未经真实提问数据验证。</p></details>
  </div>
}
