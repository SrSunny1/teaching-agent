/**
 * ★ 全项目单点维护的类型真相源。
 * 这个文件与 backend/app/events.py、README.md 的「三、契约」 必须保持同步。
 * 改这里之前请在群里通知全员。
 */
import type { ComponentType } from 'react'

/* ─────────────── 对话与消息 ─────────────── */

export type Role = 'user' | 'assistant'

export interface ToolCall {
  id: string
  /** 工具名，如 search_knowledge */
  name: string
  /** 展示用文案，如「检索知识库 ·「250目筛分」」 */
  label: string
  args: Record<string, unknown>
  status: 'running' | 'ok' | 'error'
  summary?: string
  detail?: string
}

export interface Message {
  id: string
  role: Role
  /** 正文（Markdown） */
  content: string
  /** 思考过程，默认收起。仅 assistant 有 */
  thinking?: string
  /** 本条消息触发的工具调用，按序展示 */
  tools?: ToolCall[]
  /** 是否仍在流式生成 */
  streaming?: boolean
}

/* ─────────────── Artifact 协议 ─────────────── */

/**
 * ★ 开放的字符串类型，**故意不做成联合类型**。
 *
 * 原因：模块会换。如果这里写死 6 个名字，那每换一个模块都得改这个公共文件，
 * 而它是 🟡「先问再改」级别 —— 等于每次换模块都要全员协调一次，太笨重。
 *
 * 现在模块是**自注册**的：新建 `features/<名>/index.ts` 并声明 `artifactTypes`，
 * 就自动生效，**不用改任何公共文件**。
 *
 * 代价：拼写错误编译期查不出来。用两道运行时保障兜住：
 *   1. `registry.ts` 发现重名会 warn
 *   2. `ArtifactPanel` 收到没人认领的类型会显示「未实现」而不是白屏
 *   3. `scripts/check-boundaries.py` 静态检查重名
 */
export type ArtifactType = string

export interface Artifact {
  artifactType: ArtifactType
  data: unknown
}

export interface FeatureProps {
  /** 当前产物。null 表示用户刚切到该功能、还没有数据 */
  artifact: Artifact | null
  /** 功能组件想发消息给 Agent 时调用 */
  onSendMessage: (text: string) => void
  /** 功能组件想把新产物推给画布时调用 */
  onEmitArtifact: (type: ArtifactType, data: unknown) => void
}

/**
 * 每个 features/<name>/index.ts 必须默认导出这个结构。
 * id 必须与文件夹名一致；artifactTypes 全局唯一。
 */
export interface FeatureModule {
  id: string
  title: string
  artifactTypes: ArtifactType[]
  /** 左栏排序，小的在前 */
  order: number
  /**
   * ★ 开发预览用的样例数据。
   *
   * 在左栏点这个功能时，如果没有真实产物，壳就用这份数据渲染你的组件。
   * 这样每个人**不需要后端、不需要 API Key、不需要走 Agent 流程**，
   * 就能单独看到自己做出来的效果 —— 这是并行开发的前提。
   *
   * 放在 features/<你的功能>/preview.ts 里，壳会在画布上标注「预览数据」以示区分。
   * 不填则点进去是空状态。
   */
  preview?: unknown
  Component: ComponentType<FeatureProps>
}

/* ─────────────── SSE 事件（与后端一一对应） ─────────────── */

export type SSEEvent =
  | { type: 'thinking'; text: string }
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; name: string; label: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; summary: string; detail?: string }
  | { type: 'artifact'; artifactType: ArtifactType; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' }

export const SSE_EVENT_TYPES = [
  'thinking',
  'token',
  'tool_call',
  'tool_result',
  'artifact',
  'error',
  'done',
] as const

/* ─────────────── 会话状态 ─────────────── */

export type ConnectionState = 'mock' | 'connecting' | 'live' | 'error'

export interface SessionStats {
  /** 当前正在跑的工具名 */
  activeTool?: string
  /** 本次生成耗时 ms */
  elapsedMs?: number
  /** 粗略 token 估算 */
  tokens?: number
}
