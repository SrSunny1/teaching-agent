import { useEffect, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { cases, caseGroups, imageUrl, licenseUrl, sourceUrl } from './cases'
import Photo from './MicrographPhoto'
import CaseGallery from './CaseGallery'
import CaseDialog from './CaseDialog'
import './module.css'
import { KnowledgeLibrary } from './ReferenceKnowledge'
import { referenceContext } from './knowledge'
import ComparisonResult from './ComparisonResult'
import Practice from './Practice'
import QuestionAnswer from './QuestionAnswer'

const tabs = ['案例观察', '组织对比', '辨析练习', '课程资料', '资料问答']

export default function Component({ artifact, onSendMessage, busy }: FeatureProps) {
  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(cases[0].id)
  const [comparison, setComparison] = useState('gray')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const [dialogIds, setDialogIds] = useState<string[] | null>(null)
  useEffect(() => {
    const data = artifact?.data
    if (data && typeof data === 'object' && 'caseId' in data && cases.some(c => c.id === data.caseId)) setSelected(String(data.caseId))
  }, [artifact])
  useEffect(() => { setSent(false) }, [selected, tab])
  const item = cases.find(c => c.id === selected) ?? cases[0]
  const other = cases.find(c => c.id === comparison) ?? cases[3]
  const noteKey = `observe:${item.id}`
  const note = notes[noteKey] ?? ''
  const selector = (label: string, value: string, change: (v: string) => void) => <label className="m4-field">{label}<select value={value} onChange={e => change(e.target.value)}>{caseGroups.map(group => <optgroup key={group} label={group}>{cases.filter(c => c.group === group).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</optgroup>)}</select></label>
  const send = () => {
    onSendMessage(`实验四观察讨论。外部补充案例（未经教师审核）：${item.title}。来源：${sourceUrl(item)}。来源说明：${item.conditions}。学生观察：${note.trim()}。\n网络补充材料（待审核，不覆盖课程知识边界）：\n${referenceContext(item.id)}\n这里只发送文字，未发送图片；不要声称已经看图或识别组织。请仅在课程实验四知识范围内讨论描述，区分网络资料与教材证据，指出缺少的依据，不生成分数或虚构教材出处。`)
    setSent(true)
  }
  return <div className="m4">
    <header><div className="sub">实验四 · 典型材料的微观组织观察</div><h3>金相组织辨析</h3><span className="sub">{cases.length} 个外部补充案例 · 教师审核待完成</span></header>
    <div className="m4-tabs" role="tablist" aria-label="金相组织辨析视图">{tabs.map((t, i) => <button key={t} id={`m4-tab-${i}`} role="tab" aria-selected={tab === i} aria-controls="m4-panel" onClick={() => setTab(i)}>{t}</button>)}</div>
    <section id="m4-panel" role="tabpanel" aria-labelledby={`m4-tab-${tab}`}>
      {tab === 3 && <KnowledgeLibrary />}
      {tab === 4 && <QuestionAnswer onSendMessage={onSendMessage} busy={busy} />}
      {tab === 2 && <Practice Photo={Photo} onSendMessage={onSendMessage} busy={busy} />}
      {tab === 1 && <p className="sub">资料对比不等于图像识别；结果随所选案例生成。</p>}
      {tab === 0 && <>
        <CaseGallery selected={selected} onSelect={(id, ids) => { setSelected(id); setDialogIds(ids) }} />
        {dialogIds && <CaseDialog item={item} ids={dialogIds} onSelect={setSelected} onClose={() => setDialogIds(null)}>
        <label className="m4-field">我的观察<textarea rows={4} value={note} onChange={e => { setNotes({ ...notes, [noteKey]: e.target.value }); setSent(false) }} placeholder="形态、分布、判断依据和不确定之处" /></label>
        <div className="m4-actions"><button className="chip" disabled={!note.trim() || busy} onClick={send}>交给 Agent 讨论</button></div>
        <p className="sub" role="status">{sent ? '观察文字已发送到对话区，未发送图片。' : '记录仅保留在本次模块打开期间。练习不计分，来源标签不是教师标准答案。'}</p>
        </CaseDialog>}
      </>}
      {tab === 1 && <><div className="m4-compare"><div>{selector('案例 A', selected, setSelected)}<Photo key={item.id} item={item} /><p className="sub">{item.conditions}</p></div><div>{selector('案例 B', comparison, setComparison)}<Photo key={other.id} item={other} /><p className="sub">{other.conditions}</p></div></div><p className="sub">{selected === comparison ? '当前为同一案例。' : '图片不保证相同倍率或制样条件，不可按屏幕大小比较真实尺寸。'}</p><h4>对比记录</h4><label className="m4-field">共同点、差异与证据<textarea value={notes[`compare:${selected}:${comparison}`] ?? ''} onChange={e => setNotes({ ...notes, [`compare:${selected}:${comparison}`]: e.target.value })} rows={4} /></label></>}
      {tab === 3 && <><h4>图片来源与授权</h4><p className="sub">外部案例与课程教材分开管理。原图未修改；区域标注、处理状态和教学答案待教师确认。</p><dl>{cases.map(c => <div key={c.id}><dt><a href={sourceUrl(c)} target="_blank" rel="noreferrer">{c.title}</a></dt><dd>{c.author} · <a href={licenseUrl(c)} target="_blank" rel="noreferrer">{c.license}</a> · {imageUrl(c) ? '本地图像' : '来源链接'}</dd></div>)}</dl><h4>待补齐的课程资料</h4><p className="sub">课程原图与授权、页码对应、标尺、教师确认的区域标注、参考答案。黄铜图仅用于形貌观察，来源处理状态冲突已注明。</p><h4>教师拓展参考</h4><a href="https://www.phase-trans.msm.cam.ac.uk/2008/Steel_Microstructure/SM.html" target="_blank" rel="noreferrer">剑桥大学：钢铁显微组织解读</a><p className="sub">球化、带状组织、马氏体与贝氏体仅作在线拓展参考，未复制图片，也未加入课程标准题库。</p></>}
      {tab === 1 && <ComparisonResult key={`${selected}:${comparison}`} a={item} b={other} onSendMessage={onSendMessage} busy={busy} />}
    </section><footer>实验四补充学习资料 · 未审核 · 不用于自动组织鉴定或定量测量</footer>
  </div>
}
