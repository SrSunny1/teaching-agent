/**
 * 热处理工艺模型 —— 数值全部取自《教材》实验二十。
 *
 * ⚠️ 后端 app/tools/simulate_heat_treatment/ 必须复刻这套区间。
 * 改这里的任何数字，必须同步改后端并在群里通知。
 */

export type Cooling = 'furnace' | 'air' | 'water'

export interface Params {
  cooling: Cooling
  /** 回火温度 ℃；仅在水冷（淬火）时有意义 */
  temperTemp: number
  /** 含碳量 % */
  carbon: number
}

export interface Result {
  structure: string
  hardnessHrc: number
  curve: [number, number][]
  diagnosis: string
  warning: string | null
}

export const COOLING_LABEL: Record<Cooling, string> = {
  furnace: '炉冷（退火）',
  air: '空冷（正火）',
  water: '水冷（淬火）',
}

/**
 * 回火温度 → 硬度 曲线（45 钢，教材实验二十给出的三个区间）。
 *
 * 取点规则：每一段的端点都落在教材给的区间端点上。
 * 注意教材的区间本身在 250℃ 与 500℃ 附近相邻/重叠（中温 350–500℃ 是 40–48 HRC，
 * 高温 500–600℃ 是 25–35 HRC，500℃ 处两者相差 5 HRC），
 * 因此 250–350℃ 与 500–550℃ 是**过渡区**，不归属任何一个区间 —— 这是真实情况，不是模型缺陷。
 * 必须与后端 simulate_heat_treatment 的 TEMPER_CURVE 一致。
 */
export const TEMPER_CURVE: [number, number][] = [
  [150, 60],
  [200, 59],
  [250, 57],
  [300, 52],
  [350, 48],
  [400, 44],
  [450, 42],
  [500, 40],
  [510, 35],
  [550, 30],
  [600, 25],
]

/**
 * 教材在 500℃ 处自相矛盾：中温回火（350–500℃）下限 40 HRC，高温回火（500–600℃）上限 35 HRC。
 * 本模型取 500℃ 归中温回火，510℃ 起进入高温回火；500–510℃ 是不归属任何区间的过渡带。
 * 必须与后端 simulate_heat_treatment 保持一致。
 */
export const OVERLAP_NOTE =
  '教材在 500℃ 处中温/高温回火区间重叠（40 HRC vs 35 HRC），本模型取 500℃ 归中温回火。'

/** 三个区间中值，用于校验模型是否偏离教材 */
export const TEXTBOOK_BANDS = [
  { label: '低温回火 150–250℃', min: 57, max: 60, structure: '回火马氏体' },
  { label: '中温回火 350–500℃', min: 40, max: 48, structure: '回火托氏体' },
  { label: '高温回火 500–600℃', min: 25, max: 35, structure: '回火索氏体' },
]

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

function hardnessAt(t: number): number {
  const c = TEMPER_CURVE
  if (t <= c[0][0]) return c[0][1]
  if (t >= c[c.length - 1][0]) return c[c.length - 1][1]
  for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = c[i]
    const [x1, y1] = c[i + 1]
    if (t >= x0 && t <= x1) return Math.round(lerp(t, x0, y0, x1, y1))
  }
  return c[c.length - 1][1]
}

function temperStructure(t: number): string {
  if (t < 250) return '回火马氏体'
  if (t < 350) return '回火马氏体 + 回火托氏体（过渡区）'
  if (t <= 500) return '回火托氏体'
  return '回火索氏体'
}

/**
 * 含碳量对淬火硬度的影响。
 * ⚠️ 教材那条曲线本身就是 45 钢（0.45%C）的实测值，所以 0.45 处**不能**再修正，
 *    否则等于把基准重复扣一次（曾导致 200℃ 回火算成 53 HRC，落在教材 57–60 之外）。
 * 必须与后端 simulate_heat_treatment 的 _carbon_factor 保持一致。
 */
function carbonFactor(carbon: number): number {
  if (carbon >= 0.45) return 1.0
  return 0.4 + 0.6 * Math.sqrt(carbon / 0.45)
}

export function simulate(p: Params): Result {
  const carbon = Math.min(2.11, Math.max(0.02, p.carbon))

  if (p.cooling === 'furnace') {
    return {
      structure: carbon < 0.77 ? '铁素体 + 珠光体' : '珠光体 + 二次渗碳体',
      hardnessHrc: Math.round(14 + carbon * 6),
      curve: [],
      diagnosis:
        '炉冷（退火）：冷速最慢，组织接近平衡态，硬度最低、塑性最好。用于消除内应力、改善切削加工性。',
      warning: null,
    }
  }

  if (p.cooling === 'air') {
    return {
      structure: carbon < 0.77 ? '细片状珠光体（索氏体）+ 铁素体' : '索氏体 + 二次渗碳体',
      hardnessHrc: Math.round((22 + carbon * 14) * 1),
      curve: [],
      diagnosis:
        '空冷（正火）：冷速快于退火，得到较细密的索氏体，强度硬度高于退火。常作预备热处理。',
      warning: null,
    }
  }

  /* 水冷（淬火） */
  const asQuenched = Math.round(62 * carbonFactor(carbon))
  const t = p.temperTemp

  if (t <= 0) {
    return {
      structure: carbon < 0.77 ? '马氏体 + 残余奥氏体' : '马氏体 + 残余奥氏体 + 二次渗碳体',
      hardnessHrc: asQuenched,
      curve: TEMPER_CURVE,
      diagnosis:
        '淬火后不回火：硬度最高但内应力极大、脆性大，直接使用极易开裂。工程上几乎从不这样用。',
      warning: '⚠ 淬火后不回火将导致脆性过大，工件存在开裂风险。',
    }
  }

  const hardness = Math.round(hardnessAt(t) * carbonFactor(carbon))
  let diagnosis = ''
  let warning: string | null = null

  if (t < 150) {
    diagnosis = '低于常规回火温度下限（150℃），组织转变不充分，内应力消除有限。'
    warning = '⚠ 回火温度低于 150℃，不属于教材所列的三类回火。'
  } else if (t < 250) {
    diagnosis =
      '低温回火区间（150–250℃）：降低回火应力、减少脆性，同时保持高硬度。用于切削工具、量具、滚动轴承钢、渗碳钢。'
  } else if (t < 350) {
    diagnosis = '处于低温回火与中温回火之间的过渡区，实际生产中介于两者之间的工艺较少采用。'
    warning = '⚠ 350℃ 附近为回火脆性敏感区，应避开。'
  } else if (t <= 500) {
    diagnosis =
      '中温回火区间（350–500℃）：获得高的弹性极限，同时保持较高韧性。主要用于各种弹簧及热锻模具。'
  } else if (t <= 600) {
    diagnosis =
      '高温回火区间（500–600℃）：获得强度、硬度与冲击韧度的良好配合。淬火 + 高温回火称为调质处理，用于连杆、螺栓、主轴。'
  } else {
    diagnosis = '回火温度超过 600℃，已接近退火效果，硬度大幅下降，失去淬火强化的意义。'
    warning = '⚠ 回火温度高于 600℃，超出教材所列区间。'
  }

  return {
    structure: temperStructure(t),
    hardnessHrc: hardness,
    curve: TEMPER_CURVE,
    diagnosis,
    warning,
  }
}
