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
  /**
   * 用户附带的图片（data URL）。目前只有 user 消息会带。
   * ★ 它**不会**直接给聊天模型看（模型是纯文本的）：`sse.ts` 把它随请求发到后端，
   *   `chat.py` 再把它填进 `diagnose_micrograph` 的工具参数。见那边的注释。
   */
  image?: string
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
  /**
   * 当前对话的消息（只读）。
   *
   * ★ 整页模式**必须**用它 —— 整页下壳不渲染对话栏，如果模块自己不画出来，
   *   用户就看不到 Agent 的回答、看不到工具调用卡片，等于「Agent 消失了」。
   *   这是硬规矩 3（必须留一个能看见 Agent 干活的入口）的实现手段。
   *   画布模式的模块一般用不到。
   */
  messages?: Message[]
  /** Agent 是否正在生成。整页模式用它显示「正在思考…」之类 */
  busy?: boolean
}

/**
 * 每个 features/<name>/index.ts 必须默认导出这个结构。
 * id 必须与文件夹名一致；artifactTypes 全局唯一。
 */
export interface FeatureModule {
  id: string
  title: string
  /** Optional deterministic source lookup before model/mock routing. Null preserves the existing route. */
  answerFromSources?: (query: string, offline: boolean) => { content: string; summary: string } | null

  /**
   * ★ 给 Agent 的模块身份说明（可选）—— 模块作者写「这个模块在教学上负责什么」。
   *
   * 它随每次请求发给后端，被拼进系统提示词。有它，Agent 在「费曼追问」模块里
   * 就知道自己当前位于该模块、负责什么，而不会只笼统回答「我是教学智能体」。
   * 不填也能用：Agent 仍会知道自己「正在【title】模块中对话」，只是说不出职责。
   *
   * ⚠️ 只写**职责 / 范围**，不要写「你有什么能力、什么权限」——
   *    知识边界、溯源要求、必须调工具这些由 backend/app/config.py 的 SYSTEM_PROMPT 授予，
   *    写在这里既不生效、还会和它打架。
   *
   * ⚠️ 技术约束：单行、≤100 字；不要出现 `id:` / `title:` / `order:` / `artifactTypes:`
   *    这些字样（scripts/ 下的脚本用正则扫 index.ts，取最左匹配，会被文案污染）；
   *    不要用英文撇号（脚手架模板用单引号字符串，会把字符串截断）。
   */
  persona?: string

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

  /**
   * ★ 产出 artifact 时，要不要**自动展开**右侧画布（可选，默认 false）。
   *
   * 判据只有一条：**这个模块的交付物是不是那块画布本身？**
   *
   * - **展示型模块 → true**：3D 晶体、图谱、图表、动画。这些东西用文字根本表达不了，
   *   画布弹出等于「你要看的东西来了」，是加分项。
   * - **对话型模块 → false**：追问、讲解、批改这类，内容全在对话流里，
   *   画布只是个附带记录。自动弹出等于从问答区抢走一块屏幕，纯干扰。
   *   （费曼追问就是典型：追问/回答/点评都在对话里，时间线画布属于冗余。
   *   学生想看，点顶栏的画布按钮即可 —— 点左栏模块是**不会**展开它的。）
   *
   * 不填 = false。**保守是刻意的** —— 一个模块擅自抢屏，比少弹一次烦人得多。
   */
  autoOpenCanvas?: boolean

  /**
   * 画布模式组件（默认）。渲染在右栏画布里，和对话流并排。
   */
  Component: ComponentType<FeatureProps>

  /**
   * ★ 整页模式组件（可选）。
   *
   * 填了它，点这个模块时**主区整个换成这个组件** —— 壳的顶栏、对话流、输入框全部让位。
   * 壳只保留左栏导航。模块依旧拿得到 onSendMessage，所以照样能驱动 Agent。
   *
   * ⚠️ **只在「确实需要另一种交互形态」时用**（管理型界面、多 tab 工作台、上传/索引/浏览…）。
   *    展示型的模块（3D、图谱、图表、动画）用 Component + 画布全屏就够了，**别开整页**。
   *
   * 四条硬规矩（详见根目录 AGENTS.md）：
   *   1. 左栏永远是壳的，模块不许改
   *   2. 配色/字体/圆角必须用 tokens.css 的变量，不许自造一套设计语言
   *   3. 必须留一个「返回对话」的出口
   *   4. 克制 —— 8 个模块里最多 2~3 个用整页
   */
  page?: ComponentType<FeatureProps>
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
