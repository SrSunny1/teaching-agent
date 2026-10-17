import { useState } from 'react'
import { cases, caseGroups, imageUrl } from './cases'

export default function CaseGallery({ selected, onSelect }: { selected: string; onSelect: (id: string, ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('全部')
  const filtered = cases.filter(item => (group === '全部' || item.group === group) && item.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="m4-gallery" aria-label="组织图像库">
    <label className="m4-field">查找组织<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索组织或材料名称" /></label>
    <div className="m4-filters" role="group" aria-label="材料类别">{['全部', ...caseGroups].map(name => <button key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
    <p className="sub" role="status">{filtered.length} 个案例</p>
    <div className="m4-thumbnails">{filtered.map(item => <button className="m4-thumbnail" key={item.id} aria-pressed={selected === item.id} onClick={() => onSelect(item.id, filtered.map(c => c.id))}><img src={imageUrl(item)} alt="" loading="lazy" /><span>{item.title}</span></button>)}</div>
    {!filtered.length && <button className="chip" onClick={() => { setQuery(''); setGroup('全部') }}>清除筛选</button>}
  </section>
}
