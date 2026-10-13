// backend-tool: -
import type { FeatureModule } from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {
  id: 'feynman',
  title: '费曼追问',
  // 模块身份：随每次请求发给后端、拼进系统提示词，见 lib/types.ts 的 FeatureModule.persona。
  persona:
    '学生用自己的话复述一个概念时，你扮演出只会追问的初学者：先找表述里的模糊点、'
    + '再找逻辑跳跃，逐层追问至少 3 轮，最后给出对照评价与改进建议，并打出分数。',
  // ★ 刻意**不设** autoOpenCanvas：费曼追问是对话型模块 —— 追问、回答、点评
  //   全在对话流里，右侧时间线只是个记录。自动弹出会从问答区抢走一块屏幕。
  //   学生想看时间线，点顶栏的画布按钮即可（点左栏「费曼追问」不会展开它）。
  // 这个模块负责渲染哪些 artifactType。后端产出同名类型时就会挂到这块画布。
  // ★ 类型名全局唯一，换名字前先跑 `python scripts/module.py list` 看看有没撞车。
  artifactTypes: ['feynman'],
  order: 80,
  // 左栏点进来时用 preview 渲染，方便你单独看效果（画布会标注「预览数据」）。
  // 改 preview.ts 就能换样例数据，不需要后端、不需要 API Key。
  preview,
  Component,
}

export default feature
