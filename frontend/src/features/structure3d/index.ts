import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {
  id: 'structure3d',
  title: '材料结构 3D 可视化',
  artifactTypes: ['structure3d'],
  order: 20,
  // 左栏点进来时用它渲染，方便你单独查看效果（画布会标注「预览数据」）。
  // 改 features/structure3d/preview.ts 就能换样例数据。
  preview,
  Component,
}

export default feature
