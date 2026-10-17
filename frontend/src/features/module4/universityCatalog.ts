export const universitySources = [
  { id: 'njtech', school: '南京工业大学', title: '实验二：铁碳合金平衡组织观察', url: 'https://clsy.njtech.edu.cn/__local/B/FB/8F/E021E79BD2E0611BB502C060ACF_F7223847_14FF2.pdf?e=.pdf', coverage: '讲义正文讨论碳钢、白口铸铁的平衡组织，涉及铁素体、渗碳体、珠光体和莱氏体。', requirement: '结合相图判断组织并绘图，记录成分、倍率与浸蚀剂，分析含碳量的影响。', limitation: '正文引用的试样附表未在可读内容中取得，不能据此编造完整试样牌号表。' },
  { id: 'csu', school: '中南大学', title: '典型金属材料金相组织的观察与分析实验', url: 'https://mse.csu.edu.cn/syjxzx/info/1032/1024.htm', coverage: '安排观察不同含碳量的7个编号Fe-C试样；原理部分另以Ag-Cu说明初晶与共晶。', requirement: '制备试样、观察组织、交换编号试样并描绘组织特征。', limitation: '网页未给出7个编号各自的完整材料表；Ag-Cu是原理示例，不能当成已经确认发放的观察试样。' },
  { id: 'nwpu', school: '西北工业大学', title: '材料科学基础实验课程教学大纲', url: 'https://cailiaosyjx.nwpu.edu.cn/info/1012/1132.htm', coverage: '分别开设二元合金平衡与不平衡组织、铁碳平衡组织、塑性变形与再结晶等实验。', requirement: '联系相图分析组织，记录原始数据，讨论成分、组织和性能。', limitation: '碳钢、铝片、铜、铅锡合金是整门课耗材清单；未给出它们与各观察实验的一一对应关系。' },
  { id: 'ysu', school: '燕山大学', title: '实验四：碳钢热处理后的显微组织观察', url: 'https://clsfzx.ysu.edu.cn/wlzy1/wlkc1/gfzclygczy/gfzclkxjc/sys_tgrclhdxwzzgc1/synrjbz.htm', coverage: '列出45钢及T12钢不同处理状态，包括退火、正火、淬火、回火、球化退火组织。', requirement: '先看整体再看局部，绘图并记录材料、处理状态、倍率和浸蚀剂。', limitation: '该校实验四是热处理组织，与本课程实验四不是同一实验；只作教师拓展目录，不导入工艺参数。' },
  { id: 'xsyu', school: '西安石油大学', title: '实验4：钢的整体热处理及其非平衡组织观察', url: 'https://clxysyjxzx.xsyu.edu.cn/info/1078/1193.htm', coverage: '以45钢进行淬火、回火和硬度测试，并观察典型非平衡组织标准试样。', requirement: '结合热处理记录与硬度数据讨论组织和性能变化。', limitation: '典型标准试样表为图片，尚未逐项核对，不补写其完整名单；与本课程实验四分开管理。' },
]

export const observationCatalog = [
  { id: 'ferrite', title: '铁素体与珠光体共存组织', category: '铁碳平衡组织', sources: ['njtech', 'csu'], status: '同主题补充', detail: '分别描述铁素体区域与珠光体区域，区分组织组成与相组成。', gap: '已有C35补充图，但不是这些学校的原始试样图。', caseId: 'c35' },
  { id: 'pearlite', title: '珠光体及其层片细节', category: '铁碳平衡组织', sources: ['njtech', 'csu'], status: '同主题补充', detail: '比较组织区域与内部层片两个层级，观察条件影响细节能否分辨。', gap: '已有SEM补充图，不等同于各校的光学观察条件。', caseId: 'pearlite-sem' },
  { id: 'cementite', title: '一次、二次渗碳体的形态与分布', category: '铁碳平衡组织', sources: ['njtech'], status: '同主题补充', detail: '讲义将条状一次渗碳体与沿珠光体边界分布的二次渗碳体区分讨论。', gap: '缺少授权且区域标注已核实的配套图片。', caseId: '' },
  { id: 'ledeburite', title: '白口铸铁与莱氏体', category: '铁碳平衡组织', sources: ['njtech'], status: '同主题补充', detail: '讨论莱氏体及不同共晶类别的分布差异；先明确温度状态，再写组织组成。', gap: '已有白口铸铁补充图，但不能确定其具体共晶类别。', caseId: 'white' },
  { id: 'binary', title: '二元合金：固溶体、次生组织与共晶', category: '二元合金', sources: ['nwpu'], status: '教师拓展', detail: '大纲设置平衡组织分析，要求联系二元相图理解组织特征。', gap: '具体观察合金、成分与图片未列出，不能代替本课铝硅合金案例。', caseId: '' },
  { id: 'agcu', title: 'Ag-Cu初晶与共晶原理示例', category: '二元合金', sources: ['csu'], status: '原理示例，非试样清单', detail: '网页用Ag-Cu解释初晶与共晶形态，实际发放内容明确列为Fe-C编号试样。', gap: '不是本课程已确认的观察内容，未纳入问答与练习。', caseId: '' },
  { id: 'normal', title: '45钢退火与正火组织', category: '热处理组织', sources: ['ysu'], status: '其他实验拓展', detail: '对照珠光体与铁素体、细珠光体与铁素体的组织描述。', gap: '缺少对应处理状态的授权图片；不能拿C35图片冒充45钢。', caseId: '' },
  { id: 'martensite', title: '淬火组织：马氏体及伴随组织', category: '热处理组织', sources: ['ysu'], status: '其他实验拓展', detail: '试样表包含不同淬火状态，伴随组织因状态而异，不能把淬火组织写成固定组合。', gap: '未导入处理参数或配套图片，不用于未知照片自动鉴定。', caseId: '' },
  { id: 'tempered', title: '45钢回火后的组织', category: '热处理组织', sources: ['ysu', 'xsyu'], status: '其他实验拓展', detail: '两校都安排回火状态讨论；应将组织观察与实际处理记录联系起来。', gap: '不同学校条件不能直接套用，教师确认前不纳入实验四标准题库。', caseId: '' },
  { id: 'spheroid', title: 'T12钢球化退火组织', category: '热处理组织', sources: ['ysu'], status: '其他实验拓展', detail: '试样表涉及铁素体与球状渗碳体，适合与片状珠光体作教学对照。', gap: '待补授权图片和本课程对应依据。', caseId: '' },
  { id: 'recrystal', title: '变形与再结晶组织', category: '变形组织', sources: ['nwpu'], status: '其他实验拓展', detail: '大纲要求讨论冷塑性变形及回复、再结晶后的组织变化。', gap: '属于独立实验，未确认具体观察试样，不自动扩入本课范围。', caseId: '' },
  { id: 'nonferrous', title: '铝片、铜与铅锡合金材料线索', category: '有色金属线索', sources: ['nwpu'], status: '仅课程耗材记录', detail: '这些材料出现在课程耗材表，不足以确定对应的组织、成分或处理状态。', gap: '不能据此声称该校指定观察黄铜、铝硅或某种铅锡组织。', caseId: '' },
]
