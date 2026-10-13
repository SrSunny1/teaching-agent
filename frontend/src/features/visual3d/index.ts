// backend-tool: -
import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {
  id: 'visual3d',
  title: '3D 可视化',
  // 模块身份：随每次请求发给后端、拼进系统提示词，见 lib/types.ts 的 FeatureModule.persona。
  persona:
    '把晶体结构讲成可旋转缩放的 3D 模型：晶胞、间隙、晶面晶向、密排面堆垛与位错。'
    + '学生问晶体结构时一律调 load_structure 取几何数据，不要凭记忆描述图形。',
  // 展示型模块：晶体用文字根本讲不清楚，画布就是交付物 —— 产出时自动展开右栏。
  autoOpenCanvas: true,
  // 这个模块负责渲染哪些 artifactType。后端产出同名类型时就会挂到这块画布。
  // ★ 类型名全局唯一，换名字前先跑 `python scripts/module.py list` 看看有没撞车。
  artifactTypes: ['visual3d'],
  order: 70,
  // 左栏点进来时用 preview 渲染，方便你单独看效果（画布会标注「预览数据」）。
  // 改 preview.ts 就能换样例数据，不需要后端、不需要 API Key。
  preview,
  Component,
}

export default feature
