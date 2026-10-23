import type { FeatureModule } from '../../lib/types'
import { Component } from './Component'
import { preview } from './preview'

/**
 * 【知识库RAG】—— 三栏画布插件（课程文献与证据溯源工作台，与错题集、费曼追问同位阶）。
 *
 * - 中栏：沿用壳统一对话流（天然支持 📎 上传/粘贴金相图片、流式回答与工具调用卡片）
 * - 右栏画布（autoOpenCanvas: true）：
 *     1. 证据溯源卡片（每次 materials_rag 检索自动把命中段落、章节、相关度推送上画布）
 *     2. 课程资料库（15 份封闭课程语料分四类浏览，支持勾选 1~3 份讲义「锁定范围定向提问」）
 *     3. 补充资料入库与原 RAG 系统完整后台新窗口入口
 */
const feature: FeatureModule = {
  id: 'module2',
  title: '知识库RAG',
  order: 20,
  artifactTypes: ['module2'],
  autoOpenCanvas: true,
  persona:
    '课程知识库RAG精读与证据溯源助教：回答课程与实验问题时必须调用 materials_rag 检索教材、讲义、大纲或劳育原文，将证据卡片推上画布并逐条标注出处，检索不到就如实说明',
  preview,
  Component,
}

export default feature
