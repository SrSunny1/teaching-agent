/**
 * 知识库RAG（module2）画布的数据形状（camelCase）。
 *
 * 与错题集、费曼追问同位阶的三栏画布工作台：
 * - 中栏负责向 Agent 提问（支持粘贴/上传金相图片）
 * - 右栏画布负责展示「原文证据溯源卡片」「15 份课程资料分组精读与定向提问」「补充资料与后台入口」
 */

export type KbCategory = '教材' | '课程讲义' | '教学大纲' | '劳动教育'

export const KB_CATEGORIES: readonly KbCategory[] = [
  '教材',
  '课程讲义',
  '教学大纲',
  '劳动教育',
] as const

export interface KbEvidenceItem {
  chunkId: string
  documentId: string
  documentTitle: string
  category: KbCategory
  section: string
  score: number
  content: string
  snippet: string
}

export interface KbDocItem {
  id: string
  title: string
  category: KbCategory
  source: string
  status: string
}

export interface KbArtifact {
  mode: 'search' | 'ask' | 'list' | 'get' | 'status' | 'add_text'
  query?: string
  answer?: string
  focusedDocIds?: string[]
  evidences: KbEvidenceItem[]
  documents: KbDocItem[]
  totalDocs: number
  baseUrl: string
  note?: string
}
