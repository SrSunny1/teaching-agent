// backend-tool: query_graph
import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import Page from './Page'
import { preview } from './preview'

/**
 * 【课程图谱】—— 知识图谱 + 问题图谱双视图。
 *
 * 左栏点进来走**整页模式**：图谱占满中间与右侧（壳的对话栏让位），
 * 右上角保留「Agent 问答」抽屉 —— 图谱里的「让 Agent 讲解 / 深度解析」会自动打开它，
 * 能看到工具调用卡片与流式回答。全局对话里触发 query_graph 时仍走画布模式（Component）。
 *
 * 知识图谱：五级知识点（1 个课程核心 + 6 大星团 + 三级/四级/五级细分），
 * 3D 星团布局 + 深空星尘视差 + 轨道环，拖拽旋转、滚轮缩放、点击星点飞越并聚焦
 * 其关联网络（上级 / 下级 / 跨星团关联），可一键跳到关联的课程问题。
 *
 * 问题图谱：三层递进问题链（第一层级基础理解 → 第二层级实验表征 → 第三层级综合应用），
 * 贝塞尔连线束连接上下游，悬停/点击卡片高亮整条路径；问题卡片上的知识点 chip
 * 可一键跳回知识图谱并聚焦该节点。
 *
 * 数据全部来自课程讲义、教材与教学大纲（见 graphData.ts 顶部注释），不编造内容。
 */
const feature: FeatureModule = {
  id: 'module1',
  title: '课程图谱',
  order: 10,
  artifactTypes: ['module1'],
  autoOpenCanvas: true,
  persona: '「课程图谱」入口：负责课程知识图谱与三层问题图谱，帮助学生梳理知识点关联、按问题链定位学习路径',
  preview,
  Component,
  page: Page,
}

export default feature
