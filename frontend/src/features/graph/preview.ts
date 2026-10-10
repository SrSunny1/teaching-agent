/**
 * A4/A5 开发预览数据。
 * 正式数据由 query_graph 工具下发，或读 data/graph.json。
 */
export default {
  mode: 'knowledge',
  nodes: [
    { id: 'carbon', label: '含碳量', type: '成分', desc: '决定碳钢室温组织的最基本变量', refs: [] },
    { id: 'quenching', label: '淬火', type: '工艺', desc: '加热到相变温度以上后快冷', refs: [] },
    { id: 'tempering', label: '回火', type: '工艺', desc: '淬火后重新加热到 Ac1 以下', refs: [] },
    { id: 'martensite', label: '马氏体', type: '相', desc: '淬火产物，硬度高脆性大', refs: [] },
    { id: 'pearlite', label: '珠光体', type: '组织', desc: '铁素体与渗碳体的层片状混合物', refs: [] },
    { id: 'hardness', label: '硬度', type: '性能', desc: '抵抗硬物压入表面的能力', refs: [] },
    { id: 'toughness', label: '塑性韧性', type: '性能', desc: '粗大晶粒会降低韧性', refs: [] },
  ],
  edges: [
    { source: 'quenching', target: 'martensite', relation: '因果' },
    { source: 'quenching', target: 'tempering', relation: '前置依赖' },
    { source: 'carbon', target: 'pearlite', relation: '因果' },
    { source: 'martensite', target: 'hardness', relation: '因果' },
    { source: 'hardness', target: 'toughness', relation: '对比' },
  ],
  focus: null,
}
