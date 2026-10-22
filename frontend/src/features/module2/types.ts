/**
 * 知识库（module2）插件的数据形状。
 * 本插件不再自建数据 —— 界面直接内嵌用户已有的「材料科学RAG系统」Web UI，
 * 这里的类型只描述画布预览用的元信息。
 */

export interface KbMeta {
  app: string
  version: string
  /** 原 RAG 系统服务地址（默认 http://127.0.0.1:8765） */
  baseUrl: string
  note: string
}

/** iframe 连接状态 */
export type KbStatus = 'connecting' | 'connected' | 'unreachable'
