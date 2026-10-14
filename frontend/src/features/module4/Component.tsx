import { useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import './module.css'

const tabs = ['案例观察', '组织对比', '辨析练习', '课程资料'] as const
const cases = ['钢铁组织', '铸铁组织', '铜合金组织']
const sources = ['课程 PPT 第5–9页', '课程 PPT 第10–13页', '课程 PPT 第16–18页']

function ImageSlot({ title }: { title: string }) {
  return <div className="m4-image"><strong>{title}</strong><span>暂无已审核图像</span><small>原图、标尺与区域标注待补充</small></div>
}

export default function Component({ onSendMessage }: FeatureProps) {
  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(0)
  const [comparison, setComparison] = useState(2)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)
  const note = notes[selected] ?? ''
  const selector = (label: string, value: number, change: (v: number) => void) => <label className="m4-field">{label}<select value={value} onChange={e => { change(Number(e.target.value)); setSent(false) }}>{cases.map((c, i) => <option key={c} value={i}>{c}</option>)}</select></label>

  return <div className="m4">
    <header><div className="sub">实验四 · 典型材料的物相组织观察</div><h3>金相组织辨析</h3><span className="sub">课程案例筹备中</span></header>
    <div className="m4-tabs" role="tablist" aria-label="金相组织辨析视图">{tabs.map((t, i) => <button key={t} id={`m4-tab-${i}`} role="tab" aria-selected={tab === i} aria-controls="m4-panel" onClick={() => setTab(i)}>{t}</button>)}</div>
    <section id="m4-panel" role="tabpanel" aria-labelledby={`m4-tab-${tab}`}>
      {tab === 0 && <>
        {selector('课程案例', selected, setSelected)}<ImageSlot title={cases[selected]} />
        <p className="sub">资料线索：{sources[selected]} · 标注待教师确认</p>
        <label className="m4-field">我的观察<textarea rows={4} value={note} onChange={e => { setNotes({ ...notes, [selected]: e.target.value }); setSent(false) }} placeholder="记录组织的形态、分布与判断依据…" /></label>
        <button className="chip" disabled={!note.trim()} onClick={() => { onSendMessage(`实验四金相组织辨析：当前讨论${cases[selected]}。我的观察：${note.trim()}。模块尚未提供审核图像，请仅依据课程知识讨论我的描述，指出缺少的依据，不要声称已经识别图片或生成评分。`); setSent(true) }}>交给 Agent 讨论</button>
        <p className="sub" role="status">{sent ? '已交给对话区；模型连接状态以全局状态栏为准。' : '观察记录仅保留在本次模块打开期间。'}</p>
      </>}
      {tab === 1 && <><div className="m4-compare"><div>{selector('案例 A', selected, setSelected)}<ImageSlot title={cases[selected]} /></div><div>{selector('案例 B', comparison, setComparison)}<ImageSlot title={cases[comparison]} /></div></div>{selected === comparison && <p className="sub">当前选择的是同一类案例。</p>}<h4>观察维度</h4><dl><div><dt>组织形态与分布</dt><dd>待案例与标注补齐</dd></div><div><dt>观察条件</dt><dd>倍率、标尺与处理状态待核对</dd></div></dl></>}
      {tab === 2 && <><h4>课程辨析任务</h4><p className="sub">0 道已审核题目</p><ol className="m4-steps"><li><strong>观察与圈选</strong><span>练习图与目标区域待补充</span></li><li><strong>判断与解释</strong><span>题目与参考依据待教师确认</span></li><li><strong>反馈与再练习</strong><span>评价规则与迁移案例待补充</span></li></ol><p className="sub">练习暂未开放，当前不生成评分或识别结论。</p></>}
      {tab === 3 && <><h4>课程资料清单</h4><dl>{[['实验四课件', '已提供 · 案例尚未入库'], ['教材与教学大纲', '已提供 · 引用条目待整理'], ['原始金相照片', '待整理与来源核对'], ['教师确认标注', '待补充'], ['辨析题与评价标准', '待补充']].map(([name, status]) => <div key={name}><dt>{name}</dt><dd>{status}</dd></div>)}</dl><h4>案例必备信息</h4><p className="sub">材料名称、处理状态、图片来源、倍率或标尺、组织标注、课程出处与审核状态。</p></>}
    </section>
    <footer>课程范围：实验四 · 观察、辨析与证据说明</footer>
  </div>
}
