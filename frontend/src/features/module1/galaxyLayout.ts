/**
 * 星系 3D 布局：把知识点树安放进真三维空间。
 *   - 一级核心恒星位于原点；
 *   - 六大二级星系中心取自 SECTORS.center（立体六芒分布，非平面）；
 *   - 三级专题在所属星系的倾斜轨道面上成环（带法向抖动）；
 *   - 四/五级知识点绕父节点、沿「星系中心 → 父节点」方向向外扇形展开；
 *   - 最后做全局斥力松弛，保证星点互不遮挡。
 * 单位为 three.js 世界坐标，节点半径见 LEVEL_STYLE.radius3d。
 */
import { KNOWLEDGE_NODES, SECTORS, childrenOf, nodeById } from './graphData'

export type Vec3 = [number, number, number]

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function rot(v: Vec3, t: readonly number[]): Vec3 {
  let [x, y, z] = v
  const [rx, ry, rz] = t
  let c = Math.cos(rx)
  let s = Math.sin(rx)
  ;[y, z] = [y * c - z * s, y * s + z * c]
  c = Math.cos(ry)
  s = Math.sin(ry)
  ;[x, z] = [x * c + z * s, -x * s + z * c]
  c = Math.cos(rz)
  s = Math.sin(rz)
  ;[x, y] = [x * c - y * s, x * s + y * c]
  return [x, y, z]
}

/** 星系轨道面的正交基：u / w 为盘面两轴，n 为法向 */
export function tiltBasis(tilt: readonly number[]): [Vec3, Vec3, Vec3] {
  return [rot([1, 0, 0], tilt), rot([0, 0, 1], tilt), rot([0, 1, 0], tilt)]
}

/** 稳定的字符串散列，保证每次渲染布局一致 */
function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

export const GALAXY_POS: Map<string, Vec3> = (() => {
  const pos = new Map<string, Vec3>()
  pos.set('root', [0, 0, 0])

  // 二级：六大星系团中心（来自 SECTORS.center 的真 3D 坐标）
  const l2 = new Map<number, string>()
  for (const n of KNOWLEDGE_NODES) {
    if (n.level !== 2) continue
    l2.set(n.sector, n.id)
    const c = SECTORS[n.sector]?.center ?? [0, 0, 0]
    pos.set(n.id, [c[0], c[1], c[2]])
  }

  // 三级：在所属星系的倾斜轨道面上成环
  SECTORS.forEach((sec, i) => {
    const cid = l2.get(i)
    if (!cid) return
    const c = pos.get(cid)!
    const [u, w, nrm] = tiltBasis(sec.tilt)
    const kids = childrenOf(cid).filter((k) => k.level === 3)
    const r = 6.4
    kids.forEach((k, j) => {
      const a = (j / Math.max(1, kids.length)) * Math.PI * 2 + i * 0.62
      const ring = add(scale(u, Math.cos(a) * r), scale(w, Math.sin(a) * r))
      pos.set(k.id, add(add(c, ring), scale(nrm, ((j % 3) - 1) * 0.85)))
    })
  })

  // 四/五级：绕父节点、沿「星系中心 → 父节点」向外扇形展开
  const placeSub = (level: 4 | 5, radius: number, out: number) => {
    for (const par of KNOWLEDGE_NODES.filter((n) => n.level === level - 1)) {
      const p = pos.get(par.id)
      if (!p) continue
      const cc = pos.get(l2.get(par.sector) ?? 'root') ?? ([0, 0, 0] as Vec3)
      const d = norm(sub(p, cc))
      const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      const u = norm(cross(d, helper))
      const w = cross(d, u)
      const kids = childrenOf(par.id).filter((k) => k.level === level)
      kids.forEach((k, j) => {
        const a = (j / Math.max(1, kids.length)) * Math.PI * 2 + seedOf(par.id) * 6.28
        const fan = add(scale(u, Math.cos(a) * radius), scale(w, Math.sin(a) * radius))
        pos.set(k.id, add(add(p, scale(d, out + (j % 2) * 0.8)), fan))
      })
    }
  }
  placeSub(4, 3.0, 1.2)
  placeSub(5, 2.2, 0.9)

  // 兜底：任何漏放的节点锚到父节点附近
  for (const n of KNOWLEDGE_NODES) {
    if (pos.has(n.id)) continue
    let anc = n.parent
    while (anc && !pos.has(anc)) anc = nodeById(anc)?.parent
    const base = anc ? pos.get(anc)! : ([0, 0, 0] as Vec3)
    pos.set(n.id, [base[0] * 1.1 + 1.6, base[1] * 1.1 - 1.2, base[2] * 1.1 + 1.0])
  }

  // 全局斥力松弛：团内 >= 1.9、跨星团 >= 2.6（单位远大于星球半径，保证不遮挡）
  const lv = (id: string) => nodeById(id)?.level ?? 1
  const sc = (id: string) => nodeById(id)?.sector ?? -1
  const ids = [...pos.keys()].filter((id) => lv(id) >= 3)
  for (let it = 0; it < 20; it += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = pos.get(ids[i])!
        const b = pos.get(ids[j])!
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const dz = b[2] - a[2]
        const dist = Math.hypot(dx, dy, dz) || 0.01
        const minD = sc(ids[i]) === sc(ids[j]) ? 1.9 : 2.6
        if (dist < minD) {
          const push = ((minD - dist) / dist) * 0.35
          pos.set(ids[i], [a[0] - dx * push, a[1] - dy * push, a[2] - dz * push])
          pos.set(ids[j], [b[0] + dx * push, b[1] + dy * push, b[2] + dz * push])
        }
      }
    }
  }
  return pos
})()
