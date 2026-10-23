import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { accountRequest, studentId } from '../lib/account'

interface FeedbackItem {
  id: number
  studentId: string
  content: string
  context: string
  time: number
}

const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function FeedbackDialog({ context, onClose }: { context: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [content, setContent] = useState('')
  const [ctx, setCtx] = useState(context)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [mine, setMine] = useState<FeedbackItem[]>([])

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const loadMine = async () => {
    try {
      const res = await accountRequest('feedback', undefined, 'GET')
      const items = (res.items ?? []) as FeedbackItem[]
      setMine(items.filter((f) => f.studentId === studentId))
    } catch {
      /* 拉不到就不显示历史，不影响提交 */
    }
  }
  useEffect(() => {
    void loadMine()
  }, [])

  const submit = async () => {
    const body = content.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    try {
      await accountRequest('feedback', { content: body, context: ctx.trim() })
      setContent('')
      setSent(true)
      await loadMine()
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="feedback-title"
      style={{
        width: 'min(560px, calc(100vw - 32px))',
        maxHeight: '85vh',
        boxSizing: 'border-box',
        overflowY: 'auto',
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        border: '1px solid var(--border-soft)',
        borderRadius: 8,
        padding: 24,
        overflowWrap: 'anywhere',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 id="feedback-title" style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/nailong/cute.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span>意见反馈</span>
        </h2>
        <button className="chip" onClick={onClose}>
          关闭
        </button>
      </header>
      <p className="sub">
        使用中遇到的任何问题、建议或想要的功能都可以写下来，会连同你的账号（{studentId}）一起提交给教师与开发者，用于改进教学 Agent。
      </p>

      <label style={{ display: 'grid', gap: 6, margin: '14px 0 8px', fontSize: 13, fontWeight: 550 }}>
        反馈位置（自动带入当前页面，可修改）
        <input
          value={ctx}
          onChange={(e) => setCtx(e.target.value)}
          maxLength={200}
          style={{ padding: 10, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6, margin: '0 0 8px', fontSize: 13, fontWeight: 550 }}>
        意见或建议
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="例如：知识库检索「淬火」时找不到讲义里那段话；建议错题集支持按实验分类筛选……"
          style={{
            padding: 10,
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            font: 'inherit',
          }}
        />
      </label>
      {error && <p role="alert" style={{ color: 'var(--err)', fontSize: 13, margin: '8px 0' }}>{error}</p>}
      {sent && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', padding: '8px 12px', borderRadius: 8, background: 'var(--ok-soft)', color: 'var(--ok)', fontSize: 13 }}>
          <img src="/nailong/received.webp" alt="收到" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />
          <span>奶龙已收到你的反馈，感谢帮我们变得更好！</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 4px' }}>
        <button className="chip" disabled={busy || !content.trim()} onClick={() => void submit()}>
          {busy ? '提交中…' : '提交反馈'}
        </button>
      </div>

      {mine.length > 0 && (
        <section style={{ borderTop: '1px solid var(--border-soft)', marginTop: 14, paddingTop: 10 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>我最近提交的反馈（{mine.length}）</h3>
          {mine.slice(0, 8).map((f) => (
            <div key={f.id} style={{ padding: '7px 0', borderBottom: '1px dashed var(--border-soft)', fontSize: 13 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{f.content}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
                {fmtTime(f.time)}
                {f.context ? ` · ${f.context}` : ''}
              </div>
            </div>
          ))}
        </section>
      )}
    </dialog>,
    document.body,
  )
}
