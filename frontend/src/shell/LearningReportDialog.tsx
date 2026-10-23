import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReportConversation, LearningReport } from '../lib/learningReport'
import { buildLearningReport, reportText } from '../lib/learningReport'
import { studentId } from '../lib/account'

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
    const url = URL.createObjectURL(new Blob([`账号：${studentId}\n\n${reportText(report)}`], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = '学习评价报告.md'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return createPortal(<dialog ref={dialog} onCancel={onClose} aria-labelledby="learning-report-title"
    style={{ width: 'min(760px, calc(100vw - 32px))', maxHeight: '85vh', boxSizing: 'border-box', overflowY: 'auto', background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: 24, overflowWrap: 'anywhere' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2 id="learning-report-title" style={{ fontSize: 20, margin: 0 }}>个人学习评价报告</h2>
      <button className="chip" onClick={onClose}>关闭</button>
    </header>
    <p className="sub">账号：{studentId}。评价范围：当前账号所选会话中的作答与费曼点评。学习记录按账号保存在服务器，报告在本机生成。</p>
    <fieldset style={{ border: '1px solid var(--border-soft)', margin: '16px 0', maxHeight: 190, overflowY: 'auto' }}>
      <legend>选择本次学习记录</legend>
      {!conversations.length && <p>暂无会话记录，请先完成学习与作答。</p>}
      {conversations.map(c => {
        const first = c.messages.find(m => m.role === 'user')?.content.trim().replace(/\s+/g, ' ')
        return <label key={c.id} title={first && first !== c.title ? first : undefined} style={{ display: 'flex', alignItems: 'start', gap: 8, padding: '5px 0' }}>
          <input type="checkbox" checked={selected.includes(c.id)} onChange={e => change(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id))} />{c.title}
        </label>
      })}
    </fieldset>
    <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我确认选中的记录属于本次被评价的学生</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
      <button className="chip" disabled={!confirmed || !selected.length} onClick={() => setReport(buildLearningReport(conversations.filter(c => selected.includes(c.id))))}>生成评价报告</button>
      {report && <button className="chip" onClick={download}>导出报告</button>}
    </div>
    {report && <article aria-live="polite" style={{ borderTop: '1px solid var(--border-soft)', lineHeight: 1.8 }}>
      <h3>整体学习情况</h3><p>{report.overview}</p>
      <section aria-label="个人学习赋分">
        <h3>已评价知识点参考分</h3>
        <p style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>{report.referenceScore === null ? '暂无法评分' : `${report.referenceScore} / 100`}</p>
        <p>{report.referenceScore === null ? '需要同一知识点至少三条不同的有效作答、逐轮点评和已有模型总评。未评价不计为零分。' : `覆盖 ${new Set(report.assessments.map(a => a.topic)).size} 个知识点；同一知识点先取会话评分均值，再对知识点等权平均并四舍五入。不是整门课程的综合能力分。`}</p>
        {report.assessments.map((a, i) => <details key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
          <summary>{a.topic}：{a.score} / 100 · {a.source}</summary>
          <p>{a.reason}</p><strong>评分对应作答</strong>
          <ol>{a.answers.map((answer, index) => <li key={index}>{answer}</li>)}</ol>
        </details>)}
        <p className="sub">分数来自已有费曼模型总评，不根据聊天次数或正向标注比例计算。知识理解、分析应用、表达推理尚无独立量表数据，不拆分赋分；未覆盖知识点与实际操作能力未评价。</p>
      </section>
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
