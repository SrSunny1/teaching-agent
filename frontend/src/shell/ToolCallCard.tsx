import { useState } from 'react'
import type { ToolCall } from '../lib/types'
import { IconCheck, IconChevron, IconError, IconWrench } from './icons'

/**
 * 工具调用卡片 —— Agent 观感的灵魂。
 * 折叠态显示「在调什么 + 一句结果」，展开看原文/数据。
 */
export default function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(tool.detail)

  return (
    <div className={`tool-card ${tool.status}`}>
      <button
        className="tool-head"
        onClick={() => hasDetail && setOpen((v) => !v)}
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        <span className="tool-icon">
          {tool.status === 'running' ? (
            <span className="spinner" />
          ) : tool.status === 'error' ? (
            <span style={{ color: 'var(--err)', display: 'grid' }}>
              <IconError />
            </span>
          ) : (
            <span style={{ color: 'var(--text-faint)', display: 'grid' }}>
              <IconWrench />
            </span>
          )}
        </span>

        <span className="tool-name">{tool.label || tool.name}</span>

        {tool.summary && <span className="tool-summary">{tool.summary}</span>}

        {hasDetail && (
          <span className={`chev${open ? ' open' : ''}`} style={{ display: 'grid' }}>
            <IconChevron />
          </span>
        )}
        {!hasDetail && tool.status === 'ok' && (
          <span style={{ color: 'var(--ok)', display: 'grid', flexShrink: 0 }}>
            <IconCheck />
          </span>
        )}
      </button>

      {open && tool.detail && <div className="tool-detail">{tool.detail}</div>}
    </div>
  )
}
