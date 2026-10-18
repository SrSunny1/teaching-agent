import type { MistakeBookArtifact } from './types'

/**
 * 开发预览数据：不需要后端就能看到错题拆解卡片的完整样子。
 * 条目内容取自后端题库 bank-006（热处理 · 回火），字段结构一致。
 */
export const preview: MistakeBookArtifact = {
  mode: 'bank',
  total: 1,
  note: '预览数据 · 完整题库共 16 条，覆盖晶体学、热处理、相图、高分子等 12 类',
  entries: [
    {
      id: 'bank-006',
      createdAt: '2026-10-17 10:00:00',
      source: '内置题库',
      category: '热处理',
      question: '45 钢回火温度提高，硬度如何变化？说明三个回火温度区间的硬度范围。',
      studentAnswer: '回火温度越高，钢回火后的硬度越高，因为回火让组织更稳定。',
      rootCauseKind: '概念混淆',
      rootCause: '把「组织更稳定」误当成「硬度更高」。回火的本质是马氏体分解、碳化物析出并聚集长大，硬度随温度升高单调下降。',
      knowledgePoint: '回火温度—硬度关系与三类回火区间',
      knowledgeRefs: ['《教材》实验二十 · 金属材料的热处理'],
      correctAnswer:
        '回火温度越高硬度越低。45 钢：低温回火 150–250℃ 得 57–60 HRC（保持高硬度、去应力）；中温回火 350–500℃ 得 40–48 HRC（弹性极限高）；高温回火 500–600℃ 得 25–35 HRC（综合力学性能好，即调质）。> 出处：《教材》实验二十',
      reminders: [
        '「淬火硬化、回火软化」是主基调，回火选温度就是选硬度',
        '500℃ 附近教材的中温/高温区间有重叠，作答时注明口径',
      ],
    },
  ],
}
