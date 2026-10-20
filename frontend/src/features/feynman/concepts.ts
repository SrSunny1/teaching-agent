/**
 * 费曼追问的「课程概念起点」。
 *
 * 不是标准答案，也不是评分依据；只是把学生最容易「以为自己懂了」的概念
 * 和大纲里列出的常见错误摆出来，点一下就能让 Agent 开始追问。
 */

export interface FeynmanConcept {
  id: string
  concept: string
  /** 这个概念最容易被追问的地方 */
  blindSpot: string
  /** 从课程讲义/教学大纲整理出的常见错误 */
  misconception: string
}

export const concepts: FeynmanConcept[] = [
  {
    id: 'undercooling',
    concept: '过冷度与冷却曲线',
    blindSpot: '冷却曲线上的水平段为什么出现，过冷度与冷却速度是什么关系。',
    misconception: '把过冷度只当成一个温度差来背，解释不了「冷速越大，过冷度越大」，也说不清没有过冷度为什么不能结晶。',
  },
  {
    id: 'nucleation',
    concept: '均匀形核与非均匀形核',
    blindSpot: '晶坯、晶核、临界晶核尺寸分别是什么，非均匀形核为什么更普遍。',
    misconception: '把「均匀形核」理解成「在均匀的液体里形核」，却说不清它和非均匀形核在能量上的差别。',
  },
  {
    id: 'sample-prep',
    concept: '金相试样制备五步',
    blindSpot: '取样、镶样、磨光、抛光、腐蚀各自解决什么问题，哪一步最容易引入缺陷。',
    misconception: '只会背五个步骤，把「腐蚀越深组织越清楚」当成经验，忽略了过腐蚀会产生假象。',
  },
  {
    id: 'phase-vs-microstructure',
    concept: '相与微观组织',
    blindSpot: '珠光体为什么是组织组成物而不是单一相，组织组成物和相组成物怎么分别写。',
    misconception: '把显微镜下的颜色或明暗直接当成相，或者把「铁素体 + 珠光体」说成只有两种相。',
  },
  {
    id: 'vickers',
    concept: '维氏硬度与压痕测量',
    blindSpot: '压痕对角线怎么测，试验力和保荷时间为什么要选，压痕大小与硬度是什么关系。',
    misconception: '认为压痕越大硬度越高；测量前不校准零刻度，或者不同材料用同一个试验力。',
  },
  {
    id: 'thermal-expansion',
    concept: '热膨胀的微观机理',
    blindSpot: '为什么简谐振动解释不了热膨胀，非简谐振动怎样导致平均间距增大。',
    misconception: '说「温度升高，原子振幅变大，所以原子间距变大」，但说不出势能曲线不对称这一关键。',
  },
  {
    id: 'tempering',
    concept: '回火三区间与硬度',
    blindSpot: '低温、中温、高温回火分别得到什么组织、用于什么零件，硬度为什么随温度下降。',
    misconception: '把「回火温度越高硬度越高」记反；或者把通用碳钢区间和教材 45 钢实测区间混在一起。',
  },
  {
    id: 'fe-c-diagram',
    concept: '铁碳相图与组织',
    blindSpot: '727℃、1148℃、0.77%C、2.11%C、4.3%C 这些关键点分别对应什么转变。',
    misconception: '把高温莱氏体的相组成直接写进室温观察报告，或者把相组成物和组织组成物混为一谈。',
  },
  {
    id: 'stacking',
    concept: 'FCC 与 HCP 的堆垛顺序',
    blindSpot: 'ABCABC 与 ABAB 怎么画，堆垛顺序怎样影响滑移系和塑性各向异性。',
    misconception: '只画一层密排面，不标 A/B/C 层位置；或者把 FCC 和 HCP 的堆垛顺序记混。',
  },
  {
    id: 'bcc-plane',
    concept: 'BCC 的密排面',
    blindSpot: 'BCC 的 (110) 面为什么不是真正的密排面，这对 BCC 金属塑性意味着什么。',
    misconception: '看到 BCC (110) 面密度最高，就把它和 FCC (111)、HCP (0001) 当成同一种「密排面」。',
  },
]
