import type { ConnectionState, SessionStats } from '../lib/types'

interface Props {
  connection: ConnectionState
  stats: SessionStats
  messageCount: number
}

const LABEL: Record<ConnectionState, string> = {
  mock: 'mock 模式',
  connecting: '连接中',
  live: '已连接后端',
  error: '连接异常',
}

export default function StatusBar({ connection, stats, messageCount }: Props) {
  const dotClass = connection === 'live' ? 'live' : connection === 'error' ? 'error' : 'mock'

  return (
    <div className="statusbar">
      <span className="status-item">
        <span className={`dot ${dotClass}`} />
        {LABEL[connection]}
      </span>

      {stats.activeTool && <span className="status-item">▸ {stats.activeTool}</span>}

      <span className="spacer" />

      <span className="status-item">{messageCount} 条消息</span>
      {stats.tokens !== undefined && <span className="status-item">≈{stats.tokens} tokens</span>}
      {stats.elapsedMs !== undefined && <span className="status-item">{(stats.elapsedMs / 1000).toFixed(1)}s</span>}
    </div>
  )
}
