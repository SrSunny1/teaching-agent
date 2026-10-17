import { useState } from 'react'
import type { Micrograph } from './cases'
import { sourceUrl } from './cases'
import { forCase, references, referenceContext } from './knowledge'
import { comparisonDetails, pairFocus } from './comparisonDetails'

export default function ComparisonResult({ a, b, onSendMessage, busy }: {
  a: Micrograph; b: Micrograph; onSendMessage: (message: string) => void; busy?: boolean
}) {
  const [generated, setGenerated] = useState(false)
  const [sent, setSent] = useState(false)
  const left = forCase(a.id)
  const right = forCase(b.id)
  const shared = left.filter(entry => right.some(other => other.id === entry.id))
  const same = a.id === b.id
  const electronMicroscopy = [a.id, b.id].some(id => ['pearlite-sem', 'spheroid', 'bainite'].includes(id))
  const graphitePair = [a.id, b.id].every(id => ['gray', 'ductile', 'malleable'].includes(id))
  const common = graphitePair ? '两者的通用组织资料都涉及石墨与金属基体，因此需要分别比较这两个部分。石墨形态是重要辨析线索，但相同的材料大类不意味着基体组成、处理状态或性能相同。' : shared.length ? shared.map(entry => entry.fact).join(' ') : a.group === b.group ? `两者均属于${a.group}案例，但类别相同不代表相组成、基体或处理状态相同。` : '两者均为实验四的金属材料补充案例；应分别描述组织形态、分布和观察条件。'
  const limits = '现有资料不能给出晶粒尺寸、相含量、硬度或优劣排名，也不能证明图片中某一区域的身份。'
  return <section className="m4-result" aria-label="案例资料对比">
    <button className="chip" disabled={same} onClick={() => { setGenerated(true); setSent(false) }}>生成对比结果</button>
    {same && <p role="status" className="sub">请选择两个不同案例后再生成对比。</p>}
    {generated && !same && <>
      <h4>对比结果：{a.title} / {b.title}</h4>
      <p className="sub">基于已收录资料 · 非自动识图 · 待教师审核</p>
      <h4>共同点</h4><p>{common}</p>
      <ul><li>描述层级相同：先写组织区域的形态与分布，再解释相组成，不能把组织名称直接当成单一相。</li><li>证据要求相同：都需要结合材料名称、处理状态与观察条件；一张局部照片不能代表整个试样。</li><li>比较方法相同：分别记录“观察到了什么”“据此推测什么”和“还有什么无法确认”，不以明暗或屏幕大小代替鉴定与测量。</li></ul>
      <h4>这组案例最值得辨析的差异</h4><p>{pairFocus(a.id, b.id)}</p>
      <h4>逐项细节对照</h4>
      <p className="sub">以下是依据已收录知识整理的观察方向，不是对两张图片逐区域识别后的结果。</p>
      {([['morphology', '形态与轮廓'], ['distribution', '分布与区域关系'], ['inspect', '具体观察步骤'], ['missing', '仍缺少的证据']] as const).map(([key, label]) => <section key={key} className="m4-knowledge-entry"><h4>{label}</h4><div className="m4-compare">{[a, b].map(item => <div key={item.id}><strong>{item.title}</strong><p>{comparisonDetails[item.id]?.[key] ?? '此案例的细节尚未整理，请核对来源资料。'}</p></div>)}</div></section>)}
      <h4>各自特征与观察重点</h4>
      <div className="m4-compare">{[a, b].map(item => <div key={item.id}><strong>{item.title}</strong>{forCase(item.id).map(entry => <div key={entry.id}><p>{entry.fact}</p><p className="sub">注意：{entry.caution}</p>{entry.sourceIds.map(id => <p key={id}><a href={references[id].url} target="_blank" rel="noreferrer">{references[id].title}</a></p>)}</div>)}</div>)}</div>
      <h4>观察条件与判断边界</h4><p>{a.title}：{a.conditions}</p><p>{b.title}：{b.conditions}</p>
      {electronMicroscopy && <p className="sub">此组合含电镜案例（具体方式见各图说明），不应把成像明暗与光学金相直接对应，也不能按屏幕尺寸比较组织大小。</p>}
      <p className="sub">{limits}</p>
      <h4>课堂追问</h4><p>哪些差异有资料支持，哪些还需要观察更多视野或核对制样记录？</p>
      <ol><li>每张图各选几个不同位置，分别写出形状、方向和分布；是否存在不能用同一句话概括的区域？</li><li>你写的共同点是材料知识上的共同点，还是这两张图实际可见的共同点？哪些尚未核实？</li><li>如果换一种成像方式或另一个观察方向，哪些视觉差异可能改变？哪些判断仍需要成分和工艺记录？</li></ol>
      <button className="chip" disabled={busy} onClick={() => {
        onSendMessage(`实验四案例对比讨论（只发送文字，未发送图片，不能声称已识图）。A：${a.title}，${sourceUrl(a)}，${a.conditions}。B：${b.title}，${sourceUrl(b)}，${b.conditions}。网络补充摘要，待教师审核：\n${referenceContext(a.id)}\n${referenceContext(b.id)}\n共同点：${common}。${limits} 请在课程知识边界内解释异同并追问判断依据；区分网络来源与教材，不生成评分、像素测量或虚构引用。`)
        setSent(true)
      }}>让 Agent 解释对比</button>
      {sent && <p role="status" className="sub">对比资料已发送到对话区，模型状态以全局提示为准。</p>}
    </>}
  </section>
}
