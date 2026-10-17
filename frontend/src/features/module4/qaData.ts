export type QaEntry = { id: string; question: string; aliases: string[]; topics: string[]; answer: string; difficulty: string; sources: string[] }
export const qaSources: Record<string, { title: string; location: string; url?: string }> = {
  p2: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第2页 · 实验目的' },
  p5: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第5页 · 铁素体' },
  p6: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第6页 · 奥氏体' },
  p7: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第7页 · 珠光体' },
  p8: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第8页 · 莱氏体' },
  p19: { title: '教师课件：典型材料的微观组织观察.pptx', location: '第19页 · 实验报告要求' },
  steel: { title: '网络补充：剑桥大学 · Interpretation of steel microstructure', location: 'Pearlite；教学整理，待教师审核', url: 'https://www.phase-trans.msm.cam.ac.uk/2008/Steel_Microstructure/SM.html' },
  iron: { title: '网络补充：剑桥大学 · Cast Irons', location: 'Grey / Spheroidal graphite cast iron；教学整理，待教师审核', url: 'https://www.phase-trans.msm.cam.ac.uk/2001/adi/cast.iron.html' },
}
export const qaData: QaEntry[] = [
  { id: 'purpose', question: '实验四主要学什么？', aliases: ['实验目的是什么', '这个实验的目的'], topics: ['实验目的'], difficulty: '只记组织名称，忽略成分、工艺与性能的联系。', answer: '课件要求熟悉典型钢铁及有色金属的金相特征，理解显微组织与成分、加工工艺的关系，掌握显微镜使用与观察技巧，并分析微观结构对力学性能的影响。', sources: ['p2'] },
  { id: 'phase', question: '相组成物和组织组成物有什么区别？', aliases: ['相和组织有什么区别', '相与组织的区别'], topics: ['相组成物', '组织组成物', '珠光体'], difficulty: '把珠光体与铁素体当作同一层级的相。', answer: '以珠光体为例：它是组织组成物，内部包含铁素体和渗碳体两种相。因此“铁素体+珠光体”描述组织时，不代表只有铁素体和珠光体两种相。报告应分别写组织组成与相组成，再联系加工工艺讨论。', sources: ['p7', 'p19'] },
  { id: 'ferrite', question: '铁素体是什么，性能有什么特点？', aliases: ['什么是铁素体', '铁素体的性能'], topics: ['铁素体'], difficulty: '把显微镜下的颜色当作定义。', answer: '课件将铁素体定义为碳在α-Fe中的固溶体，晶格为体心立方。其塑性和韧性好，强度与硬度较低。定义基于相的结构和成分，不能仅凭照片中的明暗给任意区域定名。', sources: ['p5'] },
  { id: 'austenite', question: '奥氏体和铁素体有什么区别？', aliases: ['铁素体与奥氏体的区别', '什么是奥氏体'], topics: ['奥氏体', '铁素体'], difficulty: '混淆晶体结构与金相形貌。', answer: '课件中铁素体是碳在α-Fe中的固溶体，为体心立方；奥氏体是碳在γ-Fe中的间隙固溶体，为面心立方。奥氏体的碳溶解能力更大。描述组织时应结合材料与状态，不能只靠多边形晶粒作结论。', sources: ['p5', 'p6'] },
  { id: 'pearlite', question: '珠光体是单一相吗？', aliases: ['珠光体由什么组成', '珠光体是什么', '珠光体是不是一种相'], topics: ['珠光体', '单一相'], difficulty: '组织名称与相名称混淆。', answer: '不是。课件将珠光体表述为铁素体和渗碳体的机械混合物，典型形态是两者交替排列的片状组织。回答相组成时，应写铁素体与渗碳体。', sources: ['p7'] },
  { id: 'lamella', question: '看不到层片就不是珠光体吗？', aliases: ['珠光体为什么看不到条纹', '珠光体层片看不清'], topics: ['珠光体', '层片', '分辨率'], difficulty: '把未分辨出来等同于不存在。', answer: '不能这样判断。网络补充资料指出，细珠光体的层片可能超出光学显微镜的分辨能力；切面方向也影响表观层片间距。应结合成像条件与材料信息，不凭“没看见条纹”直接排除珠光体。', sources: ['steel'] },
  { id: 'pst', question: '珠光体、索氏体和屈氏体是什么关系？', aliases: ['索氏体和屈氏体的区别', 'P S T有什么区别'], topics: ['索氏体', '屈氏体', '珠光体'], difficulty: '忽略名称所处的转变语境。', answer: '在课件第7页讨论的过冷奥氏体转变语境中，三者本质相同，随转变温度降低，组织尺寸依次减小。这里不要直接套用到名称带“回火”的组织；该页没有展开回火组织的比较。', sources: ['p7'] },
  { id: 'spheroid', question: '珠光体一定是片状的吗？', aliases: ['什么是粒状珠光体', '球状珠光体是什么'], topics: ['珠光体', '球化退火', '粒状珠光体'], difficulty: '把典型形态当成唯一形态。', answer: '课件不仅介绍片状珠光体，还指出高碳钢经球化退火可得到球状珠光体，也称粒状珠光体。因此要同时记录形态和处理状态。', sources: ['p7'] },
  { id: 'ledeburite', question: '高温莱氏体和低温莱氏体有什么区别？', aliases: ['莱氏体由什么组成', '什么是变态莱氏体'], topics: ['莱氏体', '高温', '低温'], difficulty: '把高温相组成直接写进室温观察报告。', answer: '按课件第8页，高温莱氏体由奥氏体和渗碳体组成；727℃以下称低温莱氏体或变态莱氏体，课件写为珠光体与渗碳体的混合物。注意后一句是组织组成的描述，珠光体内部仍包含两种相。', sources: ['p8', 'p7'] },
  { id: 'ledeburite-property', question: '莱氏体的力学性能有什么特点？', aliases: ['莱氏体为什么脆', '莱氏体的性能'], topics: ['莱氏体', '性能'], difficulty: '将定性性能描述当作具体试样的实测值。', answer: '课件指出莱氏体的力学性能与渗碳体相似，硬度很高、塑性很差。这是定性知识，不能据此给照片中的未知试样填入具体硬度值；当前数据集没有该试样的硬度测试记录。', sources: ['p8'] },
  { id: 'graphite', question: '灰铸铁和球墨铸铁怎样比较？', aliases: ['灰铸铁与球墨铸铁的区别', '片状石墨和球状石墨'], topics: ['灰铸铁', '球墨铸铁', '石墨'], difficulty: '只比较石墨，忽略金属基体。', answer: '网络补充资料中，灰铸铁的石墨呈片状，球墨铸铁的石墨呈球状。比较时分别记录石墨形态与金属基体，不能由石墨形状直接推断基体全部是什么，也不能据此给出具体牌号或硬度。', sources: ['iron'] },
  { id: 'regions', question: '为什么要观察多个区域？', aliases: ['为什么至少画三个区域', '不同区域组织为什么不一样'], topics: ['区域', '三个', '取样'], difficulty: '把单一视场当成整个试样。', answer: '课件要求对选定试样至少画三个不同区域的组织特征，并分析差异原因，例如加工工艺、成分分布、取样及观察方位或角度。应先记录实际差异，再讨论可能原因，不把可能原因写成已经证实的结论。', sources: ['p19'] },
  { id: 'representative', question: '怎样选择有代表性的观察区域？', aliases: ['哪个区域最有代表性', '怎么选代表性视场'], topics: ['代表性', '区域', '视场'], difficulty: '选择最好看的图，而不是最能反映试样的图。', answer: '课件要求比较不同区域后，给出最能代表试样组织特征的区域、示意图和选择理由。教学建议：先并列记录各区域特征与差异，再说明所选区域代表了什么、未能覆盖什么；不能跳过比较就认定一个视场代表整体。', sources: ['p19'] },
  { id: 'report', question: '实验报告需要写哪些内容？', aliases: ['实验报告怎么写', '报告要求是什么'], topics: ['实验报告', '报告要求'], difficulty: '只贴照片，不分析形成原因。', answer: '按课件第19页：写目的与意义；绘制观察组织示意图，并对照相图解释形成原因；对选定试样比较至少三个区域、解释差异并选择代表区域；说明组织组成物与相组成物的关系及加工工艺影响；讨论组织控制的意义。应使用自己的观察记录，不虚构试样数据。', sources: ['p19'] },
]
const normalize = (text: string) => text.toLowerCase().replace(/[\s？?！!，,。.:：、]/g, '')
export function retrieveQa(query: string): { exact?: QaEntry; candidates: QaEntry[] } {
  const value = normalize(query)
  if (!value || value.length > 500) return { candidates: [] }
  const exact = qaData.find(entry => [entry.question, ...entry.aliases].some(q => normalize(q) === value))
  if (exact) return { exact, candidates: [] }
  // Topic overlap only suggests questions; it never certifies an answer to an unseen question.
  const candidates = qaData.map(entry => ({ entry, score: entry.topics.filter(t => value.includes(normalize(t))).length }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(item => item.entry)
  return { candidates }
}
