import { cases, sourceUrl } from './cases'
import { additionalCases, additionalDetails, teachingSources } from './additionalCases'
export const references: Record<string, { title: string; url: string; section: string }> = {
  ...teachingSources,
  ...Object.fromEntries(additionalCases.map(item => [item.id, { title: `${item.title} · 图片原始说明`, url: sourceUrl(item), section: 'Summary / Licensing；外部图片，不是高校课堂原始试样' }])),
  spheroid: { title: '球化珠光体图片作者说明', url: sourceUrl(cases.find(c => c.id === 'spheroid')!), section: 'Summary / Licensing' },
  alsi: { title: '铝硅合金图片作者说明', url: sourceUrl(cases.find(c => c.id === 'alsi')!), section: 'Summary / Licensing' },
  al6061: { title: '6061铝合金图片作者说明', url: sourceUrl(cases.find(c => c.id === 'al6061')!), section: 'Summary / Licensing' },
  brass: { title: '黄铜图片作者说明', url: sourceUrl(cases.find(c => c.id === 'brass')!), section: 'Summary / File history：处理状态冲突' },
  steel: { title: '剑桥大学 · 钢铁显微组织解读', url: 'https://www.phase-trans.msm.cam.ac.uk/2008/Steel_Microstructure/SM.html', section: 'Phase Diagram / Ferrite / Pearlite' },
  iron: { title: '剑桥大学 · Cast Irons', url: 'https://www.phase-trans.msm.cam.ac.uk/2001/adi/cast.iron.html', section: 'Grey / Spheroidal Graphite / Blackheart' },
  atlas: { title: '马德里康普顿斯大学 · 铸铁图谱', url: 'https://www.ucm.es/metallographicatlas/cast_irons', section: '四类铸铁分类；原站 CC BY-NC-SA 4.0' },
  stainless: { title: 'Struers · 不锈钢金相', url: 'https://www.struers.com/en/Knowledge/Materials/Stainless-Steel', section: 'Preparation / Interpreting microstructures' },
} as const

export interface KnowledgeEntry {
  id: string
  caseIds: string[]
  title: string
  fact: string
  caution: string
  question: string
  discussion: string
  sourceIds: (keyof typeof references)[]
}

// General reference facts, not diagnoses of the bundled images or course answers.
export const knowledge: KnowledgeEntry[] = [
  ...additionalCases.map(item => {
    const detail = additionalDetails[item.id]
    return { id: item.id, caseIds: [item.id], title: item.title, fact: detail.fact, caution: detail.missing, question: item.question, discussion: `${detail.inspect} ${item.conditions}`, sourceIds: [item.id, detail.teaching] }
  }),
  ...(['spheroid', 'alsi', 'al6061', 'brass'] as const).map(id => { const item = cases.find(c => c.id === id)!; return { id, caseIds: [id], title: item.title, fact: item.conditions, caution: '来源标签不是对每一个区域的鉴定，不能由颜色确定相组成或测量硬度。', question: item.question, discussion: '先描述轮廓和分布，再列出需要核对的成分、工艺与成像条件。', sourceIds: [id] } }),
  { id: 'ferrite', caseIds: ['c35'], title: '铁素体：相与组织区域', fact: '铁素体是体心立方结构的相。铁素体与珠光体共存时，要区分先共析铁素体区域与珠光体内部的铁素体。', caution: '不能把所有亮区都直接命名为铁素体，须结合材料与观察条件。', question: '铁素体是否只存在于珠光体之外？', discussion: '先区分相和组织组成物，再讨论珠光体的内部组成。', sourceIds: ['steel'] },
  { id: 'pearlite', caseIds: ['c35', 'pearlite-sem'], title: '珠光体：层片与分辨率', fact: '珠光体由铁素体和渗碳体组成，不是单一相。细层片未必能被光学显微镜分辨，截面方向也影响表观层片间距。', caution: '未见条纹不等于没有珠光体，不同成像方式的明暗不能直接对应。', question: '为什么有时能看见层片，有时只见暗区？', discussion: '考虑分辨率和截面方向，但不能仅凭亮暗判断未知组织。', sourceIds: ['steel'] },
  { id: 'austenite', caseIds: ['austenite'], title: '奥氏体：晶内线条', fact: '奥氏体不锈钢晶粒中可能出现孪晶。制样造成的变形和划痕也会影响显微观察。', caution: '并非所有晶内直线都是孪晶，304不锈钢不能代替普通碳钢室温案例。', question: '看到线条时还应核对什么？', discussion: '记录线条与晶界的关系，核对制样、材料状态及腐蚀条件。', sourceIds: ['stainless'] },
  { id: 'gray', caseIds: ['gray'], title: '灰铸铁：石墨与基体', fact: '灰铸铁具有片状石墨，金属基体可随状态而变化。', caution: '看到片状石墨，不能就认定基体全部为珠光体。', question: '怎样分别描述石墨和基体？', discussion: '分别记录石墨形态、分布与基体特征，列出未确认的组成。', sourceIds: ['iron'] },
  { id: 'ductile', caseIds: ['ductile'], title: '球墨铸铁：基体并不固定', fact: '球墨铸铁具有球状石墨；资料包含珠光体基体和铁素体、珠光体共存的案例。', caution: '近圆形深色区域不能独立证明材料牌号或性能。', question: '同样是球墨铸铁，基体能否不同？', discussion: '可以，石墨形态和基体组成需要分别描述。', sourceIds: ['iron', 'atlas'] },
  { id: 'malleable', caseIds: ['malleable'], title: '可锻铸铁：结合形成过程', fact: '可锻铸铁可由白口铸铁经退火形成，渗碳体分解后产生不规则团状石墨。', caution: '不要仅凭一个近圆形区域区分可锻铸铁与球墨铸铁。', question: '形态接近时为什么需要工艺记录？', discussion: '形态不是完整工艺证据，要结合多个区域和处理记录。', sourceIds: ['atlas'] },
  { id: 'white', caseIds: ['white'], title: '白口铸铁与莱氏体', fact: '白口铸铁中的碳主要以渗碳体形式存在。莱氏体形成时由奥氏体和渗碳体构成，冷却后其中奥氏体可转变为珠光体。', caution: '白口指断口特征，并非显微图整体发白；高温与室温组织不能混写。', question: '描述莱氏体为什么需要交代状态？', discussion: '区分形成时与冷却后的组成；缺少成分信息时，不判断具体共晶类别。', sourceIds: ['atlas'] },
]
export const forCase = (caseId: string) => knowledge.filter(entry => entry.caseIds.includes(caseId))
export function referenceContext(caseId: string): string {
  return forCase(caseId).map(entry => `${entry.title}：${entry.fact} 注意：${entry.caution} 来源：${entry.sourceIds.map(id => `${references[id].title} ${references[id].url}`).join('；')}`).join('\n')
}
