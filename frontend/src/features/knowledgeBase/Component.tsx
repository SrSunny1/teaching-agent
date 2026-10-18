import { useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { isEnabled, setEnabled } from './enable'
import { preview } from './preview'

const STYLE = `
.kbc-root { font-family: var(--font-sans); font-size: var(--fs-base); color: var(--text); line-height: 1.65; }
.kbc-banner {
  padding: 10px 14px; border-radius: var(--r-md); margin-bottom: 14px;
  background: var(--accent-soft); border: 1px solid var(--accent-border);
}
.kbc-banner b { font-size: var(--fs-md); }
.kbc-banner .hint { font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px; }
.kbc-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 12px; }
.kbc-card h3 { margin: 0 0 6px; font-size: var(--fs-md); }
.kbc-card p { margin: 4px 0; font-size: var(--fs-sm); color: var(--text-dim); }
.kbc-card code { font-family: var(--font-mono); font-size: var(--fs-xs); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 1px 6px; }
.kbc-btn {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-sm); font-weight: 600;
  color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent-border);
  border-radius: var(--r-md); padding: 7px 14px;
}
.kbc-btn.plain { color: var(--text-dim); background: var(--bg-elevated); border-color: var(--border); }
.kbc-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
`

/**
 * 画布版：知识库的说明与快捷入口。
 * 完整界面（总览/文献库/智能问答/设置）在左栏「构建你的知识库」整页里 1:1 内嵌。
 */
export function Component({ onSendMessage }: FeatureProps) {
  // 禁用时画布显示「已禁用」卡片，左栏入口保留，可一键启用
  const [enabled, setEnabledState] = useState(isEnabled)

  if (!enabled) {
    return (
      <div className="kbc-root">
        <style>{STYLE}</style>
        <div className="kbc-card" style={{ textAlign: 'center' }}>
          <h3>插件已禁用</h3>
          <p>「构建你的知识库」当前处于关闭状态。</p>
          <div className="kbc-row" style={{ justifyContent: 'center' }}>
            <button
              className="kbc-btn"
              onClick={() => {
                setEnabled(true)
                setEnabledState(true)
              }}
            >
              启用插件
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="kbc-root">
      <style>{STYLE}</style>
      <div className="kbc-banner">
        <b>材料科学 RAG 知识库</b>
        <div className="hint">本插件直接接入用户已有的原 RAG 系统，不自建界面 · 服务地址 {preview.baseUrl}</div>
      </div>

      <div className="kbc-card">
        <h3>完整界面在整页模式</h3>
        <p>总览、文献库、智能问答、设置四个页面全部由原系统提供，点击左栏「构建你的知识库」即可进入。</p>
        <p>
          服务未启动时：双击 <code>材料科学RAG系统/启动.bat</code> 或在该目录执行 <code>python start.py</code>。
        </p>
        <div className="kbc-row">
          <button className="kbc-btn" onClick={() => window.open(preview.baseUrl, '_blank')}>
            新窗口打开原系统
          </button>
        </div>
      </div>

      <div className="kbc-card">
        <h3>在对话里用知识库</h3>
        <p>Agent 已接入原系统的检索与问答 API，可以直接让它查资料、答问题、入文献。</p>
        <div className="kbc-row">
          <button className="kbc-btn plain" onClick={() => onSendMessage('查一下知识库：高熵合金的主要强化机制有哪些？')}>
            查知识库：高熵合金强化机制
          </button>
          <button className="kbc-btn plain" onClick={() => onSendMessage('列出知识库里现在有哪些文献。')}>
            列出知识库文献
          </button>
          <button className="kbc-btn plain" onClick={() => onSendMessage('看一下知识库服务现在的能力和规模。')}>
            知识库状态
          </button>
        </div>
      </div>
    </div>
  )
}
