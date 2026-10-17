import { useState, type ComponentType } from 'react'
import type { FeatureProps } from '../../lib/types'
import { cases, type Micrograph } from './cases'
import { CaseKnowledge } from './ReferenceKnowledge'
import { referenceContext } from './knowledge'
import { useLocalRecords } from './useLocalRecords'
import EvidencePractice from './EvidencePractice'

const fields = [['shape', '形态与分布'], ['judgment', '初步判断与证据'], ['unknown', '不确定之处']] as const
const checks = ['已区分观察事实与推测', '已核对观察条件与来源', '已记录尚缺少的证据']
export default function Practice({ Photo, onSendMessage, busy }: Pick<FeatureProps, 'onSendMessage' | 'busy'> & { Photo: ComponentType<{ item: Micrograph; blind?: boolean }> }) {
  const { records, update, error } = useLocalRecords('module4.practice.v1')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [sent, setSent] = useState(false)
  const [mode, setMode] = useState('guided')
  const item = cases[index]
  const key = (field: string) => `${item.id}:${field}`
  const filled = fields.every(([field]) => (records[key(field)] ?? '').trim())
  const checked = checks.every((_, i) => records[key(`check${i}`)] === 'yes')
  const completed = cases.filter(c => records[`${c.id}:done`] === 'yes').length
  const select = (value: number) => { setIndex(value); setRevealed(false); setSent(false) }
  return <div className="m4-practice">
    <label className="m4-field">练习类型<select value={mode} onChange={e => setMode(e.target.value)}><option value="guided">分步辨析：判断与证据反馈</option><option value="free">自由观察：记录与自查</option></select></label>
    {mode === 'guided' ? <EvidencePractice Photo={Photo} /> : <>
    <h4>观察与证据练习</h4><p className="sub">已完成自查 {completed} / {cases.length} · 不计分 · 非教师评定</p>
    <progress max={cases.length} value={completed} aria-label="自查完成进度" />
    <label className="m4-field">观察任务<select value={index} onChange={e => select(Number(e.target.value))}>{cases.map((c, i) => <option key={c.id} value={i}>任务 {i + 1}{records[`${c.id}:done`] === 'yes' ? ' · 已自查' : ''}</option>)}</select></label>
    <Photo key={`${item.id}:${revealed}`} item={item} blind={!revealed} />
    {fields.map(([field, label]) => <label className="m4-field" key={field}>{label}<textarea rows={3} value={records[key(field)] ?? ''} onChange={e => { update({ [key(field)]: e.target.value, [key('done')]: '', ...Object.fromEntries(checks.map((_, i) => [key(`check${i}`), ''])) }); setSent(false) }} /></label>)}
    <div className="m4-actions"><button className="chip" disabled={!filled} onClick={() => setRevealed(!revealed)}>{revealed ? '收起参考线索' : '查看参考线索'}</button><button className="chip" disabled={!filled || busy} onClick={() => { onSendMessage(`实验四观察练习，未发送图片，不得声称已经识图。案例来源标签：${item.title}（待教师审核）。学生记录：${fields.map(([field, label]) => `${label}：${records[key(field)]}`).join('；')}。参考资料：${referenceContext(item.id)}。请在课程边界内追问证据，区分观察与猜测，不评分、不虚构教材出处。`); setSent(true) }}>请 Agent 追问</button></div>
    {!filled && <p className="sub">三项记录尚未齐全；无法判断的内容可如实填写“不确定”。</p>}
    {revealed && <><CaseKnowledge caseId={item.id} /><fieldset><legend>观察自查</legend>{checks.map((label, i) => <label className="m4-check" key={label}><input type="checkbox" checked={records[key(`check${i}`)] === 'yes'} onChange={e => update({ [key(`check${i}`)]: e.target.checked ? 'yes' : '', [key('done')]: '' })} />{label}</label>)}</fieldset><button className="chip" disabled={!filled || !checked} onClick={() => update({ [key('done')]: 'yes' })}>完成本题自查</button></>}
    <p className="sub" role="status">{error || (sent ? '观察记录已发送到对话区。' : records[key('done')] === 'yes' ? '本题已完成自查，不代表答案正确。' : '练习记录保存在当前浏览器，不同步到服务器。')}</p>
    <div className="m4-actions"><button className="chip" disabled={index === 0} onClick={() => select(index - 1)}>上一题</button><button className="chip" disabled={index === cases.length - 1} onClick={() => select(index + 1)}>下一题</button></div>
    </>}
  </div>
}
