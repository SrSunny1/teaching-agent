import { useState, type ComponentType } from 'react'
import { cases, sourceUrl, type Micrograph } from './cases'

const tasks = ['gray', 'ductile'] as const
const options = [
  { id: 'shape', label: '比较深色区域的形态与分布', valid: true, feedback: '形态与分布是有用的观察证据；仍需结合材料信息确认这些区域的性质。' },
  { id: 'black', label: '只要是黑色，就能确定组织名称', valid: false, feedback: '颜色本身不足以定名。应结合形态、材料信息和观察条件，不能把所有黑色区域等同。' },
  { id: 'matrix', label: '石墨形状确定了，基体组成也就确定了', valid: false, feedback: '石墨形态与金属基体要分别描述；不能仅由石墨形状推断全部基体组成。' },
  { id: 'limits', label: '缺少成分与处理记录时，保留牌号和性能判断', valid: true, feedback: '合理。组织照片不能独立提供确切牌号、处理参数或硬度数值。' },
]
export default function EvidencePractice({ Photo }: { Photo: ComponentType<{ item: Micrograph; blind?: boolean }> }) {
  const [task, setTask] = useState(0)
  const [stage, setStage] = useState(0)
  const [observation, setObservation] = useState('')
  const [judgment, setJudgment] = useState('')
  const [evidence, setEvidence] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [hint, setHint] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const item = cases.find(c => c.id === tasks[task])!
  const consistent = judgment === item.id
  const completeEvidence = options.every(option => evidence.includes(option.id) === option.valid)
  const reset = (next: number) => { setTask(next); setStage(0); setObservation(''); setJudgment(''); setEvidence([]); setSubmitted(false); setHint(false); setAttempt(0) }
  return <section className="m4-knowledge" aria-label="证据辨析训练">
    <h4>灰铸铁与球墨铸铁 · 证据辨析</h4>
    <p className="sub">{task === 0 ? '第一张：分步练习' : '第二张：换图练习（可能已在案例库见过）'} · 教学规则与来源标签待教师审核</p>
    <p>阶段 {stage + 1} / 3：{['观察形态', '判断与证据', '反馈与修正'][stage]}</p>
    <Photo key={`${item.id}:${submitted}`} item={item} blind={!submitted} />
    {stage === 0 && <>
      <label className="m4-field">观察记录：描述形状、分布，不急着命名<textarea value={observation} onChange={e => setObservation(e.target.value)} rows={3} /></label>
      <button className="chip" onClick={() => setHint(!hint)} aria-expanded={hint}>{hint ? '收起提示' : '需要观察提示'}</button>
      {hint && <p>选择几个不同位置，观察深色区域更接近细长片状、近圆形，还是不规则形状。不要只看一个区域；同时记录不能确定的地方。</p>}
      <div className="m4-actions"><button className="chip" disabled={!observation.trim()} onClick={() => setStage(1)}>进入判断</button></div>
    </>}
    {stage === 1 && <>
      <p><strong>我的观察：</strong>{observation}</p>
      <fieldset><legend>目前更支持哪种判断？</legend>{[['gray', '灰铸铁'], ['ductile', '球墨铸铁'], ['unknown', '证据不足，暂不能判断']].map(([id, label]) => <label className="m4-check" key={id}><input type="radio" name="m4-evidence-judgment" value={id} checked={judgment === id} onChange={() => setJudgment(id)} />{label}</label>)}</fieldset>
      <fieldset><legend>选择合理的辨析依据（可多选）</legend>{options.map(option => <label className="m4-check" key={option.id}><input type="checkbox" checked={evidence.includes(option.id)} onChange={e => setEvidence(e.target.checked ? [...evidence, option.id] : evidence.filter(id => id !== option.id))} />{option.label}</label>)}</fieldset>
      <div className="m4-actions"><button className="chip" onClick={() => setStage(0)}>修改观察</button><button className="chip" disabled={!judgment || !evidence.length} onClick={() => { setSubmitted(true); setStage(2); setAttempt(attempt + 1) }}>提交判断</button></div>
    </>}
    {stage === 2 && <div aria-live="polite">
      <h4>第 {attempt} 次反馈</h4>
      <p>{consistent ? '你的选择与图片来源标签一致，但还需要核对证据。' : judgment === 'unknown' ? '保留不确定性是合理选择。可对照来源标签，再说明你还缺什么信息。' : '你的选择与图片来源标签不同。请重新比较形态，并核对材料信息。'}</p>
      <p><strong>来源标签：</strong>{item.title} · <a href={sourceUrl(item)} target="_blank" rel="noreferrer">原始图片说明</a></p>
      <p><strong>你的观察：</strong>{observation}</p>
      <p className="sub">观察文字没有自动判分。以下只反馈所选辨析规则，不代表系统已经识别图像或验证了你的观察。</p>
      <ul>{options.map(option => <li key={option.id}><strong>{evidence.includes(option.id) ? '已选' : '未选'} · {option.label}</strong><p>{option.feedback}</p>{option.valid && !evidence.includes(option.id) && <p>建议补充这一项依据。</p>}</li>)}</ul>
      <p role="status">{completeEvidence ? '所选依据符合本单元参考规则。' : '依据选择仍有遗漏或过度推断，建议修正后重答。'} 这不是学习掌握度评定。</p>
      <p>知识依据：<a href="https://www.phase-trans.msm.cam.ac.uk/2001/adi/cast.iron.html" target="_blank" rel="noreferrer">剑桥大学 Cast Irons</a>；观察多区域的课程要求见教师课件第19页。</p>
      <div className="m4-actions"><button className="chip" onClick={() => { setStage(1); setSubmitted(false) }}>修改后重答</button>{task === 0 ? <button className="chip" onClick={() => reset(1)}>换图再练</button> : <button className="chip" onClick={() => reset(0)}>返回第一张</button>}</div>
    </div>}
    <p className="sub">本单元记录仅保留在当前页面；原有自由练习记录不受影响。</p>
  </section>
}
