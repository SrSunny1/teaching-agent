/**
 * mistakeBook 插件的数据契约。
 * 与 backend/app/tools/mistake_book/__init__.py 的 artifact 一一对应。
 */

/** 错题根源的封闭集合（后端 ROOT_CAUSE_KINDS 同步维护） */
export const ROOT_CAUSE_KINDS = ['概念混淆', '公式误用', '模型理解偏差', '忽略边界条件', '计算失误', '其他'] as const

/** 一条错题条目（作业帮式五件套 + 出处） */
export interface MistakeEntry {
  id: string
  createdAt?: string
  /** 来源：手动录入 / 对话解析 / 内置题库 */
  source?: string
  category: string
  question: string
  studentAnswer: string
  rootCauseKind: string
  rootCause: string
  knowledgePoint?: string
  knowledgeRefs?: string[]
  correctAnswer: string
  reminders: string[]
}

/** extract 动作附带的出题素材（知识库原文片段） */
export interface ExtractCandidate {
  source: string
  experiment: string
  section: string
  text: string
  score: number
}

export interface MistakeBookArtifact {
  mode: 'bank' | 'record' | 'extract' | string
  entries: MistakeEntry[]
  total: number
  note?: string
  candidates?: ExtractCandidate[]
}
