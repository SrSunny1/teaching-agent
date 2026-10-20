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
  handout: { title: '课程讲义：金相试样制备', location: '取样、镶样、磨光、抛光、腐蚀；常用腐蚀剂表' },
  outline2: { title: '教学大纲：材料物理专业实验2', location: '学生容易犯的错误；评分标准' },
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
  { id: 'prep-flow', question: '金相试样制备的流程是什么？', aliases: ['金相制样步骤', '金相试样怎么做', '制样流程'], topics: ['金相试样制备', '制样流程', '取样', '镶样', '磨光', '抛光', '腐蚀'], difficulty: '只背五个步骤，说不清每一步的目的和常见缺陷。', answer: '课程讲义把流程概括为五步：取样 → 镶样 → 磨光 → 抛光 → 腐蚀。取样要保证观察面组织不受影响；镶样用于固定不规则或小尺寸试样；磨光分粗磨和细磨，逐步消除磨痕；抛光去除细磨留下的细微磨痕和变形层；腐蚀使显微组织显露出来。每一步都会影响最终观察结果。', sources: ['handout'] },
  { id: 'sampling', question: '金相取样时要注意什么？', aliases: ['取样位置怎么选', '取样方向有什么影响'], topics: ['取样', '观察方向', '代表性'], difficulty: '只取一块试样，不记录取样位置和方向。', answer: '截取方法取决于零件的大小、性质、材质和热处理工艺；无论用哪种方法，都必须保证观察面的组织不受到影响。取样位置和观察方向会影响看到什么，报告里应记录；不能把单一视场当成整个试样。', sources: ['handout', 'p19'] },
  { id: 'mounting', question: '电木粉和聚乙烯镶样有什么区别？', aliases: ['镶样材料怎么选', '电木粉镶嵌', '聚乙烯镶嵌'], topics: ['镶样', '电木粉', '聚乙烯', '镶嵌'], difficulty: '只记材料名称，不考虑透明性、硬度和耐腐蚀性对后续操作的影响。', answer: '电木粉是热固性塑料：不透明、比较硬、不易倒角、耐腐蚀能力差。聚乙烯是热塑性塑料：透明或半透明、耐腐蚀能力强，但质地较软。镶嵌时把试样和镶嵌粉末放入模具内加热加压成型，加热温度约 110—160℃。选择时要考虑试样形状、边缘保护和腐蚀条件。', sources: ['handout'] },
  { id: 'grinding', question: '磨光时为什么要换砂纸并转90度？', aliases: ['磨光为什么要转90度', '砂纸怎么换', '细磨步骤'], topics: ['磨光', '细磨', '砂纸', '90度'], difficulty: '不转方向，导致磨痕方向混乱、难以判断上一道磨痕是否消除。', answer: '细磨用由粗到细的各号金相砂纸，目的是消除粗磨留下的磨痕并得到平整光滑的磨面。手工磨制以“单程单向”重复；调换下一号更细的砂纸时，要清除试样上的磨屑和砂粒，并把试样的磨制方向调转 90°。这样新磨痕与旧磨痕方向垂直，便于判断上一道磨痕是否已经消除。', sources: ['handout'] },
  { id: 'polishing', question: '抛光粉 W7 是什么意思？', aliases: ['W7 抛光粉', '抛光粉粒度', '抛光剂粒度'], topics: ['抛光', '抛光粉', 'W7', '粒度'], difficulty: '把 W7 当成型号或浓度，不知道它表示磨粒直径。', answer: '抛光粉有不同粒度，分为 W7、W5、W3 直到 W0.25 等。W7 表示最粗磨粒直径为 7 μm，数字越小磨粒越细。机械抛光靠极细的抛光粉对磨面产生机械作用，消除细磨留下的细微磨痕和变形层，获得光滑镜面。', sources: ['handout'] },
  { id: 'etchant-select', question: '常用腐蚀剂怎么选？', aliases: ['腐蚀剂有哪些', '金相腐蚀剂怎么选', '腐蚀液配方'], topics: ['腐蚀剂', '硝酸酒精', '苦味酸', '王水', '氢氟酸'], difficulty: '拿一种腐蚀剂套所有材料，或把浓度/时间记混。', answer: '课程讲义列出常用腐蚀剂：硝酸酒精溶液用于碳钢及低合金钢，能清晰显示铁素体晶界；苦味酸酒精溶液显示珠光体和碳化物；苦味酸钠溶液使渗碳体呈暗黑色、铁素体不着色；混合酸酒精溶液用于高速钢淬火及回火后晶粒大小；王水用于各类高合金钢及不锈钢；氯化铁盐酸水溶液用于黄铜及青铜；氢氟酸水溶液用于铝及铝合金。应按材料类型和状态选择，并按规程控制浓度、温度和时间。', sources: ['handout'] },
  { id: 'nital', question: '硝酸酒精溶液用来显示什么？', aliases: ['硝酸酒精显示什么', '硝酸酒精腐蚀剂'], topics: ['硝酸酒精', '铁素体晶界', '碳钢'], difficulty: '把硝酸酒精当成通用腐蚀剂，忽略它主要针对碳钢和低合金钢。', answer: '硝酸酒精溶液由硝酸 1—5 mL 加酒精 100 mL 配成，室温腐蚀数秒；适用于碳钢及低合金钢，能清晰显示铁素体晶界。它不是所有材料都通用，其他材料要按讲义表格选择相应腐蚀剂。', sources: ['handout'] },
  { id: 'etching-depth', question: '腐蚀过浅或过深有什么影响？', aliases: ['腐蚀过度怎么办', '腐蚀太浅', '腐蚀时间怎么控制'], topics: ['腐蚀', '过浅', '过深', '不合格样品'], difficulty: '把腐蚀过深产生的假象当成真实组织。', answer: '腐蚀过浅时组织显示不全，晶界和组成物看不清；腐蚀过深时表面出现过度侵蚀甚至假象，容易把制样缺陷误判成组织特征。腐蚀后用酒精及时清洗并吹干，避免残留腐蚀液继续腐蚀；腐蚀过浅或过深都属于不合格样品，应重新制样或调整腐蚀条件。', sources: ['handout', 'outline2'] },
  { id: 'scratches', question: '金相试样为什么会出现划痕？', aliases: ['试样有划痕怎么办', '划痕是怎么来的'], topics: ['划痕', '磨光', '抛光', '制样缺陷'], difficulty: '只归因于砂纸太粗，不检查换砂纸是否清理、方向是否转90度、抛光是否充分。', answer: '划痕通常来自制样过程：粗磨/细磨时砂粒或磨屑没有清理干净、换砂纸没有把试样方向调转 90°、磨光或抛光用力过猛、抛光不足等。大纲也把“制备过程中忽视操作细节，试样出现划痕”列为学生常见错误。应先回到具体步骤找原因，不要把划痕解释成材料本身的组织。', sources: ['handout', 'outline2'] },
  { id: 'course-errors', question: '金相制样和观察的常见错误有哪些？', aliases: ['实验常见错误', '学生容易犯的错误', '制样易错点'], topics: ['常见错误', '制样', '腐蚀', '相与组织'], difficulty: '把易错点当成标准答案背，不结合自己的操作记录。', answer: '教学大纲列出的常见错误包括：混淆“相”和“微观组织”；制备过程中忽视操作细节，试样出现划痕；腐蚀过浅或过深；磨光、抛光用力过猛导致表面不平整甚至损毁；观察时混淆不同类型材料的组织与特征形貌；不能熟练应用“结构—制备工艺—性质—性能”的关系。回答时应结合具体步骤和观察记录，不要只报名称。', sources: ['outline2'] },
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
