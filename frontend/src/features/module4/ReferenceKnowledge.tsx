import { useState } from 'react'
import { courseKnowledge, forCase, knowledge, references, type KnowledgeEntry } from './knowledge'
import { useLocalRecords } from './useLocalRecords'
import { cases, caseGroups } from './cases'

function Entry({ entry }: { entry: KnowledgeEntry }) {
  return <article className="m4-knowledge-entry">
    <h4>{entry.title}</h4><p>{entry.fact}</p>
    <p className="sub"><strong>辨析边界：</strong>{entry.caution}</p>
    <details><summary>课堂追问与讨论线索</summary><p>{entry.question}</p><p className="sub">{entry.discussion}</p><small>教学设计草案 · 非原文摘录 · 非标准答案</small></details>
    <p className="sub">出处：{entry.sourceIds.map(id => <a key={id} href={references[id].url} target="_blank" rel="noreferrer">{references[id].title}（{references[id].section}） </a>)}</p>
  </article>
}
export function CaseKnowledge({ caseId }: { caseId: string }) {
  return <div className="m4-knowledge"><h4>相关知识 · 网络补充</h4><p className="sub">待教师审核；一般知识不等于对本图区域的识别结论。</p>{forCase(caseId).map(entry => <Entry key={entry.id} entry={entry} />)}</div>
}
export function KnowledgeLibrary() {
  const { records, update, error } = useLocalRecords('module4.reading.v1')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const filtered = knowledge.filter(entry => (!unreadOnly || records[entry.id] !== 'read') && (group === 'all' || entry.caseIds.some(id => cases.find(c => c.id === id)?.group === group)) && `${entry.title} ${entry.fact} ${entry.caution} ${entry.question} ${entry.discussion} ${entry.sourceIds.map(id => references[id].title).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="m4-knowledge">
    <details><summary>课程对应与资料状态</summary><dl><div><dt>课程主线</dt><dd>实验四：典型材料的组织观察与辨析</dd></div><div><dt>钢组织</dt><dd>铁素体、珠光体、奥氏体；相与组织组成物</dd></div><div><dt>铸铁组织</dt><dd>石墨形态、金属基体与莱氏体</dd></div><div><dt>课程原文</dt><dd>课件与教材页码待逐条审核，当前不提供伪造的教材引用</dd></div><div><dt>网络补充</dt><dd>{knowledge.length}条摘要可离线阅读；外部来源链接需联网</dd></div></dl></details>
    <details open><summary>课程讲义：金相试样制备要点（{courseKnowledge.length} 条）</summary><p className="sub">来源：课程讲义《金相试样制备》· 实验三；教师审核待完成。</p>{courseKnowledge.map(entry => <article className="m4-knowledge-entry" key={entry.id}><h4>{entry.title}</h4><p>{entry.fact}</p><p className="sub"><strong>辨析边界：</strong>{entry.caution}</p><p className="sub">出处：{entry.source}</p></article>)}</details>
    <h4>实验四补充知识</h4><p className="sub">{knowledge.length} 条简要整理 · 更新日期 2026-10-16 · 教师审核待完成</p>
    <label className="m4-field">检索知识<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="组织名称或关键词" /></label>
    <label className="m4-field">资料范围<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">全部资料</option>{caseGroups.map(name => <option key={name}>{name}</option>)}</select></label>
    <label className="m4-check"><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />仅看未读</label>
    <p className="sub" role="status">{filtered.length} 条结果 · 已读 {knowledge.filter(e => records[e.id] === 'read').length} / {knowledge.length}</p>{filtered.length ? filtered.map(entry => <div key={entry.id}><Entry entry={entry} /><label className="m4-check"><input type="checkbox" checked={records[entry.id] === 'read'} onChange={e => update({ [entry.id]: e.target.checked ? 'read' : '' })} />已阅读：{entry.title}</label></div>) : <><p>当前筛选下没有资料。</p><button className="chip" onClick={() => { setQuery(''); setGroup('all'); setUnreadOnly(false) }}>清除筛选</button></>}
    {error && <p role="alert">{error}</p>}
    <details><summary>来源与使用说明</summary>{Object.entries(references).map(([id, source]) => <p key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><br /><span className="sub">{source.section}</span></p>)}<p className="sub">仅保留简短事实概括与链接，未复制整篇原文或图谱。课程原文与页码待逐条核对；不作为教材结论或评分标准。</p></details>
  </div>
}
