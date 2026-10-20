import type { FeatureModule } from '../../lib/types'
import { Component } from './Component'
import { preview } from './preview'

/**
 * 【材料科学错题集】—— 同位阶画布插件（与费曼学习法、3D 可视化并列）。
 *
 * 定位：学生错题诊断、错误溯源、订正指导。
 * 交互范式参考作业帮错题解析：原题展示 → 学生错误答案 → 错误根因分析 →
 * 知识点溯源 → 正确解答 → 避坑总结。
 *
 * 数据源：内置教学大纲预存方向 + 扩充的材料科学高频易错点
 * （后端 mistake_book/bank.py，16 条覆盖 12 类）；支持手动录入与 RAG 自动抽取。
 * 错题根源封闭集合：概念混淆 / 公式误用 / 模型理解偏差 / 忽略边界条件 / 计算失误 / 其他。
 *
 * 启用/禁用：调试 tab 里的开关，或 localStorage 键 plugin.mistakeBook.enabled。
 * 禁用后左栏入口保留，画布显示「插件已禁用」卡片，可一键启用——避免入口消失后找不回来。
 */
const feature: FeatureModule = {
  id: 'mistakeBook',
  title: '材料科学错题集',
  order: 30,
  artifactTypes: ['mistakeBook'],
  autoOpenCanvas: true,
  persona: '材料科学错题集画布：负责错题诊断、错误溯源与订正指导，帮助学生从一道错题吃透一类考点',
  preview,
  Component,
}

// 禁用开关只影响画布内容（Component 内部渲染「已禁用」卡片），
// 模块本身始终注册——入口常驻左栏，不会出现禁用后找不到入口的死路。
export default feature
