import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import Page from './Page'
import preview from './preview'

/**
 * 整页模式的**最小示例**。
 *
 * 这个模块演示：模块怎么接管整个主区（自己的顶栏 / tab / 内容），
 * 同时用「智能问答」tab 保留「能看见 Agent 干活」的入口（硬规矩 3）。
 *
 * 它不是真实功能，内容是占位的。想用整页模式的模块照着这个骨架写即可。
 * 规矩见仓库根目录 AGENTS.md 的「整页模式」一节。
 */
const feature: FeatureModule = {
  id: 'pageDemo',
  title: '示例 · 整页模式',
  artifactTypes: ['pageDemo'],
  order: 90,
  preview,
  Component,
  page: Page,
}

export default feature
