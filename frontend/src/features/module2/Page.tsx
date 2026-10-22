import { useEffect, useRef, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { isEnabled, setEnabled } from './enable'
import type { KbStatus } from './types'

const STYLE = `
.kb-root {
  height: 100%; display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  font-family: var(--font-sans); font-size: var(--fs-base);
}
.kb-bar {
  flex-shrink: 0; display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg-panel);
}
.kb-bar b { font-size: var(--fs-base); }
.kb-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
.kb-dot.connecting { background: var(--warn); }
.kb-dot.connected { background: var(--ok); }
.kb-dot.unreachable { background: var(--err); }
.kb-state { font-size: var(--fs-xs); color: var(--text-dim); }
.kb-bar .grow { flex: 1; }
.kb-url {
  font: var(--font-mono) var(--fs-xs)/1.4 var(--font-mono); font-size: var(--fs-xs);
  color: var(--text-dim); background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 3px 8px; width: 200px; outline: none;
}
.kb-url:focus { border-color: var(--accent); color: var(--text); }
.kb-btn {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-xs);
  color: var(--text-dim); background: var(--bg-elevated);
  border: 1px solid var(--border); border-radius: var(--r-sm); padding: 4px 10px;
}
.kb-btn:hover { color: var(--text); border-color: var(--border-strong); }
.kb-frame { flex: 1; width: 100%; border: none; background: #fff; }
.kb-veil {
  position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  background: var(--bg);
}
.kb-card {
  max-width: 460px; text-align: center; padding: 30px 34px;
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--r-lg);
}
.kb-card h2 { margin: 0 0 8px; font-size: var(--fs-lg); }
.kb-card p { margin: 6px 0; color: var(--text-dim); font-size: var(--fs-sm); line-height: 1.8; }
.kb-card code {
  font-family: var(--font-mono); font-size: var(--fs-xs);
  background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 1px 6px;
}
.kb-actions { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
.kb-actions .kb-btn { font-size: var(--fs-sm); padding: 7px 16px; }
.kb-pos { position: relative; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
`

/**
 * 服务地址：默认 127.0.0.1:8765（原 RAG 系统默认端口）。
 * 调试面板页签栏的地址框可直接改，存 localStorage。
 */
const URL_KEY = 'plugin.knowledgeBase.baseUrl'
const DEFAULT_URL = 'http://127.0.0.1:8765'

function readUrl(): string {
  try {
    return window.localStorage.getItem(URL_KEY) || DEFAULT_URL
  } catch {
    return DEFAULT_URL
  }
}

/**
 * 「知识库」整页 —— 直接内嵌用户已有的「材料科学RAG系统」Web 界面。
 *
 * 页面 1:1 呈现原系统（总览 / 文献库 / 智能问答 / 设置），不自建任何界面；
 * 顶栏只做三件事：显示连接状态、允许改服务地址（默认 8765）、新窗口打开。
 * 原 RAG 系统未启动时给出启动指引。
 */
export function Page(_props: FeatureProps) {
  // 禁用状态下整页渲染「已禁用」卡片（入口常驻左栏，可一键启用，不会找不回来）
  const [enabled, setEnabledState] = useState(isEnabled)
  const [url, setUrl] = useState(readUrl)
  const [draft, setDraft] = useState(url)
  const [status, setStatus] = useState<KbStatus>('connecting')
  const [reloadKey, setReloadKey] = useState(0)
  const timerRef = useRef<number | undefined>(undefined)

  const toggleEnabled = (v: boolean) => {
    setEnabled(v)
    setEnabledState(v)
  }

  const applyUrl = (next: string) => {
    const v = next.trim().replace(/\/+$/, '') || DEFAULT_URL
    setUrl(v)
    setDraft(v)
    try {
      window.localStorage.setItem(URL_KEY, v)
    } catch { /* 忽略 */ }
    setStatus('connecting')
    setReloadKey((k) => k + 1)
  }

  // 连接判定：onLoad 触发 = 已连上；超时未触发 = 判定未启动
  useEffect(() => {
    setStatus('connecting')
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setStatus((s) => (s === 'connecting' ? 'unreachable' : s))
    }, 6000)
    return () => window.clearTimeout(timerRef.current)
  }, [url, reloadKey])

  // 禁用视图放在所有 hooks 之后（保证 hooks 顺序一致），可一键启用，入口不丢
  if (!enabled) {
    return (
      <div className="kb-root">
        <style>{STYLE}</style>
        <div className="kb-pos" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="kb-card">
            <h2>插件已禁用</h2>
            <p>「知识库RAG」当前处于关闭状态，启用后即可 1:1 内嵌原「材料科学RAG系统」界面。</p>
            <div className="kb-actions">
              <button className="kb-btn" onClick={() => toggleEnabled(true)}>
                启用插件
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stateText = status === 'connected' ? '已连接' : status === 'connecting' ? '连接中…' : '服务未启动'

  return (
    <div className="kb-root">
      <style>{STYLE}</style>

      {/* 顶栏：状态 + 地址 + 新窗口打开 */}
      <div className="kb-bar">
        <b>知识库RAG</b>
        <span className={`kb-dot ${status}`} />
        <span className="kb-state">{stateText} · 材料科学 RAG 知识库</span>
        <span className="grow" />
        <input
          className="kb-url"
          value={draft}
          title="原 RAG 系统服务地址（Enter 应用）"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyUrl(draft)
          }}
          onBlur={() => draft.trim() !== url && applyUrl(draft)}
        />
        <button className="kb-btn" onClick={() => applyUrl(draft)}>
          连接
        </button>
        <button className="kb-btn" onClick={() => setReloadKey((k) => k + 1)}>
          刷新
        </button>
        <button className="kb-btn" onClick={() => window.open(url, '_blank')}>
          新窗口打开
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', cursor: 'pointer' }} title="关闭后本页显示「插件已禁用」卡片，左栏入口保留，随时可再启用">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
          插件
        </label>
      </div>

      {/* 原系统界面（1:1 内嵌） */}
      <div className="kb-pos">
        <iframe
          key={`${url}#${reloadKey}`}
          className="kb-frame"
          src={url}
          title="材料科学 RAG 知识库"
          onLoad={() => {
            window.clearTimeout(timerRef.current)
            setStatus('connected')
          }}
        />
        {status === 'connecting' && (
          <div className="kb-veil">
            <div className="kb-card">
              <h2>正在连接原 RAG 系统…</h2>
              <p>
                <code>{url}</code>
              </p>
            </div>
          </div>
        )}
        {status === 'unreachable' && (
          <div className="kb-veil">
            <div className="kb-card">
              <h2>知识库RAG 服务未启动</h2>
              <p>
                本页面直接呈现你已有的「材料科学RAG系统」界面，需要先把它启动起来：
              </p>
              <p>
                双击 <code>材料科学RAG系统/启动.bat</code>
                <br />
                或在该目录执行 <code>python start.py</code>（默认端口 8765）
              </p>
              <p>启动后点「重试」即可；如果服务不在默认地址，改上方地址框再连接。</p>
              <div className="kb-actions">
                <button className="kb-btn" onClick={() => setReloadKey((k) => k + 1)}>
                  重试
                </button>
                <button className="kb-btn" onClick={() => window.open(url, '_blank')}>
                  新窗口打开
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
