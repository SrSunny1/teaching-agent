/**
 * 模块1 · 课程图谱数据集（真 3D 星系知识图谱 + 三层递进问题图谱）。
 *
 * 数据全部提炼自本仓库与知识库的权威课程资料，严禁编造：
 *   - 《材料物理专业实验讲义 / 教材》（郭永利，实验一/二/三/四/十/十二/二十）
 *   - `backend/knowledge/raw/课程讲义/01~06-*.md`
 *   - `backend/knowledge/raw/教学大纲/01~02-*.md`
 *
 * 知识结构（五级星系体系，6 大二级星系团 × 每团 4 个三级专题恒星 × 细分四/五级卫星）：
 *   0 晶体结构与缺陷（实验一）
 *   1 凝固与结晶（实验二）
 *   2 相图与相变（实验四 / 二十）
 *   3 显微组织表征（实验三 / 四）
 *   4 金相制样与热处理工艺（实验三 / 二十）
 *   5 力学·热学·电学性能测试（实验十 / 十二 / 二十）
 */

export type Level = 1 | 2 | 3 | 4 | 5
export type Bloom = '记忆' | '理解' | '应用' | '分析' | '创造'
/** 封闭集合（可选标注）：成分 / 相 / 组织 / 性能 / 工艺 / 缺陷 */
export type NodeKind = '成分' | '相' | '组织' | '性能' | '工艺' | '缺陷'
/** 封闭集合：前置依赖 / 因果 / 对比 / 组成 */
export type Relation = '前置依赖' | '因果' | '对比' | '组成'

export interface KnowledgeNode {
  id: string
  /** 星球短标签（3D 空间悬浮名，精炼不冗余） */
  label: string
  /** 完整学术标题（详情舱展示） */
  fullTitle?: string
  level: Level
  /** 所属星系团编号 0~5 */
  sector: number
  parent?: string
  kind?: NodeKind
  desc: string
  refs: string[]
}

export interface KnowledgeEdge {
  source: string
  target: string
  relation: Relation
}

export interface QuestionNode {
  id: string
  tier: 1 | 2 | 3
  title: string
  bloom: Bloom
  knowledgeIds: string[]
  answer: string[]
  blindSpot?: string
  refs: string[]
}

export interface QuestionEdge {
  source: string
  target: string
  relation: Relation
}

/**
 * 六大星系团：在三维空间中按立体六芒（正八面体错位）分布，
 * 彻底摆脱平面拥挤，每个星系团拥有独立的 3D 坐标中心与法向倾角。
 */
export const SECTORS = [
  { id: 'micro', label: '晶体结构与缺陷', angle: 0, color: '#38bdf8', center: [0, 19, -15] as const, tilt: [0.35, 0.2, 0] as const },
  { id: 'crystal', label: '凝固与结晶', angle: 60, color: '#22d3ee', center: [24, 9, 10] as const, tilt: [-0.25, 0.4, 0.2] as const },
  { id: 'phase', label: '相图与相变', angle: 120, color: '#818cf8', center: [21, -13, -12] as const, tilt: [0.3, -0.35, 0.15] as const },
  { id: 'nature', label: '显微组织表征', angle: 180, color: '#a78bfa', center: [0, -19, 15] as const, tilt: [-0.35, -0.2, 0.1] as const },
  { id: 'process', label: '制样与热处理工艺', angle: 240, color: '#f472b6', center: [-23, -10, -10] as const, tilt: [0.25, 0.35, -0.2] as const },
  { id: 'property', label: '性能测试与强化', angle: 300, color: '#fbbf24', center: [-22, 12, 12] as const, tilt: [-0.3, 0.25, 0.2] as const },
] as const

/** 五级知识点视觉规格（星球半径与辉光色） */
export const LEVEL_STYLE: Record<Level, { color: string; size: number; radius3d: number; label: string }> = {
  1: { color: '#22d3ee', size: 38, radius3d: 2.25, label: '一级 · 课程核心恒星' },
  2: { color: '#38bdf8', size: 25, radius3d: 1.48, label: '二级 · 六大知识星系' },
  3: { color: '#6366f1', size: 16, radius3d: 0.92, label: '三级 · 核心专题恒星' },
  4: { color: '#a78bfa', size: 11, radius3d: 0.62, label: '四级 · 关键概念行星' },
  5: { color: '#fbbf24', size: 8.5, radius3d: 0.46, label: '五级 · 实验方法与机制' },
}

const K = (
  id: string,
  label: string,
  level: Level,
  sector: number,
  desc: string,
  refs: string[],
  extra: { parent?: string; fullTitle?: string; kind?: NodeKind } = {},
): KnowledgeNode => ({ id, label, level, sector, desc, refs, ...extra })

export const KNOWLEDGE_NODES: KnowledgeNode[] = [
  // ══════════════════ 一级：课程核心恒星 ══════════════════
  K(
    'root',
    '材料物理实验',
    1,
    0,
    '课程总纲：以「微观结构 — 制备与热处理工艺 — 相与显微组织 — 力学/热学/电学性能」四面体为主线，贯穿 7 个核心实验。',
    ['教学大纲·材料物理专业实验1/2；教材 总论'],
    { fullTitle: '材料物理实验 · 结构—工艺—组织—性能主线' },
  ),

  // ══════════════════ 二级：六大知识星系（6） ══════════════════
  K('micro', '晶体结构与缺陷', 2, 0, '实验一：FCC/BCC/HCP 典型晶体结构、四/八面体间隙、晶面晶向标定、密排堆垛与位错缺陷。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], { parent: 'root' }),
  K('crystal', '凝固与结晶', 2, 1, '实验二：合金熔炼、结晶热力学与结构条件、形核与长大、冷却曲线过冷度及 NH4Cl 盐类结晶观察。', ['课程讲义·结晶与凝固；教材 实验二'], { parent: 'root' }),
  K('phase', '相图与相变', 2, 2, '实验四/二十：吉布斯自由能、二元/三元相图、Fe-C 相图共析与共晶转变、铁碳平衡组织。', ['课程讲义·结晶与凝固；教材 实验四'], { parent: 'root', kind: '相' }),
  K('nature', '显微组织表征', 2, 3, '实验三/四：相与组织概念辨析、单相与双相衬度、晶粒与晶界、金相显微镜与 20 种典型材料观察。', ['课程讲义·金相试样制备；教材 实验三/四'], { parent: 'root', kind: '组织' }),
  K('process', '制样与热处理工艺', 2, 4, '实验三/二十：金相取样—镶样—磨光—抛光—腐蚀全流程，以及钢的退火、正火、淬火、回火与表面淬火。', ['课程讲义·金相试样制备；课程讲义·金属材料热处理'], { parent: 'root', kind: '工艺' }),
  K('property', '性能测试与强化', 2, 5, '实验十/十二/二十：布氏/洛氏/维氏显微硬度、四大强化机制、PCY 热膨胀系数与相变点测定、导热与导电性能。', ['课程讲义·表面硬度的测定；课程讲义·膨胀系数测定'], { parent: 'root', kind: '性能' }),

  // ══════════════════ 星系 0：晶体结构与缺陷（实验一） ══════════════════
  K('lattice', 'FCC / BCC / HCP 晶胞', 3, 0, '三种典型金属结构：FCC（4原子/配位数12/致密度74%）、BCC（2原子/配位数8/致密度68%）、HCP（6原子/配位数12/致密度74%）。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], {
    parent: 'micro',
    fullTitle: '面心立方（FCC）、体心立方（BCC）和密排六方（HCP）',
  }),
  K('atomradius', '原子半径与致密度推导', 4, 0, '刚球模型下由「最近邻原子相切」几何条件推导原子半径 r 与晶格常数 a 的关系（FCC 面对角线相切、BCC 体对角线相切），而非死背查表。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], { parent: 'lattice' }),
  K('coordpack', '晶胞原子数与配位数', 4, 0, '按顶点 1/8、面心 1/2、体心 1、晶内 1 折算单胞原子数；配位数表征最近邻等距原子个数，直接决定致密度高低。', ['课程讲义·晶体结构与晶体缺陷'], { parent: 'lattice' }),

  K('gap', '四面体与八面体间隙', 3, 0, '晶胞内由 4 个或 6 个刚球围成的空隙：其位置、个数与间隙半径 rB/rA 决定了碳、氮等间隙原子的溶解度与占位。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], {
    parent: 'micro',
    fullTitle: '晶体结构中四面体间隙与八面体间隙的位置、分布与半径',
  }),
  K('octagap', '八面体间隙分布与半径', 4, 0, 'FCC 八面体间隙位于体心与 12 条棱中点（共 4 个，rB/rA=0.414）；BCC 八面体间隙位于面心与棱中点（共 6 个，扁八面体）。', ['课程讲义·晶体结构与晶体缺陷'], { parent: 'gap' }),
  K('tetragap', '四面体间隙分布与半径', 4, 0, 'FCC 四面体间隙位于 8 个小立方体体心（体对角线 1/4 处，共 8 个，rB/rA=0.225）；BCC 四面体间隙位于各面四分位点（共 12 个，rB/rA=0.291）。', ['课程讲义·晶体结构与晶体缺陷'], { parent: 'gap' }),

  K('miller', '晶面指数与晶向指数', 3, 0, '利用截距倒数化整标定 (hkl) 晶面指数、矢量坐标化整标定 [uvw] 晶向指数；HCP 采用四轴坐标系 (hkil)。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], {
    parent: 'micro',
    fullTitle: '晶面指数 (hkl) 与晶向指数 [uvw] 的标定方法',
  }),
  K('stacking', '密排面堆垛与滑移系', 3, 0, 'FCC {111} 密排面按 ABCABC 三层重复堆垛，HCP (0001) 按 ABAB 两层堆垛；密排面 + 密排方向组成滑移系，决定金属塑性优劣。', ['课程讲义·晶体结构与晶体缺陷'], {
    parent: 'micro',
    fullTitle: '密排面的堆垛顺序（ABCABC / ABAB）、密排面与密排方向',
  }),
  K('slipsys', '滑移系与塑性各向异性', 4, 0, 'FCC 拥有 4×3=12 个高对称滑移系，塑性极佳；HCP 独立滑移系少，表现出明显塑性各向异性。', ['课程讲义·晶体结构与晶体缺陷'], { parent: 'stacking', kind: '性能' }),

  K('dislocation', '刃型·螺型·混合位错', 3, 0, '晶体线缺陷：刃型位错柏氏矢量垂直位错线（含额外半原子面），螺型平行，混合位错斜交；通过柏氏回路判定。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], {
    parent: 'micro',
    kind: '缺陷',
    fullTitle: '刃型位错、螺型位错与混合位错的原子排布及柏氏矢量',
  }),
  K('dislmotion', '位错滑移与 Frank-Read 增殖', 4, 0, '位错沿滑移面切应力方向滑移是塑性变形的微观机制；两端钉扎位错段在切应力下弓出循环（Frank-Read 源）实现位错大量增殖。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], { parent: 'dislocation', kind: '缺陷' }),
  K('dislinter', '位错交割·塞积与不全位错', 4, 0, '运动位错相交产生割阶/扭折；在晶界或第二相前塞积造成应力集中；全位错可分解为肖克利不全位错并夹扩展层错。', ['课程讲义·晶体结构与晶体缺陷；教材 实验一'], { parent: 'dislocation', kind: '缺陷' }),

  // ══════════════════ 星系 1：凝固与结晶（实验二） ══════════════════
  K('thermo', '结晶热力学条件', 3, 1, '液固两相体积自由能随温度变化在平衡熔点 Tm 处相交；只有冷至 Tm 以下（过冷 ΔT > 0，ΔGv < 0）才具备结晶热力学驱动力。', ['课程讲义·结晶与凝固；教材 实验二'], { parent: 'crystal' }),
  K('structcond', '结晶结构条件（晶坯）', 4, 1, '液态金属中存在短程有序、时聚时散的原子集团（结构起伏/晶坯）；过冷至 T0 以下经孕育期后晶坯长大为稳定晶核。', ['课程讲义·结晶与凝固'], { parent: 'thermo' }),
  K('crystphenom', '冷却曲线与过冷度 ΔT', 3, 1, '热分析冷却曲线上的水平平台对应结晶潜热释放与实际结晶温度 T1；过冷度 ΔT = T0 − T1 随冷却速度增大而显著提高。', ['课程讲义·结晶与凝固'], {
    parent: 'crystal',
    fullTitle: '金属的结晶现象：冷却曲线、结晶潜热与过冷度',
  }),

  K('nucleation', '晶核形成（均匀/非均匀）', 3, 1, '晶核半径必须跨过临界晶核半径 r* 才能稳定长大；实际金属多依附容器壁或高熔点杂质进行非均匀形核（形核功更低）。', ['课程讲义·结晶与凝固'], { parent: 'crystal' }),
  K('growth', '晶体长大与过冷细晶', 3, 1, '结晶由形核率 N 与长大速度 G 共同控制：增大过冷度使 N 比 G 增长更快，从而显著细化最终铸态晶粒。', ['课程讲义·结晶与凝固'], { parent: 'crystal' }),
  K('growthform', '生长形态与成分过冷', 4, 1, '温度梯度与成分过冷决定固液界面形态（平面晶、胞状晶、树枝晶）；不同冷却条件导致晶核大小与枝晶粗细显著差异。', ['课程讲义·结晶与凝固；教材 实验二'], { parent: 'growth', kind: '组织' }),

  K('nh4cl', 'NH4Cl 盐类结晶观察', 4, 1, '采用透明过饱和 NH4Cl 水溶液「转换法」模拟金属结晶：对比培养皿空冷、显微镜下空冷、烧杯/试管空冷、撒晶种粉末、冰上急冷 7 种条件下的形核与树枝晶生长。', ['课程讲义·结晶与凝固；教材 实验二'], { parent: 'crystphenom', kind: '工艺' }),
  K('crystmethod', '蒸发结晶与降温结晶', 4, 1, '溶液结晶的两种基本路径：蒸发溶剂提高浓度达到过饱和，或降低温度减小溶解度促使溶质析出形核。', ['教材 实验二'], { parent: 'crystphenom', kind: '工艺' }),
  K('melting', '电弧熔炼与感应熔炼', 4, 1, '合金制备的两种核心熔炼设备：电弧熔炼利用高温电弧熔化高熔点金属，高频感应熔炼利用涡流加热并兼具电磁搅拌均质作用。', ['课程讲义·结晶与凝固；教材 实验二'], { parent: 'nucleation', kind: '工艺' }),

  // ══════════════════ 星系 2：相图与相变（实验四 / 二十） ══════════════════
  K('gibbs', '吉布斯自由能与相平衡', 3, 2, '相变总是向吉布斯自由能 G 降低的方向进行；公切线法则与化学势相等是判定二元多相平衡的热力学基准。', ['课程讲义·结晶与凝固'], { parent: 'phase', kind: '相' }),
  K('phasediagram', '二元与三元相图法则', 3, 2, '相图表示平衡状态下成分、温度与相组成的关系；利用杠杆定律计算两相相对含量，识别匀晶、共晶、共析与包晶三相线。', ['课程讲义·结晶与凝固'], { parent: 'phase', kind: '相' }),
  K('fec', 'Fe-C 相图与关键转变', 3, 2, '钢铁材料组织判读的总地图：涵盖包晶、1148℃ 共晶转变（L → A + Fe3CⅠ）与 727℃ 共析转变（A → F + Fe3CⅡ）。', ['课程讲义·金属材料热处理；教材 实验四'], {
    parent: 'phase',
    kind: '相',
    fullTitle: '二元 Fe-C 铁碳平衡相图（共析转变与共晶转变）',
  }),
  K('fcbasic', '铁素体 F 与渗碳体 Fe3C', 4, 2, '所有碳钢和白口铸铁的室温平衡组织均由铁素体（BCC 软韧相，溶碳 <0.0218%）与渗碳体（Fe3C 硬脆金属化合物）两个基本相组合而成。', ['教材 实验四'], { parent: 'fec', kind: '相' }),
  K('pearlite', '珠光体 P（共析产物）', 5, 2, '0.77%C 奥氏体在 727℃ 发生共析转变，铁素体与渗碳体交替生核形成片层状珠光体；片层间距越细，强度硬度越高。', ['教材 实验四；课程讲义·金相试样制备'], { parent: 'fcbasic', kind: '组织' }),
  K('ledeburite', '莱氏体 Ld（共晶产物）', 5, 2, '4.30%C 铁水在 1148℃ 发生共晶转变生成奥氏体与渗碳体混合物（高温莱氏体），室温下转变为珠光体 + 渗碳体的变态莱氏体。', ['教材 实验四'], { parent: 'fcbasic', kind: '组织' }),

  K('carbonsteel', '铁碳合金室温组织谱（表6-1）', 3, 2, '随含碳量递增：工业纯铁（F）→ 亚共析钢（F+P）→ 共析钢（P）→ 过共析钢（P+Fe3CⅡ）→ 亚共晶/共晶/过共晶白口铸铁（含 Ld）。', ['教材 实验四 · 表6-1'], { parent: 'phase', kind: '组织' }),
  K('hyposteel', '亚共析·共析·过共析钢', 4, 2, '碳钢（0.02~2.11%C）经 4% 硝酸酒精腐蚀后，凭铁素体白亮块、珠光体暗色片层及晶界网状二次渗碳体区分三类碳钢。', ['教材 实验四 · 表6-1'], { parent: 'carbonsteel', kind: '组织' }),

  // ══════════════════ 星系 3：显微组织表征（实验三 / 四） ══════════════════
  K('phasevs', '相与组织的概念辨析', 3, 3, '相（Phase）是成分与晶体结构均匀的组成部分；组织（Microstructure）是单相或多相在空间按特定形态、大小与分布组合而成的整体貌相。', ['课程讲义·金相试样制备；教学大纲·材料物理专业实验2'], {
    parent: 'nature',
    kind: '相',
    fullTitle: '相（Phases）与微观组织（Microstructure）的区别与联系',
  }),
  K('single', '单相组织（纯铁/纯铜/纯铝）', 4, 3, '单相多晶体腐蚀时因各晶粒结晶学取向不同、溶解速率有别而呈明暗台阶，晶界处原子能量高、优先腐蚀成沟槽显露。', ['课程讲义·金相试样制备'], { parent: 'phasevs', kind: '相' }),
  K('dual', '双相组织（铁素体+渗碳体）', 4, 3, '双相或多相合金中各相电化学电位不同，在腐蚀液中形成微电池：阳极相受侵蚀凹陷发暗、阴极相凸起发亮（如片层状珠光体）。', ['课程讲义·金相试样制备'], { parent: 'phasevs', kind: '相' }),

  K('grain', '晶粒与晶界结构特征', 3, 3, '晶粒内部原子按周期点阵有序排列；晶界是不同取向晶粒间的过渡区，原子排列无序、畸变能高、常温下阻碍位错滑移。', ['课程讲义·金相试样制备'], {
    parent: 'nature',
    kind: '组织',
    fullTitle: '晶粒（有序排列）与晶界（高能无序过渡区）及与裂纹的区别',
  }),
  K('microstructure', '钢铁典型组织（F/P/M/Ld）', 3, 3, '同一化学成分在不同冷速与热处理下可形成铁素体、珠光体、贝氏体、马氏体等截然不同的显微组织，直接决定宏观性能。', ['课程讲义·金相试样制备；课程讲义·金属材料热处理'], { parent: 'nature', kind: '组织' }),
  K('microprop', '显微组织对力学性能调控', 4, 3, '细小均匀组织提高强韧性；马氏体高硬但脆；网状渗碳体或粗大晶粒割裂基体、显著降低塑性与冲击韧性。', ['教材 实验四；教学大纲·材料物理专业实验2'], { parent: 'microstructure', kind: '性能' }),

  K('microobs', '典型材料金相观察（实验四）', 3, 3, '综合观察钢铁、有色金属、陶瓷与高分子 4 大类（大纲要求 20 种试样）的微观形貌，建立成分—工艺—组织对应关系。', ['教材 实验四；教学大纲·材料物理专业实验1/2'], { parent: 'nature', kind: '组织' }),
  K('microscope', '金相显微镜构造与使用', 4, 3, '由照明系统、物镜/目镜光学系统与载物台调焦机构组成；操作时先粗调后细调，严防调焦过猛把物镜浸入残留腐蚀液。', ['教材 实验三；教学大纲·材料物理专业实验2'], { parent: 'microobs', kind: '工艺' }),
  K('specimens', '钢铁·有色·陶瓷·高分子金相', 4, 3, '对比观察 20 种典型材料试样的晶粒形态、相分布、气孔与夹杂特征，绘制不少于 3 个区域的组织示意图。', ['教材 实验四；教学大纲·材料物理专业实验2'], { parent: 'microobs', kind: '组织' }),

  // ══════════════════ 星系 4：制样与热处理工艺（实验三 / 二十） ══════════════════
  K('sampleprep', '金相试样制备五步法', 3, 4, '标准流程：取样 → 镶样/夹持 → 粗磨与细磨 → 抛光 → 化学腐蚀；任一环节失误都会引入假象或掩盖真实显微组织。', ['课程讲义·金相试样制备；教材 实验三'], {
    parent: 'process',
    kind: '工艺',
    fullTitle: '金相样品的制备（取样→镶样→磨光→抛光→腐蚀）',
  }),
  K('sampling', '代表性取样与镶嵌夹持', 4, 4, '按研究目的选取横/纵截面并防止切割过热改变组织；小或异形试样采用机械夹持或电木粉热固性塑料镶嵌固定。', ['课程讲义·金相试样制备；教材 实验三'], { parent: 'sampleprep', kind: '工艺' }),
  K('grinding', '粗磨平整与细磨转 90°', 4, 4, '粗磨整平并倒角防划破织物；细磨依次更换由粗到细金相砂纸，坚持「单程单向」且每换一号砂纸将试样旋转 90° 直至旧磨痕全消。', ['课程讲义·金相试样制备；教材 实验三'], { parent: 'sampleprep', kind: '工艺' }),
  K('polishing', '机械/电解/化学抛光', 4, 4, '去除细磨残留磨痕与表层加工变形层以获得光滑镜面；机械抛光常用抛光布配合 W7~W0.25 氧化铝/金刚石抛光粉（W7 表最粗粒径 7μm）。', ['课程讲义·金相试样制备'], { parent: 'sampleprep', kind: '工艺' }),
  K('defects', '制样缺陷：划痕·拖尾·变形层', 5, 4, '磨抛用力过猛、砂纸混入粗砂或抛光不足会造成粗划痕、彗星拖尾、表面沾污、水渍及加工硬化变形层等假象。', ['课程讲义·金相试样制备；教学大纲·材料物理专业实验2'], { parent: 'polishing', kind: '缺陷' }),
  K('defectfix', '缺陷排除与浸蚀清洗吹干', 5, 4, '用力均匀、及时换水冲洗；腐蚀后立即用酒精清洗并热风吹干，防止残留腐蚀液继续侵蚀造成过腐蚀或水迹。', ['课程讲义·金相试样制备'], { parent: 'polishing', kind: '工艺' }),

  K('etch', '化学腐蚀原理与常用腐蚀剂', 3, 4, '利用各相或晶界耐蚀性差异形成凹凸形貌，经显微镜光线反射产生明暗衬度；不腐蚀的镜面只能看见夹杂物、石墨、孔洞与裂纹。', ['课程讲义·金相试样制备'], {
    parent: 'process',
    kind: '工艺',
    fullTitle: '腐蚀的目的和原理及常用腐蚀剂选择',
  }),
  K('etchant', '硝酸酒精·王水·氢氟酸配比', 4, 4, '碳钢与低合金钢用 1~5% 硝酸酒精溶液，高合金钢与不锈钢用王水（盐酸3:硝酸1），铝及铝合金用 0.5% 氢氟酸水溶液。', ['课程讲义·金相试样制备 · 常用腐蚀剂表'], { parent: 'etch', kind: '工艺' }),

  K('heattreat', '热处理工艺三要素', 3, 4, '加热温度、保温时间、冷却方式与介质是决定热处理后组织转变与力学性能的三大核心工艺参数。', ['课程讲义·金属材料热处理'], {
    parent: 'process',
    kind: '工艺',
    fullTitle: '合理的热处理工艺：加热温度、保温时间与冷却速度',
  }),
  K('httemp', '临界温度选择（Ac1 / Ac3）', 4, 4, '淬火与完全退火加热至临界温度以上 30~50℃ 实现奥氏体化；保温时间须保证工件心部透烧并完成相变。', ['课程讲义·金属材料热处理'], { parent: 'heattreat', kind: '工艺' }),
  K('htcool', '冷却介质（炉冷/空冷/水油冷）', 4, 4, '冷却速度决定过冷奥氏体转变产物：随炉缓冷得平衡珠光体，空冷得细珠光体，水冷或油冷跨过鼻尖得高硬度马氏体。', ['课程讲义·金属材料热处理'], { parent: 'heattreat', kind: '工艺' }),

  K('fourfires', '热处理四把火与表面淬火', 3, 4, '退火、正火、淬火、回火四把火配合表面淬火，实现碳钢从软化切削到高强耐磨的全范围性能调控。', ['课程讲义·金属材料热处理；教学大纲·材料物理专业实验2'], {
    parent: 'process',
    kind: '工艺',
    fullTitle: '金属材料热处理四把火：退火、正火、淬火、回火',
  }),
  K('anneal', '退火（随炉冷）与正火（空冷）', 4, 4, '退火随炉缓冷以降低硬度、消除内应力、细化组织；正火在空气中冷却，冷速更快、珠光体片层更细，强度硬度略高于退火。', ['课程讲义·金属材料热处理'], { parent: 'fourfires', kind: '工艺' }),
  K('quench', '淬火马氏体硬化与表面淬火', 4, 4, '淬火水/油快冷获得高硬度马氏体（45钢水淬 >55 HRC）；表面淬火仅快速加热表层淬硬，兼顾表层耐磨与心部强韧。', ['课程讲义·金属材料热处理；教学大纲·材料物理专业实验2'], { parent: 'fourfires', kind: '工艺' }),
  K('temper', '高·中·低温回火温度—硬度律', 4, 4, '淬火钢重加热至 Ac1 以下消除内应力：低温回火（150~250℃，45钢 57~60 HRC，刃具）、中温回火（350~500℃，40~48 HRC，弹簧）、高温回火（500~650℃，25~35 HRC，调质轴类）。', ['课程讲义·金属材料热处理；教材 实验二十'], { parent: 'fourfires', kind: '工艺' }),

  // ══════════════════ 星系 5：性能测试与强化（实验十 / 十二 / 二十） ══════════════════
  K('hardness', '静载压入硬度测定（实验十）', 3, 5, '硬度表征材料表面抵抗局部塑性变形、压痕或划痕的能力；按压头与载荷分为布氏 HB、洛氏 HR 与维氏 HV。', ['课程讲义·表面硬度的测定；教材 实验十'], {
    parent: 'property',
    kind: '性能',
    fullTitle: '表面硬度的测定：布氏（HB）、洛氏（HR）与维氏（HV）',
  }),
  K('vickers', '维氏显微硬度计与零位校准', 4, 5, '采用 136° 正四棱锥金刚石压头压入抛光面，测量压痕两对角线 d1、d2 均值算 HV；测量前必须校准测微目镜 0 刻度并按软硬选准试验力。', ['课程讲义·表面硬度的测定；教材 实验十'], { parent: 'hardness', kind: '性能' }),
  K('hardsample', '硬度试样镜面抛光与影响因素', 4, 5, '维氏压痕极小，试样表面必须抛光成镜面才能看清压痕顶点；同种金属的硬度取决于含碳量、显微组织类型与热处理状态。', ['课程讲义·表面硬度的测定；课程讲义·金属材料热处理'], { parent: 'hardness', kind: '性能' }),

  K('harden', '金属四大强化机制', 3, 5, '通过阻碍位错运动提高材料强度与硬度：固溶强化、细晶强化、位错加工硬化与马氏体相变强化。', ['课程讲义·晶体结构与晶体缺陷；课程讲义·表面硬度的测定'], {
    parent: 'property',
    kind: '性能',
    fullTitle: '增强硬度与强度的方法：固溶强化、细晶强化与相变强化',
  }),
  K('solidsolution', '固溶强化（间隙/置换固溶）', 4, 5, '溶质原子溶入基体晶格引起球对称或非对称晶格畸变应力场，强烈阻碍位错滑移，使固溶体硬度高于纯金属。', ['课程讲义·晶体结构与晶体缺陷'], { parent: 'harden', kind: '性能' }),
  K('finegrain', '细晶强化（同时强韧化）', 4, 5, '晶粒越细、单位体积内晶界总面积越大，不同取向晶粒协调变形并分散位错塞积应力集中，唯一同时提高强度硬度和塑韧性的机制。', ['课程讲义·晶体结构与晶体缺陷；教材 实验四'], { parent: 'harden', kind: '性能' }),

  K('expansion', '热膨胀系数测定（实验十二）', 3, 5, '热膨胀源于点阵原子热振动的非简谐性；原子结合能越强、熔点 Tm 越高，势能阱越深窄，线膨胀系数 α 越小（α·Tm ≈ 0.022）。', ['课程讲义·膨胀系数测定；教材 实验十二'], {
    parent: 'property',
    kind: '性能',
    fullTitle: '材料热膨胀机理与线膨胀系数测定',
  }),
  K('dilatometer', 'PCY 热膨胀仪与千分尺清零', 4, 5, '试样装入石英管前必须对千分尺清零；计算平均线膨胀系数 α = (ΔLt − Kt)/(L0·ΔT) 时须扣除石英管与推杆的系统补偿值 Kt。', ['课程讲义·膨胀系数测定；教材 实验十二'], { parent: 'expansion', kind: '工艺' }),
  K('expphase', '膨胀曲线拐点测相变温度', 4, 5, '同素异构转变或固态相变伴随点阵重排与比容突变，导致温度—膨胀量曲线出现明显拐点（斜率突变），据此精确测定相变温度。', ['课程讲义·膨胀系数测定；教材 实验十二'], { parent: 'expansion', kind: '性能' }),

  K('thermal', '导热与导电微观机理', 3, 5, '热传导有传导、对流、辐射三种方式；金属靠自由电子导热导电，晶界、缺陷、固溶畸变（如高熵合金）及非晶无序结构均强烈散射电子、降低电导与热导；多孔材料依靠气孔隔热且热膨胀低。', ['课程讲义·膨胀系数测定；课程讲义·晶体结构与晶体缺陷'], {
    parent: 'property',
    kind: '性能',
    fullTitle: '热学导热与电学导电性能的微观结构相关性',
  }),
  K('hea', '高熵合金与非晶导电特征', 4, 5, '高熵合金多主元严重晶格畸变与非晶材料长程无序都会加剧电子散射，电阻率显著高于传统纯金属；多孔材料则兼具高比强与低热膨胀。', ['课程讲义·晶体结构与晶体缺陷；课程讲义·膨胀系数测定'], { parent: 'thermal', kind: '性能' }),
]

export const KNOWLEDGE_EDGES: KnowledgeEdge[] = [
  // 1) 星系层级树主干（组成）
  ...KNOWLEDGE_NODES.filter((n) => n.parent).map((n) => ({
    source: n.parent as string,
    target: n.id,
    relation: '组成' as Relation,
  })),

  // 2) 跨星系「结构 — 工艺 — 组织 — 性能」核心关联弧线
  { source: 'atomradius', target: 'gap', relation: '前置依赖' },
  { source: 'gap', target: 'solidsolution', relation: '前置依赖' },
  { source: 'stacking', target: 'dislmotion', relation: '前置依赖' },
  { source: 'dislmotion', target: 'harden', relation: '因果' },
  { source: 'dislinter', target: 'finegrain', relation: '因果' },
  { source: 'dislocation', target: 'solidsolution', relation: '因果' },
  { source: 'thermo', target: 'gibbs', relation: '前置依赖' },
  { source: 'nucleation', target: 'growth', relation: '前置依赖' },
  { source: 'growth', target: 'grain', relation: '因果' },
  { source: 'growthform', target: 'microstructure', relation: '因果' },
  { source: 'melting', target: 'structcond', relation: '因果' },
  { source: 'fec', target: 'microstructure', relation: '因果' },
  { source: 'fec', target: 'httemp', relation: '前置依赖' },
  { source: 'fcbasic', target: 'dual', relation: '对比' },
  { source: 'pearlite', target: 'microprop', relation: '因果' },
  { source: 'carbonsteel', target: 'hardsample', relation: '因果' },
  { source: 'single', target: 'dual', relation: '对比' },
  { source: 'phasevs', target: 'microstructure', relation: '对比' },
  { source: 'grain', target: 'finegrain', relation: '因果' },
  { source: 'microprop', target: 'hardness', relation: '因果' },
  { source: 'sampleprep', target: 'microobs', relation: '前置依赖' },
  { source: 'polishing', target: 'hardsample', relation: '前置依赖' },
  { source: 'defects', target: 'vickers', relation: '因果' },
  { source: 'etch', target: 'single', relation: '因果' },
  { source: 'etch', target: 'dual', relation: '因果' },
  { source: 'etchant', target: 'hyposteel', relation: '前置依赖' },
  { source: 'heattreat', target: 'fourfires', relation: '前置依赖' },
  { source: 'htcool', target: 'quench', relation: '因果' },
  { source: 'anneal', target: 'quench', relation: '对比' },
  { source: 'quench', target: 'temper', relation: '前置依赖' },
  { source: 'temper', target: 'hardsample', relation: '因果' },
  { source: 'fourfires', target: 'microstructure', relation: '因果' },
  { source: 'expphase', target: 'fec', relation: '前置依赖' },
  { source: 'dilatometer', target: 'expphase', relation: '前置依赖' },
  { source: 'dislocation', target: 'thermal', relation: '因果' },
]

export const QUESTION_NODES: QuestionNode[] = [
  // ── 第一层级：基础理解（6） ──
  {
    id: 'q1_1',
    tier: 1,
    title: '在BCC、FCC和HCP三种晶体结构中，原子排列规律不同，它们的致密度、配位数分别是多少？',
    bloom: '理解',
    knowledgeIds: ['lattice', 'coordpack', 'atomradius', 'stacking'],
    answer: [
      'FCC（面心立方）：每晶胞 4 个原子，配位数 12，致密度 74%（典型金属：Cu、Al、γ-Fe）。',
      'BCC（体心立方）：每晶胞 2 个原子，配位数 8，致密度 68%（典型金属：α-Fe、Cr、W）。',
      'HCP（密排六方）：每晶胞 6 个原子，配位数 12，致密度 74%（典型金属：Mg、Zn、α-Ti）。',
    ],
    blindSpot: '容易把「晶胞原子数」与「配位数」混淆，或把 BCC 致密度误记为 74%。',
    refs: ['课程讲义·晶体结构与晶体缺陷；教材 实验一'],
  },
  {
    id: 'q1_2',
    tier: 1,
    title: '四面体间隙和八面体间隙的位置及半径如何求？',
    bloom: '理解',
    knowledgeIds: ['gap', 'octagap', 'tetragap', 'atomradius', 'solidsolution'],
    answer: [
      'FCC 八面体间隙在体心和 12 条棱中点（共 4 个，rB/rA = 0.414），四面体间隙在 8 个小立方体心（共 8 个，rB/rA = 0.225）。',
      'BCC 八面体间隙在 6 个面心和 12 条棱中点（共 6 个），四面体间隙在各面四分位点（共 12 个，rB/rA = 0.291）。',
      '间隙半径全部由刚球模型「最近邻相切」几何关系推导，是理解碳在 α-Fe 与 γ-Fe 中溶解度差异及间隙固溶强化的基础。',
    ],
    blindSpot: '找不出晶胞中的所有四面体和八面体间隙，或漏算棱/面上的折算个数。',
    refs: ['课程讲义·晶体结构与晶体缺陷；教材 实验一'],
  },
  {
    id: 'q1_3',
    tier: 1,
    title: '如何确定密排面指数和密排方向指数？位错对性能的影响是什么？',
    bloom: '理解',
    knowledgeIds: ['miller', 'stacking', 'slipsys', 'dislocation', 'dislmotion', 'dislinter'],
    answer: [
      '按截距倒数化整求 (hkl)、按矢量坐标化整求 [uvw]；FCC 的 {111} 面原子面密度最高，为密排滑移面，密排方向为 <110>。',
      '位错沿密排面滑移使金属塑性变形所需切应力远低于理论强度；Frank-Read 源增殖与位错交割、晶界塞积则阻碍后续位错运动，产生加工硬化。',
    ],
    blindSpot: '不会求解密排六方（HCP）四轴坐标系中的晶面指数，或描绘不清 FCC 密排面 ABCABC 堆垛顺序。',
    refs: ['课程讲义·晶体结构与晶体缺陷；教材 实验一'],
  },
  {
    id: 'q1_4',
    tier: 1,
    title: '金属的结晶现象如何观察？',
    bloom: '理解',
    knowledgeIds: ['crystphenom', 'nh4cl', 'crystmethod', 'nucleation'],
    answer: [
      '热分析法：测定金属冷却曲线，曲线上的水平平台对应结晶潜热释放与实际结晶温度 T1，过冷度 ΔT = T0 − T1。',
      '转换观察法：用透明过饱和 NH4Cl 水溶液模拟不透明金属结晶，对比培养皿空冷、生物显微镜下空冷、小烧杯/试管空冷、撒 NH4Cl 粉末、冰上急冷等条件下的形核与树枝晶长大。',
    ],
    blindSpot: '绘制结晶开始、长大、完成三阶段组织示意图不规范；调节显微镜时误将物镜镜头浸入溶液。',
    refs: ['课程讲义·结晶与凝固；教材 实验二'],
  },
  {
    id: 'q1_5',
    tier: 1,
    title: '金属结晶的热力学条件和结构条件是什么？过冷度如何影响晶粒大小？',
    bloom: '理解',
    knowledgeIds: ['thermo', 'structcond', 'growth', 'growthform'],
    answer: [
      '热力学条件：液固两相自由能曲线在 Tm 相交，必须过冷至 Tm 以下（ΔT > 0，ΔGv < 0）才有结晶驱动力。',
      '结构条件：液态金属中存在短程有序、时聚时散的晶坯（结构起伏），过冷下越过临界尺寸 r* 成为稳定晶核。',
      '过冷度 ΔT 增大时，形核率 N 与长大速度 G 都增大，但 N 的增长比 G 快得多，故加大冷却速度/过冷度可显著细化晶粒。',
    ],
    blindSpot: '解释过冷度和成分过冷对晶体生长形态及最终组织粗细的影响不到位。',
    refs: ['课程讲义·结晶与凝固；教材 实验二'],
  },
  {
    id: 'q1_6',
    tier: 1,
    title: '二元 Fe-C 相图中共析转变与共晶转变的特征是什么？',
    bloom: '理解',
    knowledgeIds: ['fec', 'fcbasic', 'pearlite', 'ledeburite', 'gibbs'],
    answer: [
      '共析转变（727℃，0.77%C）：固态奥氏体 A 恒温同时转变为铁素体 F + 渗碳体 Fe3C，产物为片层状珠光体 P。',
      '共晶转变（1148℃，4.30%C）：液相 L 恒温同时结晶出奥氏体 A + 渗碳体 Fe3C，产物为莱氏体 Ld。',
      '所有碳钢和白口铸铁室温平衡组织均由铁素体与渗碳体两个基本相按不同数量与形态组合而成。',
    ],
    refs: ['课程讲义·金属材料热处理；教材 实验四'],
  },

  // ── 第二层级：实验表征（4） ──
  {
    id: 'q2_1',
    tier: 2,
    title: '制备的试样中有哪些缺陷？测试表面硬度为什么要抛光表面？',
    bloom: '记忆',
    knowledgeIds: ['sampleprep', 'grinding', 'polishing', 'defects', 'defectfix', 'hardsample'],
    answer: [
      '常见金相制样缺陷：粗划痕、彗星拖尾、水渍、表面沾污、边缘倒圆、磨抛变形层以及腐蚀过深/过浅。',
      '维氏显微硬度压痕极小，试样必须抛光成无划痕镜面，才能在显微镜下清晰对准压痕四角并准确读出对角线 d1、d2。',
      '排除方法：细磨坚持单程单向、换砂纸转 90°；抛光用力均匀；腐蚀后立即酒精清洗并吹干。',
    ],
    blindSpot: '制样过程中用力过猛导致试样表面不平整或留下粗划痕。',
    refs: ['课程讲义·金相试样制备；课程讲义·表面硬度的测定'],
  },
  {
    id: 'q2_2',
    tier: 2,
    title: '晶粒和晶界处原子的能量相同吗？晶界和裂纹的区别是什么？',
    bloom: '理解',
    knowledgeIds: ['grain', 'dislocation', 'dislinter', 'finegrain'],
    answer: [
      '不同：晶粒内部原子按晶格周期有序排列、自由能低；晶界处原子处于不同取向过渡区，排列无序、点阵畸变大、能量显著更高（因此腐蚀时晶界优先被侵蚀显露）。',
      '晶界仍是原子紧密结合的固态界面，能传递载荷并阻碍位错滑移；裂纹则是原子键断裂形成的物理空隙，会造成严重应力集中。',
    ],
    refs: ['课程讲义·金相试样制备；课程讲义·晶体结构与晶体缺陷'],
  },
  {
    id: 'q2_3',
    tier: 2,
    title: '相和组织的概念分别是什么？有什么联系？对性能有什么影响？',
    bloom: '分析',
    knowledgeIds: ['phasevs', 'microstructure', 'single', 'dual', 'fcbasic', 'pearlite', 'microprop'],
    answer: [
      '相是化学成分与晶体结构均匀的体系部分（如铁素体 F、渗碳体 Fe3C、奥氏体 A）。',
      '组织是相在空间上按一定形态、大小、数量和分布组合而成的微观貌相（如片层状珠光体 P、针状马氏体 M）。',
      '相同的相（F + Fe3C）因分布与粗细不同可构成不同组织，直接决定材料的强度、硬度、塑性与冲击韧性。',
    ],
    blindSpot: '极易把「相组成物（铁素体/渗碳体）」与「组织组成物（珠光体/莱氏体）」混为一谈。',
    refs: ['课程讲义·金相试样制备；教材 实验四；教学大纲·材料物理专业实验2'],
  },
  {
    id: 'q2_4',
    tier: 2,
    title: '腐蚀的目的和原理是什么？不同的材料能用同一种腐蚀剂吗？不腐蚀能观察到组织吗？',
    bloom: '理解',
    knowledgeIds: ['etch', 'etchant', 'single', 'dual', 'defectfix'],
    answer: [
      '目的与原理：利用晶界与晶内能量差（单相）或各相电化学电位差（双相）产生选择性溶解，使磨面形成凹凸衬度，在显微镜反射光下显现晶界与相界。',
      '不能通用：碳钢用 1~5% 硝酸酒精，不锈钢与高合金钢用王水，铝合金用 0.5% 氢氟酸水溶液。',
      '不腐蚀时抛光镜面一片全亮，除石墨、非金属夹杂物、孔洞与裂纹外无法辨识晶粒和相组织。',
    ],
    blindSpot: '腐蚀时间把控不当导致过浅（晶界不清）或过深（表面发黑失真），或腐蚀后未及时用酒精清洗吹干。',
    refs: ['课程讲义·金相试样制备；教材 实验三'],
  },

  // ── 第三层级：综合应用（3） ──
  {
    id: 'q3_1',
    tier: 3,
    title: '表面硬度的决定因素是什么',
    bloom: '分析',
    knowledgeIds: ['hardness', 'vickers', 'hardsample', 'harden', 'solidsolution', 'finegrain', 'fourfires', 'microprop'],
    answer: [
      '化学成分：含碳量与合金元素决定硬脆渗碳体数量及基体固溶强化程度。',
      '显微组织：马氏体 > 细珠光体（正火） > 粗珠光体+铁素体（退火），组织形态直接左右硬度高低。',
      '热处理与加工工艺：淬火冷速与回火温度可连续调控硬度（如 45 钢低温回火 57~60 HRC、中温 40~48 HRC、高温 25~35 HRC）。',
      '测试规范：试样镜面抛光质量、载荷选择与测微目镜 0 刻度校准直接影响维氏硬度读数准确性。',
    ],
    blindSpot: '不能贯通「成分—工艺—显微组织—表面硬度」因果链；测压痕对角线前忘记校准 0 刻度或选错试验力。',
    refs: ['课程讲义·表面硬度的测定；课程讲义·金属材料热处理；教材 实验十/二十'],
  },
  {
    id: 'q3_2',
    tier: 3,
    title: '如何制定合适的热处理工艺',
    bloom: '创造',
    knowledgeIds: ['heattreat', 'httemp', 'htcool', 'fourfires', 'anneal', 'quench', 'temper'],
    answer: [
      '第一步（定路线）：按服役需求选择退火（软化去应力）、正火（细化预备热处理）或淬火+回火（高硬耐磨或综合调质）。',
      '第二步（定三要素）：依据 Fe-C 相图确定加热温度（临界点 Ac1/Ac3 以上 30~50℃）、保温时间与冷却介质（炉冷/空冷/油冷/水冷）。',
      '第三步（配回火）：淬火后必配回火——刃具量具用 150~250℃ 低温回火，弹簧模具用 350~500℃ 中温回火，齿轮连杆轴类用 500~650℃ 高温回火。',
    ],
    blindSpot: '制定热处理工艺时缺乏 Fe-C 相图临界点依据，或忽略淬火后必须及时回火以消除内应力与脆性。',
    refs: ['课程讲义·金属材料热处理；教材 实验二十'],
  },
  {
    id: 'q3_3',
    tier: 3,
    title: '如何测量相变温度',
    bloom: '应用',
    knowledgeIds: ['expphase', 'expansion', 'dilatometer', 'fec', 'gibbs'],
    answer: [
      '物理依据：金属发生同素异构转变或固态相变（如 α-Fe → γ-Fe）时点阵重排引起比容突变，热膨胀曲线斜率发生不连续转折。',
      '实验测定：使用 PCY 型全自动热膨胀仪记录试样随温度升高的线膨胀量 ΔLt，由膨胀曲线的拐点/突变温度读取相变点。',
      '操作要点：装入石英管前必须对千分尺清零，计算线膨胀系数时扣除测试系统补偿值 Kt。',
    ],
    blindSpot: '装样测量前忘记对千分尺清零；对键强、结合能及相变影响热膨胀系数的物理机理理解不透。',
    refs: ['课程讲义·膨胀系数测定；教材 实验十二'],
  },
]

export const QUESTION_EDGES: QuestionEdge[] = [
  // 第一层级 → 第二层级
  { source: 'q1_1', target: 'q2_2', relation: '前置依赖' },
  { source: 'q1_1', target: 'q2_3', relation: '前置依赖' },
  { source: 'q1_1', target: 'q2_1', relation: '前置依赖' },
  { source: 'q1_2', target: 'q2_3', relation: '前置依赖' },
  { source: 'q1_3', target: 'q2_2', relation: '前置依赖' },
  { source: 'q1_4', target: 'q2_4', relation: '前置依赖' },
  { source: 'q1_4', target: 'q2_1', relation: '前置依赖' },
  { source: 'q1_5', target: 'q2_1', relation: '前置依赖' },
  { source: 'q1_5', target: 'q2_2', relation: '前置依赖' },
  { source: 'q1_6', target: 'q2_3', relation: '前置依赖' },
  // 第二层级 → 第三层级
  { source: 'q2_1', target: 'q3_1', relation: '前置依赖' },
  { source: 'q2_1', target: 'q3_2', relation: '前置依赖' },
  { source: 'q2_2', target: 'q3_1', relation: '前置依赖' },
  { source: 'q2_2', target: 'q3_3', relation: '前置依赖' },
  { source: 'q2_2', target: 'q3_2', relation: '前置依赖' },
  { source: 'q2_3', target: 'q3_1', relation: '前置依赖' },
  { source: 'q2_3', target: 'q3_2', relation: '前置依赖' },
  { source: 'q2_4', target: 'q3_2', relation: '前置依赖' },
]

/** 问题层级主题色 */
export const TIER_STYLE: Record<1 | 2 | 3, { name: string; accent: string; bg: string; border: string }> = {
  1: { name: '第一层级', accent: '#6366f1', bg: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.28)' },
  2: { name: '第二层级', accent: '#14b8a6', bg: 'rgba(20,184,166,0.08)', border: 'rgba(20,184,166,0.28)' },
  3: { name: '第三层级', accent: '#f59e0b', bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.30)' },
}

export const TIER_DESC: Record<1 | 2 | 3, string> = {
  1: '基础理解 · 晶体结构、结晶与相图',
  2: '实验表征 · 制样、组织辨识与腐蚀',
  3: '综合应用 · 硬度、热处理与相变测量',
}

export const BLOOM_COLOR: Record<Bloom, string> = {
  记忆: '#8b5cf6',
  理解: '#3b82f6',
  应用: '#0ea5e9',
  分析: '#f59e0b',
  创造: '#ef4444',
}

/* ─────────────── 查询辅助 ─────────────── */

export const nodeById = (id: string): KnowledgeNode | undefined =>
  KNOWLEDGE_NODES.find((n) => n.id === id)

export const childrenOf = (id: string): KnowledgeNode[] =>
  KNOWLEDGE_NODES.filter((n) => n.parent === id)

/** 与某节点直接相连的知识点（父、子、跨星系关联），按关系分组 */
export function neighborsOf(id: string): {
  parent?: KnowledgeNode
  children: KnowledgeNode[]
  related: { node: KnowledgeNode; relation: Relation; direction: 'out' | 'in' }[]
} {
  const node = nodeById(id)
  const children = childrenOf(id)
  const related: { node: KnowledgeNode; relation: Relation; direction: 'out' | 'in' }[] = []
  for (const e of KNOWLEDGE_EDGES) {
    if (e.relation === '组成') continue
    if (e.source === id) {
      const target = nodeById(e.target)
      if (target) related.push({ node: target, relation: e.relation, direction: 'out' })
    } else if (e.target === id) {
      const source = nodeById(e.source)
      if (source) related.push({ node: source, relation: e.relation, direction: 'in' })
    }
  }
  return { parent: node?.parent ? nodeById(node.parent) : undefined, children, related }
}

/** 与某知识点关联的问题 */
export const questionsOfKnowledge = (id: string): QuestionNode[] =>
  QUESTION_NODES.filter((q) => q.knowledgeIds.includes(id))

export const questionById = (id: string): QuestionNode | undefined =>
  QUESTION_NODES.find((q) => q.id === id)

/** 问题图谱的上下游（沿前置依赖方向做可达性搜索） */
export function questionPath(id: string): { upstream: Set<string>; downstream: Set<string> } {
  const upstream = new Set<string>()
  const downstream = new Set<string>()
  const walkUp = (cur: string) => {
    for (const e of QUESTION_EDGES) {
      if (e.target === cur && !upstream.has(e.source)) {
        upstream.add(e.source)
        walkUp(e.source)
      }
    }
  }
  const walkDown = (cur: string) => {
    for (const e of QUESTION_EDGES) {
      if (e.source === cur && !downstream.has(e.target)) {
        downstream.add(e.target)
        walkDown(e.target)
      }
    }
  }
  walkUp(id)
  walkDown(id)
  return { upstream, downstream }
}
