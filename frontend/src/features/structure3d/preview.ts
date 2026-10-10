/**
 * A3 开发预览数据。
 * 改这里不影响后端；正式数据由 load_structure 工具下发（形状见 README.md 的「三、契约」）。
 */
export default {
  structure: 'fcc',
  feature: 'cell',
  // 面心立方常规晶胞：8 顶点 + 6 面心
  atoms: [
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },
    { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 1 },
    { x: 0.5, y: 0, z: 0.5 }, { x: 0.5, y: 1, z: 0.5 },
    { x: 0, y: 0.5, z: 0.5 }, { x: 1, y: 0.5, z: 0.5 },
  ],
  bonds: [
    [8, 0], [8, 1], [8, 2], [8, 3],
    [9, 4], [9, 5], [9, 6], [9, 7],
  ],
  sites: [],
  cell: { a: 1, b: 1, c: 1 },
  stacking: 'ABCABC…（密排面 {111}）',
  params: { atomsPerCell: 4, coordination: 12, packing: 0.74, nearestNeighbor: 0.7071 },
}
