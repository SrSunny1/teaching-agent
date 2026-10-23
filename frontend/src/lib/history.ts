/**
 * 历史对话持久化（localStorage）。
 *
 * 数据模型：每个模块（含全局对话空间）可以有任意多条对话。
 *   - 已落库的对话 id：`conv:<moduleKey>:<rand>`，moduleKey 编码在 id 里，
 *     所以从任何一条 id 都能纯函数推出它属于哪个模块，不用查表。
 *   - 还没说过话的草稿：`draft:<moduleKey>`。不写库、不占列表 ——
 *     点「新对话」只切到一个空草稿，发出第一条消息时才 materialize 成 conv id。
 */
import type { Message } from './types'
import { accountStorage as localStorage } from './account'

/** 全局对话空间的 moduleKey（不占任何模块） */
export const GLOBAL_CONV = '__global__'

export interface ConvMeta {
  id: string
  moduleKey: string
  /** 展示用标题：第一条用户消息截断 */
  title: string
  updatedAt: number
}

export interface HistoryStore {
  /** conv id → 消息列表。draft id 永远不会出现在这里 */
  conversations: Record<string, Message[]>
  metas: ConvMeta[]
  /** 每个模块当前打开的对话 id（可能是 draft id） */
  currentConv: Record<string, string>
  activeConvKey: string
}

const STORE_KEY = 'mse-agent.history.v1'

export const isDraftId = (key: string) => key.startsWith('draft:')
export const draftId = (moduleKey: string) => `draft:${moduleKey}`
export const newConvId = (moduleKey: string) =>
  `conv:${moduleKey}:${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

/** conv/draft id → 所属模块 key */
export const moduleKeyOf = (key: string) => key.split(':')[1] || GLOBAL_CONV

/** 会话标题：第一条用户消息，截断到 24 字 */
export const convTitle = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, 24)
  return t || '新对话'
}

/** 打开某模块时进哪条对话：上次打开的 → 最新一条历史 → 空草稿 */
export function resolveConvKey(
  moduleKey: string,
  metas: ConvMeta[],
  currentConv: Record<string, string>,
): string {
  const cur = currentConv[moduleKey]
  if (cur && (isDraftId(cur) || metas.some((m) => m.id === cur))) return cur
  const latest = metas
    .filter((m) => m.moduleKey === moduleKey)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return latest?.id ?? draftId(moduleKey)
}

export function emptyStore(): HistoryStore {
  return { conversations: {}, metas: [], currentConv: {}, activeConvKey: draftId(GLOBAL_CONV) }
}

export function loadStore(): HistoryStore {
  const fallback = emptyStore()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<HistoryStore>

    const metas = (p.metas ?? []).filter(
      (m): m is ConvMeta =>
        Boolean(m) && typeof m.id === 'string' && typeof m.moduleKey === 'string',
    )
    // 上次退出时可能正在流式：streaming 标志一律清掉，否则历史消息会永远转圈
    const conversations: Record<string, Message[]> = {}
    for (const m of metas) {
      const msgs = p.conversations?.[m.id]
      if (Array.isArray(msgs)) {
        conversations[m.id] = msgs.map((msg) => ({ ...msg, streaming: false }))
      }
    }
    const validMetas = metas.filter((m) => conversations[m.id])
    const ids = new Set(validMetas.map((m) => m.id))

    const currentConv: Record<string, string> = {}
    for (const [k, v] of Object.entries(p.currentConv ?? {})) {
      if (typeof v === 'string' && (isDraftId(v) || ids.has(v))) currentConv[k] = v
    }
    const activeConvKey =
      typeof p.activeConvKey === 'string' && (isDraftId(p.activeConvKey) || ids.has(p.activeConvKey))
        ? p.activeConvKey
        : resolveConvKey(GLOBAL_CONV, validMetas, currentConv)

    return { conversations, metas: validMetas, currentConv, activeConvKey }
  } catch {
    return fallback
  }
}

export function saveStore(store: HistoryStore) {
  // draft 是瞬态，永不落库（它按定义是空的）
  const conversations = Object.fromEntries(
    Object.entries(store.conversations).filter(([k]) => !isDraftId(k)),
  )
  const data = { ...store, conversations }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data))
  } catch {
    //  quota 爆了最常见的原因是消息里的图片 data URL：剥掉 image 字段再试一次，
    //  历史文字保住、图片丢。再失败就放弃 —— 本轮历史留在内存里，不抛错打断应用。
    try {
      const stripped = Object.fromEntries(
        Object.entries(conversations).map(([k, msgs]) => [
          k,
          msgs.map((m) => (m.image ? { ...m, image: undefined } : m)),
        ]),
      )
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...data, conversations: stripped }))
    } catch {
      /* 存储满：静默跳过 */
    }
  }
}
