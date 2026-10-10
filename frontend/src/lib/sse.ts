/**
 * SSE 客户端。
 *
 * 用 fetch + ReadableStream 而不是 EventSource —— 因为我们要发 POST，
 * 且 EventSource 不支持自定义请求体。
 *
 * 契约见 README.md 的「三、契约」
 */
import type { Message, SSEEvent } from './types'

const ENDPOINT = '/api/chat'

export interface StreamOptions {
  sessionId: string
  messages: Message[]
  onEvent: (e: SSEEvent) => void
  signal?: AbortSignal
}

/** 把后端的一行 data: {...} 解析成 SSEEvent。解析失败返回 null（不中断整条流）。 */
function parseLine(line: string): SSEEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    return JSON.parse(payload) as SSEEvent
  } catch {
    console.warn('[sse] 无法解析的事件行:', trimmed)
    return null
  }
}

export async function streamChat(opts: StreamOptions): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: opts.sessionId,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`后端返回 ${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分隔事件；这里按行处理，够用且简单
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const evt = parseLine(line)
      if (evt) opts.onEvent(evt)
    }
  }
  if (buffer) {
    const evt = parseLine(buffer)
    if (evt) opts.onEvent(evt)
  }
}

export interface ProbeResult {
  /** 后端进程是否在跑 */
  ok: boolean
  /** 后端是否配了 API Key */
  hasKey: boolean
}

/**
 * 探测后端。
 * ★ 后端在跑但**没配 API Key** 时也算不可用 —— 否则前端会走真实流、然后每条消息都报错，
 *   队友 clone 下来忘了填 .env 就会以为项目坏了。这种情况自动退回 mock。
 */
export async function probeBackend(timeoutMs = 1500): Promise<ProbeResult> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { ok: false, hasKey: false }
    const data = (await res.json()) as { has_key?: boolean }
    return { ok: true, hasKey: Boolean(data?.has_key) }
  } catch {
    return { ok: false, hasKey: false }
  }
}
