import type { KbMeta } from './types'

/** 画布预览用的元信息样例（真实状态以运行中的原 RAG 系统为准） */
export const preview: KbMeta = {
  app: '材料科学 RAG 知识库',
  version: '1.0.0',
  baseUrl: 'http://127.0.0.1:8765',
  note: '预览数据 · 完整界面（总览/文献库/智能问答/设置）在左栏「知识库」整页中',
}
