// backend-tool: -
import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'
import { answerFromSources } from './chatKnowledge'

const feature: FeatureModule = {
  id: 'module4',
  title: '金相组织辨析',
  answerFromSources,
  persona: '负责实验四典型材料微观组织的观察、对比与辨析，引导学生说明形态、分布和判断依据。',
  autoOpenCanvas: true,
  // 这个模块负责渲染哪些 artifactType。后端产出同名类型时就会挂到这块画布。
  // ★ 类型名全局唯一，换名字前先跑 `python scripts/module.py list` 看看有没撞车。
  artifactTypes: ['module4'],
  order: 40,
  // 左栏点进来时用 preview 渲染，方便你单独看效果（画布会标注「预览数据」）。
  // 改 preview.ts 就能换样例数据，不需要后端、不需要 API Key。
  preview,
  Component,
}

export default feature
