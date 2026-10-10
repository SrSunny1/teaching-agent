import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {
  id: 'knowledge',
  title: '知识库 · 术语库问答',
  artifactTypes: ['knowledge'],
  order: 10,
  // 左栏点进来时用它渲染，方便你单独查看效果（画布会标注「预览数据」）。
  // 改 features/knowledge/preview.ts 就能换样例数据。
  preview,
  Component,
}

export default feature
