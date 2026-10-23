import { useEffect, useState } from 'react'
import App from './App'
import './auth.css'
import { accountRequest, exportAccount, flushAccount, resetAccount, signIn, studentId } from '../lib/account'

export default function AuthGate() {
  const [user, setUser] = useState('')
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sync, setSync] = useState('已保存')
  const [changePassword, setChangePassword] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  useEffect(() => {
    const listener = (e: Event) => setSync((e as CustomEvent<string>).detail)
    const busyListener = (e: Event) => setChatBusy((e as CustomEvent<boolean>).detail)
    const unload = (e: BeforeUnloadEvent) => { if (user) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('account:sync', listener); window.addEventListener('beforeunload', unload)
    window.addEventListener('account:busy', busyListener)
    return () => { window.removeEventListener('account:sync', listener); window.removeEventListener('beforeunload', unload); window.removeEventListener('account:busy', busyListener) }
  }, [user])
  async function logout() {
    setBusy(true); setError('')
    try { await new Promise(resolve => setTimeout(resolve, 500)); await flushAccount(); await accountRequest('logout'); resetAccount(); setUser(''); setChangePassword(false) }
    catch (err) { setError(err instanceof Error ? err.message : '退出失败，请先导出备份') }
    finally { setBusy(false) }
  }
  const field = { display: 'grid', gap: 6, margin: '14px 0' }
  const input = { padding: 10, width: '100%', boxSizing: 'border-box' as const, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }
  if (user) return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-soft)' }}>
      <strong>账号：{user}</strong><span role="status">{sync}</span>
      <button className="chip" onClick={exportAccount}>导出个人记录备份</button>
      <button className="chip" disabled={busy || chatBusy} onClick={() => setChangePassword(!changePassword)}>修改密码</button>
      <button className="chip" disabled={busy || chatBusy} onClick={logout}>退出登录</button>
      {error && <span role="alert">{error}</span>}
    </header>
    {changePassword && <form style={{ padding: 16 }} onSubmit={async e => {
      e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true); setError('')
      try {
        if (fields.get('newPassword') !== fields.get('confirm')) throw new Error('两次新密码不一致')
        await new Promise(resolve => setTimeout(resolve, 500)); await flushAccount()
        await accountRequest('password', { oldPassword: fields.get('oldPassword'), newPassword: fields.get('newPassword') })
        resetAccount(); setUser(''); setChangePassword(false); setError('密码已修改，请重新登录')
      } catch (err) { setError(err instanceof Error ? err.message : '修改失败') } finally { setBusy(false) }
    }}>
      <label style={field}>原密码<input style={input} name="oldPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
      <label style={field}>新密码<input style={input} name="newPassword" type="password" autoComplete="new-password" required maxLength={128} /></label>
      <label style={field}>确认新密码<input style={input} name="confirm" type="password" autoComplete="new-password" required maxLength={128} /></label>
      <button className="chip" disabled={busy || chatBusy}>确认修改</button>
    </form>}
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {busy && <div style={{ position: 'absolute', inset: 0, zIndex: 9999, background: 'var(--bg-panel)' }} role="status">正在保存并退出当前会话…</div>}
      <App />
    </div>
  </div>
  return <main className="auth-page" data-theme="light">
    <img className="auth-background" src="https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=2200&q=85" alt="" referrerPolicy="no-referrer" />
    <header className="auth-brand"><img className="auth-brand-mark" src="/agent-logo.png" alt="" /><span>材料物理实验<span className="auth-brand-sub">教学 Agent</span></span></header>
    <form className="auth-form" onSubmit={async e => {
      e.preventDefault(); const fields = new FormData(e.currentTarget); setBusy(true); setError('')
      const id = String(fields.get('studentId')).trim(), password = String(fields.get('password'))
      try {
        if (register) {
          if (password !== fields.get('confirm')) throw new Error('两次密码不一致')
          await accountRequest('register', { studentId: id, password })
          setRegister(false); setError('注册成功，请登录'); return
        }
        await signIn(id, password); setUser(studentId); setSync('已保存')
      } catch (err) { setError(err instanceof Error ? err.message : '连接失败，请确认后端已启动') } finally { setBusy(false) }
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="auth-eyebrow">MATERIALS PHYSICS LAB</div>
          <h1>{register ? '创建学习账号' : '欢迎回到实验课堂'}</h1>
          <p className="auth-intro">材料物理实验教学 Agent</p>
        </div>
        <img
          src="/nailong/wave.gif"
          alt="奶龙招手欢迎"
          style={{ width: 68, height: 68, borderRadius: 14, objectFit: 'cover', flexShrink: 0, boxShadow: '0 6px 18px rgba(39,71,58,0.16)' }}
        />
      </div>
      <h2 className="auth-form-title">{register ? '学生注册' : '学生登录'}</h2>
      <label style={field}>账号（学号或姓名均可）<input style={input} name="studentId" autoComplete="username" required maxLength={64} /></label>
      <label style={field}>密码<input style={input} name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required maxLength={128} /></label>
      {register && <>
        <label style={field}>确认密码<input style={input} name="confirm" type="password" autoComplete="new-password" required maxLength={128} /></label>
      </>}
      <p className="auth-error" role="alert">{error}</p>
      <button className="auth-submit" disabled={busy}>{busy ? '处理中…' : register ? '创建账号' : '登录'}</button>
      <div className="auth-switch"><span>{register ? '已有学习账号？' : '第一次来到这里？'}</span><button type="button" disabled={busy} onClick={() => { setRegister(!register); setError('') }}>{register ? '返回登录' : '注册账号'}</button></div>
      <p className="auth-help">忘记密码请联系教师。登录有效期 8 小时，刷新后需重新登录。</p>
    </form>
    <footer className="auth-footer">材料科学 · 实验探索 · 自主学习</footer>
  </main>
}
