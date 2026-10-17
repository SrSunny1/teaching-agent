import { additionalCases } from './additionalCases'

export interface Micrograph {
  id: string
  title: string
  group: string
  file: string
  author: string
  license: 'CC BY 4.0' | 'CC BY-SA 4.0' | 'CC BY-SA 3.0' | 'Public domain'
  extension?: 'png'
  conditions: string
  question: string
}

export const cases: Micrograph[] = [
  { id: 'spheroid', title: '球化珠光体 · TEM', group: '钢组织', file: 'PearliteSph3.jpg', author: 'Eduard Pleshakov', license: 'Public domain', conditions: '来源描述为共析钢球化退火后的TEM图。外部示例，非光学图；教材处理参数未核对。', question: '比较颗粒状特征与片状珠光体；哪些差异可能来自成像方式？' },
  { id: 'alsi', title: '铝硅合金 · 显微组织', group: '有色合金', file: 'Al-Si Microstructure.png', extension: 'png', author: 'Djegan', license: 'CC BY-SA 3.0', conditions: '来源确认Al-Si试样；成分与共晶类别未确认。原始制备记录见来源，教材未核对，不作为工艺建议。', question: '描述不同区域的轮廓和分布；判断初晶、共晶区域还需要哪些成分证据？' },
  { id: 'al6061', title: '6061铝合金 · 晶界观察', group: '有色合金', file: '6061 Aluminum Grain Boundaries.png', extension: 'png', author: 'Bob Clemintime', license: 'CC BY-SA 4.0', conditions: '来源标注6061-T6板材表面，经抛光及Keller试剂腐蚀。用于晶界形貌拓展，不等同于铸造铝硅合金。', question: '描述晶界轮廓与其他深色特征，为什么不能仅凭颜色把它们定为同一种相？' },
  { id: 'brass', title: '黄铜 · 晶粒形貌', group: '有色合金', file: 'Microstructure of rolled and annealed brass; magnification 400X.jpg', author: 'Strangerhahaha', license: 'Public domain', conditions: '来源标题称轧制退火黄铜，上传历史称铸态黄铜，处理状态存在冲突。本例仅观察形貌，不推断具体工艺、牌号或相组成。', question: '记录晶粒轮廓和晶内线条；哪些结论因处理状态不明必须保留？' },
  { id: 'c35', title: 'C35钢 · 铁素体与珠光体', group: '钢组织', file: 'C35_ferrit_perlit.jpg', author: 'Eisenbeisser', license: 'CC BY-SA 4.0', conditions: '来源标注含碳量0.35%；热处理状态、倍率待核对。外部数据，教材未核对。', question: '描述亮暗区域的形态、分布，以及你判断组织的依据。' },
  { id: 'pearlite-sem', title: '珠光体与铁素体 · SEM', group: '钢组织', file: 'Pearlite.jpg', author: 'Michelshock', license: 'Public domain', conditions: '来源标注扫描电镜、2000倍、3%硝酸酒精腐蚀；不是光学金相图。外部数据，教材未核对。', question: '记录层片细节，并说明它与光学显微照片的观察条件有何不同。' },
  { id: 'austenite', title: '304不锈钢 · 奥氏体', group: '钢组织', file: 'AISI_304_-_austenitic_structure.jpg', author: 'Melancholia~itwiki', license: 'CC BY-SA 4.0', conditions: '来源标注AISI 304；不可作为普通碳钢室温奥氏体案例。处理状态与标尺待核对。', question: '描述晶粒轮廓和晶内线条；哪些判断还需要材料与处理条件？' },
  { id: 'gray', title: '灰铸铁', group: '铸铁组织', file: 'Fundición_gris_tipo_A.JPG', author: 'Remux', license: 'CC BY-SA 4.0', conditions: '来源标注A型灰铸铁；基体组成、处理状态与标尺待教师核对。', question: '描述深色区域的形状、方向与分布，并与球墨铸铁比较。' },
  { id: 'ductile', title: '球墨铸铁', group: '铸铁组织', file: 'Cast_iron_ductile.jpg', author: 'Perlit86', license: 'CC BY 4.0', conditions: '来源标注球墨铸铁；牌号、基体组成与处理状态未确认。', question: '描述深色区域的轮廓与周围基体，列出与灰铸铁不同的证据。' },
  { id: 'malleable', title: '可锻铸铁', group: '铸铁组织', file: 'Cast_iron_malleable.jpg', author: 'Perlit86', license: 'CC BY 4.0', conditions: '来源标注可锻铸铁；牌号、处理参数与标尺未确认。', question: '比较深色区域的形态与聚集方式，不仅凭颜色判断材料。' },
  { id: 'white', title: '白口铸铁', group: '铸铁组织', file: 'Cast_iron_white.jpg', author: 'Perlit86', license: 'CC BY 4.0', conditions: '来源未确认共晶类别；不能据此补写含碳量或莱氏体区域标注。', question: '记录组织形态与分布；要判断共晶类别还缺哪些信息？' },
  ...additionalCases,
]

export const caseGroups = [...new Set(cases.map(item => item.group))]
const images = import.meta.glob('./assets/*.{jpg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const imageUrl = (item: Micrograph) => images[`./assets/${item.id}.${item.extension ?? 'jpg'}`]
export const sourceUrl = (item: Micrograph) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.file)}`
export const licenseUrl = (item: Micrograph) => item.license === 'Public domain' ? sourceUrl(item) : `https://creativecommons.org/licenses/${item.license === 'CC BY 4.0' ? 'by' : 'by-sa'}/${item.license === 'CC BY-SA 3.0' ? '3.0' : '4.0'}/`
