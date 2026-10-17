import { useState } from 'react'
import { observationCatalog, universitySources } from './universityCatalog'

export default function UniversityCatalog({ onSelectCase }: { onSelectCase: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [school, setSchool] = useState('')
  const entries = observationCatalog.filter(entry => (!school || entry.sources.includes(school)) && `${entry.title} ${entry.category} ${entry.detail}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="m4-knowledge" aria-label="高校观察目录">
    <h4>高校实验观察目录</h4><p className="sub">已核查5所高校公开资料 · 12条组织或材料线索 · 核查日期2026-10-15 · 非全国完整清单</p>
    <p>仅整理公开资料摘要。无图条目不加入图片练习；其他实验和耗材线索不作为本课程标准答案。</p>
    <label className="m4-field">检索观察目录<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label className="m4-field">高校来源<select value={school} onChange={e => setSchool(e.target.value)}><option value="">全部高校</option>{universitySources.map(source => <option value={source.id} key={source.id}>{source.school}</option>)}</select></label>
    <p role="status">{entries.length} 条结果</p>
    {entries.map(entry => <article key={entry.id} className="m4-knowledge-entry"><h4>{entry.title}</h4><p className="sub">{entry.category} · {entry.status}</p><p>{entry.detail}</p><p><strong>资料缺口：</strong>{entry.gap}</p><p>{entry.sources.map(id => { const source = universitySources.find(s => s.id === id)!; return <a key={id} href={source.url} target="_blank" rel="noreferrer">{source.school} · 原文　</a> })}</p>{entry.caseId && <button className="chip" onClick={() => onSelectCase(entry.caseId)}>查看已有相关补充图（非该校原图）</button>}</article>)}
    {!entries.length && <button className="chip" onClick={() => { setQuery(''); setSchool('') }}>清除目录筛选</button>}
    <h4>各校实验要求与核查边界</h4>{universitySources.filter(source => !school || source.id === school).map(source => <details key={source.id}><summary>{source.school} · {source.title}</summary><p>{source.coverage}</p><p>实验要求：{source.requirement}</p><p>核查边界：{source.limitation}</p><a href={source.url} target="_blank" rel="noreferrer">查看高校原始资料</a></details>)}
  </section>
}
