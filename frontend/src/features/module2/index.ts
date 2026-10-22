import type { FeatureModule } from '../../lib/types'
import { Component } from './Component'
import { Page } from './Page'
import { preview } from './preview'

/**
 * 【知识库RAG】—— 可点击块插件（RAG 接入模块）。
 *
 * 左栏入口点击后整页 1:1 内嵌用户已有的「材料科学RAG系统」Web 界面
 * （总览 / 文献库 / 智能问答 / 设置），不自建界面、不改原系统。
 * 后端 materials_rag 工具按原系统 sdk/agent_tools.json 的定义包装其 HTTP API，
 * 供教学智能体检索 / 问答 / 入库；与原系统共用同一套 API，无独立鉴权。
 *
 * 原 RAG 服务默认 http://127.0.0.1:8765（启动：材料科学RAG系统/启动.bat）。
 * 启用/禁用：顶栏「插件」开关，或 localStorage 键 plugin.knowledgeBase.enabled。
 * 禁用后左栏入口保留，页面显示「插件已禁用」卡片，可一键启用——避免入口消失后找不回来。
 */
const feature: FeatureModule = {
  id: 'module2',
  title: '知识库RAG',
  order: 20,
  artifactTypes: ['module2'],
  autoOpenCanvas: false,
  persona: '「知识库RAG」入口：负责接入材料科学 RAG 知识库，检索答疑依据证据并标注出处，检索不到就明确说明',
  preview,
  Component,
  page: Page,
}

// 禁用开关只影响页面内容（Page/Component 内部渲染「已禁用」卡片），
// 模块本身始终注册——入口常驻左栏，不会出现禁用后找不到入口的死路。
export default feature
