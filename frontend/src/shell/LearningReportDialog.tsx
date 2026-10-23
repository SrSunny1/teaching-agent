import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReportConversation, LearningReport } from '../lib/learningReport'
import { buildLearningReport, reportText } from '../lib/learningReport'

export default function LearningReportDialog({ conversations, currentId, onClose }: {
  conversations: ReportConversation[]; currentId: string; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<string[]>(conversations.some(c => c.id === currentId) ? [currentId] : [])
  const [confirmed, setConfirmed] = useState(false)
  const [report, setReport] = useState<LearningReport | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const change = (ids: string[]) => { setSelected(ids); setReport(null); setConfirmed(false) }
  function download() {
    if (!report) return
    const url = URL.createObjectURL(new Blob([reportText(report)], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = '学习评价报告.md'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return createPortal(<dialog ref={dialog} onCancel={onClose} aria-labelledby="learning-report-title"
    style={{ width: 'min(760px, calc(100vw - 32px))', maxHeight: '85vh', boxSizing: 'border-box', overflowY: 'auto', background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 24, overflowWrap: 'anywhere' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2 id="learning-report-title" style={{ fontSize: 20, margin: 0 }}>学习评价报告</h2>
      <button className="chip" onClick={onClose}>关闭</button>
    </header>
    <p className="sub">评价范围：所选会话中的作答与费曼点评。仅在本机整理，不上传记录。</p>
    <fieldset style={{ border: '1px solid var(--border-soft)', margin: '16px 0', maxHeight: 190, overflowY: 'auto' }}>
      <legend>选择本次学习记录</legend>
      {!conversations.length && <p>暂无会话记录，请先完成学习与作答。</p>}
      {conversations.map(c => <label key={c.id} style={{ display: 'flex', alignItems: 'start', gap: 8, padding: '5px 0' }}>
        <input type="checkbox" checked={selected.includes(c.id)} onChange={e => change(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id))} />{c.title}
      </label>)}
    </fieldset>
    <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我确认选中的记录属于本次被评价的学生</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
      <button className="chip" disabled={!confirmed || !selected.length} onClick={() => setReport(buildLearningReport(conversations.filter(c => selected.includes(c.id))))}>生成评价报告</button>
      {report && <button className="chip" onClick={download}>导出报告</button>}
    </div>
    {report && <article aria-live="polite" style={{ borderTop: '1px solid var(--border-soft)', lineHeight: 1.8 }}>
      <h3>整体学习情况</h3><p>{report.overview}</p>
      {([['表现较好的知识点', report.strengths], ['需要加强的具体问题', report.weaknesses]] as const).map(([title, items]) => <section key={title}>
        <h3>{title}</h3>{!items.length ? <p>证据不足，暂不判断；不代表已经全部掌握。</p> : items.map((f, i) => <div key={i} style={{ borderBottom: '1px solid var(--border-soft)', padding: '8px 0' }}>
          <strong>{f.topic}</strong><p>{f.comment}</p><blockquote>作答：“{f.evidence}”</blockquote><small>来源会话：{f.source} · 已有自动点评</small>
        </div>)}
      </section>)}
      <h3>学习建议</h3><ul>{report.suggestions.map((s,i) => <li key={i}>{s}</li>)}</ul>
      <p className="sub">未纳入独立练习、错题库、模拟回答及来源不明的旧记录。自动点评仅供学习参考，不是教师认定或正式成绩。</p>
    </article>}
  </dialog>, document.body)
}
