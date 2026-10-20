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

/** 课程讲义《金相试样制备》里的通用制样知识 —— 不属于某一张图，但每次讨论都用得上。 */
export interface CourseKnowledgeEntry {
  id: string
  title: string
  fact: string
  caution: string
  source: string
}

export const courseKnowledge: CourseKnowledgeEntry[] = [
  {
    id: 'prep-flow',
    title: '金相试样制备五步',
    fact: '取样 → 镶样 → 磨光 → 抛光 → 腐蚀。金相样品制备是金相分析的首要关键步骤，每一步都会影响后续观察和判断。',
    caution: '不能只记流程名称；每一步的目的、工具和常见缺陷才是报告要写清楚的内容。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'sampling',
    title: '取样与观察方向',
    fact: '截取方法取决于零件大小、性质、材质和热处理工艺；截取的试样必须保证观察面组织不受到影响。',
    caution: '取样位置和观察方向会影响结果，报告里应记录，不能只写“取了一块试样”。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'mounting',
    title: '镶样材料的选择',
    fact: '电木粉（热固性）不透明、较硬、不易倒角、耐腐蚀能力差；聚乙烯（热塑性）透明或半透明、耐腐蚀能力强，但质地较软。镶嵌加热温度 110—160℃。',
    caution: '镶样材料会影响边缘保护和腐蚀行为，不能默认所有试样都用同一种镶嵌方式。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'grinding',
    title: '磨光：粗磨与细磨',
    fact: '粗磨用砂轮、锉刀或水砂纸获得平整表面并倒角；细磨用由粗到细的各号金相砂纸消除磨痕。手工磨制以“单程单向”重复，换下一号砂纸时清除磨屑并把试样方向调转 90°。',
    caution: '用力过猛会导致表面不平整甚至损毁试样；换砂纸不转 90° 会留下难以判断的交叉磨痕。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'polishing',
    title: '抛光与抛光粉粒度',
    fact: '机械抛光用抛光布、抛光剂和抛光机，去除细磨留下的细微磨痕和变形层，获得镜面。抛光粉粒度有 W7、W5、W3 直到 W0.25，W7 表示最粗磨粒直径 7 μm。',
    caution: '抛光不足会保留磨痕，抛光过度可能破坏边缘或产生浮雕；不能只看“亮不亮”。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'etching',
    title: '腐蚀的目的与操作',
    fact: '腐蚀是为了显露显微组织。化学腐蚀有浸蚀法、滴蚀法和擦蚀法；腐蚀后用酒精清洗腐蚀面，再用吹风机吹干，避免残留腐蚀液继续腐蚀或留下水迹。',
    caution: '腐蚀过浅组织显示不全，腐蚀过深会出现假象；两者都属于不合格样品。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'etchants',
    title: '常用腐蚀剂怎么选',
    fact: '硝酸酒精溶液用于碳钢及低合金钢，显示铁素体晶界；苦味酸酒精溶液显示珠光体和碳化物；苦味酸钠溶液使渗碳体暗黑、铁素体不着色；王水用于高合金钢及不锈钢；氯化铁盐酸水溶液用于黄铜及青铜；氢氟酸水溶液用于铝及铝合金。',
    caution: '腐蚀剂按材料类型和状态选择，浓度、温度、时间都要按规程；不能拿一种腐蚀剂套所有材料。',
    source: '课程讲义《金相试样制备》· 实验三',
  },
  {
    id: 'defects',
    title: '常见制样缺陷与大纲易错点',
    fact: '常见问题包括试样划痕、腐蚀过浅或过深、磨光/抛光用力过猛导致表面不平整，以及混淆“相”和“微观组织”。',
    caution: '看到缺陷应先回到制备步骤找原因，不要直接把它解释成材料本身的组织特征。',
    source: '课程讲义《金相试样制备》· 实验三；教学大纲《材料物理专业实验2》',
  },
]

export const forCase = (caseId: string) => knowledge.filter(entry => entry.caseIds.includes(caseId))
export function referenceContext(caseId: string): string {
  const casePart = forCase(caseId).map(entry => `${entry.title}：${entry.fact} 注意：${entry.caution} 来源：${entry.sourceIds.map(id => `${references[id].title} ${references[id].url}`).join('；')}`).join('\n')
  const coursePart = courseKnowledge.map(entry => `${entry.title}：${entry.fact} 注意：${entry.caution} 来源：${entry.source}`).join('\n')
  return [casePart, coursePart].filter(Boolean).join('\n')
}
