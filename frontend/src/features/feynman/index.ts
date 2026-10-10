import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {
  id: 'feynman',
  title: '费曼追问',
  artifactTypes: ['feynman'],
  order: 30,
  // 左栏点进来时用它渲染，方便你单独查看效果（画布会标注「预览数据」）。
  // 改 features/feynman/preview.ts 就能换样例数据。
  preview,
  Component,
}

export default feature
