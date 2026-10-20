import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { FeatureProps } from '../../lib/types'
import { concepts } from './knowledge'

interface Atom { x: number; y: number; z: number }
interface Site extends Atom { kind: string }
interface Payload {
  structure?: 'sc' | 'bcc' | 'fcc' | 'hcp'
  feature?: string
  atoms?: Atom[]
  bonds?: [number, number][]
  sites?: Site[]
  cell?: { a: number; b: number; c: number }
  stacking?: string | null
  params?: {
    atomsPerCell: number
    coordination: number
    packing: number
    nearestNeighbor: number
    /** 原子恰好相切时的 r/a（后端算）。半径滑杆以它为单位：t=1 即最近邻正好接触 */
    tangentRadiusRatio?: number
  }
}

const STRUCT_LABEL: Record<string, string> = {
  sc: '简单立方', bcc: '体心立方', fcc: '面心立方', hcp: '密排六方',
}

/**
 * 两类原子的图例文案 —— 顺带把「每晶胞原子数是怎么数出来的」摆在明面上。
 *
 * 分数是各类原子对**单个晶胞**的贡献（角上被 8 个晶胞共用 → 只算 1/8）。
 * 各结构加起来正好等于后端给的 atomsPerCell：
 *   sc  8×1/8 = 1；bcc 8×1/8+1 = 2；fcc 8×1/8+6×1/2 = 4；
 *   hcp 12×1/6 + 2×1/2 + 3×1 = 6（六方棱柱顶点被 6 个棱柱共用）
 * HCP 的非顶点原子混了两种分数，所以那一项如实写明，不硬凑成一句。
 */
const ATOM_ROLE: Record<string, { corner: string; rest: string }> = {
  sc: { corner: '角原子 · 1/8', rest: '' },
  bcc: { corner: '角原子 · 1/8', rest: '体心原子 · 1' },
  fcc: { corner: '角原子 · 1/8', rest: '面心原子 · 1/2' },
  hcp: { corner: '棱柱顶点 · 1/6', rest: '底面心 1/2 + 内部 1' },
}
type View = 'cell' | 'octahedral' | 'tetrahedral'
const VIEWS: { id: View; label: string; kind?: string }[] = [
  { id: 'cell', label: '晶胞结构' },
  { id: 'octahedral', label: '八面体间隙', kind: '八面体间隙' },
  { id: 'tetrahedral', label: '四面体间隙', kind: '四面体间隙' },
]

const COLORS = {
  atom: '#6b9fff', atomLight: '#b9d2ff', bond: '#7191c5', frame: '#7194ca',
  octa: '#f4bd56', tetra: '#55d6b0', cut: '#6b9fff',
  // 相切时点亮的那根最近邻键 —— 用近白色，跟原子蓝、间隙黄/绿都不撞
  anchor: '#eaf1ff',
}

/** 半径滑杆的三档状态。阈值 0.98 / 1.02 留 2% 容差，避免拖动时在两个标签间跳。 */
const RADIUS_STATES = {
  gap: {
    label: '仍有空隙',
    border: 'var(--border-soft)', bg: 'transparent', color: 'var(--text-muted)',
  },
  tangent: {
    label: '✅ 恰好相切',
    border: 'var(--accent-border)', bg: 'var(--accent-soft)', color: 'var(--accent)',
  },
  overlap: {
    label: '⚠️ 原子重叠（物理上不允许）',
    border: 'var(--err)', bg: 'var(--err-soft)', color: 'var(--err)',
  },
} as const

type RadiusState = keyof typeof RADIUS_STATES

/** 滑杆范围：再小原子缩成点看不出结构，再大重叠得太夸张。1.0 落在中间偏右。 */
const RADIUS_MIN = 0.55
const RADIUS_MAX = 1.12

function toVec(p: Atom, cell: Payload['cell'] & object, structure?: Payload['structure']): [number, number, number] {
  if (structure === 'hcp') return [p.x * cell.a, p.y * cell.b, p.z - cell.c / 2]
  return [(p.x - 0.5) * cell.a, (p.y - 0.5) * cell.b, (p.z - 0.5) * cell.c]
}

function visibleInCut(p: Atom, structure?: Payload['structure']) {
  return structure === 'hcp' ? p.x >= -0.001 : p.x >= 0.5 - 0.001
}

function edgePairs(structure?: Payload['structure']): [number, number][] {
  if (structure === 'hcp') return [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6],
    [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11],
  ]
  return [
    [0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
}

function framePoints(cell: Payload['cell'] & object, structure?: Payload['structure']): [number, number, number][] {
  if (structure === 'hcp') {
    const points: [number, number, number][] = []
    for (const z of [-cell.c / 2, cell.c / 2]) {
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3
        points.push([Math.cos(angle) * cell.a, Math.sin(angle) * cell.b, z])
      }
    }
    return points
  }
  const { a, b, c } = cell
  return [
    [-a / 2, -b / 2, -c / 2], [a / 2, -b / 2, -c / 2], [-a / 2, b / 2, -c / 2], [a / 2, b / 2, -c / 2],
    [-a / 2, -b / 2, c / 2], [a / 2, -b / 2, c / 2], [-a / 2, b / 2, c / 2], [a / 2, b / 2, c / 2],
  ]
}

function Rod({ start, end, radius, color, opacity = 1 }: {
  start: [number, number, number]; end: [number, number, number]; radius: number; color: string; opacity?: number
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...start)
    const b = new THREE.Vector3(...end)
    const direction = new THREE.Vector3().subVectors(b, a)
    const length = direction.length()
    return {
      position: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).toArray() as [number, number, number],
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      length,
    }
  }, [start, end])
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.35} metalness={0.45} />
    </mesh>
  )
}

function CellFrame({ cell, structure, cutaway }: {
  cell: Payload['cell'] & object; structure?: Payload['structure']; cutaway: boolean
}) {
  const points = framePoints(cell, structure)
  const pairs = edgePairs(structure)
  return <group>
    {pairs.map(([i, j], index) => {
      const a = points[i]
      const b = points[j]
      if (cutaway && (a[0] < -0.001 && b[0] < -0.001)) return null
      return <Rod key={index} start={a} end={b} radius={0.009} color={COLORS.frame} opacity={0.78} />
    })}
  </group>
}

function Atoms({ atoms, cell, radius, structure, cutaway }: {
  atoms: Atom[]; cell: Payload['cell'] & object; radius: number; structure?: Payload['structure']; cutaway: boolean
}) {
  return <group>
    {atoms.map((atom, index) => {
      if (cutaway && !visibleInCut(atom, structure)) return null
      const [x, y, z] = toVec(atom, cell, structure)
      const corner = structure === 'hcp'
        ? Math.abs(Math.hypot(atom.x, atom.y) - 1) < 0.02 && (atom.z < 0.01 || atom.z > cell.c - 0.01)
        : [atom.x, atom.y, atom.z].every((v) => v === 0 || v === 1)
      // ★ 不再按角/面区分大小 —— 同一个晶胞里本来就是同一种原子，而且这个模块要展示
      //   「恰好相切」，球一大一小的话相切在画面上就是假的，教学点就塌了。
      //   角原子只保留颜色区分（仍能一眼看出被相邻晶胞共享的那一类）。
      const size = radius
      return <group key={index} position={[x, y, z]}>
        <mesh>
          <sphereGeometry args={[size * 1.18, 28, 22]} />
          <meshBasicMaterial color={COLORS.atom} transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[size, 32, 24]} />
          <meshPhysicalMaterial
            color={corner ? COLORS.atom : COLORS.atomLight}
            emissive={corner ? '#183b78' : '#254878'}
            emissiveIntensity={0.28}
            roughness={0.24}
            metalness={0.22}
            clearcoat={0.78}
            clearcoatRoughness={0.2}
          />
        </mesh>
      </group>
    })}
  </group>
}

function Bonds({ atoms, bonds, cell, radius, structure, cutaway, tangent }: {
  atoms: Atom[]; bonds: [number, number][]; cell: Payload['cell'] & object; radius: number
  structure?: Payload['structure']; cutaway: boolean; tangent: boolean
}) {
  return <group>
    {bonds.map(([i, j], index) => {
      const a = atoms[i]
      const b = atoms[j]
      if (!a || !b || (cutaway && (!visibleInCut(a, structure) || !visibleInCut(b, structure)))) return null
      // 相切时点亮第一根最近邻键：它就是「2r = 最近邻距离」那句话的视觉锚点
      const anchor = tangent && index === 0
      return <Rod key={index} start={toVec(a, cell, structure)} end={toVec(b, cell, structure)}
        radius={radius * (anchor ? 0.26 : 0.12)}
        color={anchor ? COLORS.anchor : COLORS.bond} opacity={anchor ? 1 : 0.68} />
    })}
  </group>
}

function Sites({ sites, cell, radius, structure, cutaway }: {
  sites: Site[]; cell: Payload['cell'] & object; radius: number; structure?: Payload['structure']; cutaway: boolean
}) {
  return <group>
    {sites.map((site, index) => {
      if (cutaway && !visibleInCut(site, structure)) return null
      const [x, y, z] = toVec(site, cell, structure)
      const color = site.kind === '八面体间隙' ? COLORS.octa : COLORS.tetra
      return <group key={index} position={[x, y, z]}>
        <mesh>
          <sphereGeometry args={[radius * 0.92, 20, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} />
        </mesh>
        <mesh>
          <octahedronGeometry args={[radius * 0.55, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.42} roughness={0.24} metalness={0.28} />
        </mesh>
      </group>
    })}
  </group>
}

function CutPlane({ cell }: { cell: Payload['cell'] & object }) {
  return <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
    <planeGeometry args={[cell.b * 1.8, cell.c * 1.8]} />
    <meshBasicMaterial color={COLORS.cut} transparent opacity={0.055} side={THREE.DoubleSide} depthWrite={false} />
  </mesh>
}

function CrystalScene({ data, view, cutaway, radiusScale }: {
  data: Payload; view: View; cutaway: boolean; radiusScale: number
}) {
  const cell = data.cell ?? { a: 1, b: 1, c: 1 }
  const atoms = data.atoms ?? []
  const bonds = data.bonds ?? []
  const structure = data.structure
  // ★ radiusScale = 1 时 r = 最近邻距离/2 → 最近邻两球表面恰好接触。
  //   （旧写法是 nearestNeighbor * 0.255，画的是球棍模型那种「缩小球」，
  //     球永远碰不到一起，也就没法演示致密度。）
  const radius = (data.params?.nearestNeighbor ?? 0.7071) / 2 * radiusScale
  const tangent = Math.abs(radiusScale - 1) <= 0.02
  const activeKind = VIEWS.find((item) => item.id === view)?.kind
  const sites = activeKind ? (data.sites ?? []).filter((site) => site.kind === activeKind) : []

  return <>
    <color attach="background" args={['#101725']} />
    <fog attach="fog" args={['#101725', 4.5, 9]} />
    <ambientLight intensity={0.72} />
    <directionalLight position={[4, 5, 6]} intensity={2.1} color="#dce9ff" />
    <pointLight position={[-3, 1, -2]} intensity={16} distance={8} color="#3978d8" />
    <pointLight position={[2, -2, 3]} intensity={8} distance={6} color="#64d7bd" />
    <gridHelper args={[3.4, 17, '#355071', '#243448']} position={[0, -0.85, 0]} />
    <CellFrame cell={cell} structure={structure} cutaway={cutaway} />
    {cutaway && <CutPlane cell={cell} />}
    <Bonds atoms={atoms} bonds={bonds} cell={cell} radius={radius} structure={structure} cutaway={cutaway} tangent={tangent} />
    <Atoms atoms={atoms} cell={cell} radius={radius} structure={structure} cutaway={cutaway} />
    {sites.length > 0 && <Sites sites={sites} cell={cell} radius={radius} structure={structure} cutaway={cutaway} />}
    <OrbitControls enableDamping dampingFactor={0.075} minDistance={1.8} maxDistance={8} makeDefault />
    <GizmoHelper alignment="bottom-right" margin={[42, 42]}>
      <GizmoViewport axisColors={['#f27878', '#55d6b0', '#6b9fff']} labels={['X轴', 'Y轴', 'Z轴']} labelColor="#dce7f7" />
    </GizmoHelper>
  </>
}

export default function Component({ artifact, onSendMessage, onEmitArtifact }: FeatureProps) {
  const data = (artifact?.data ?? null) as Payload | null
  const [view, setView] = useState<View>('cell')
  const [cutaway, setCutaway] = useState(false)
  // ★ 原子半径滑杆。跟 cutaway 一样是**纯视图设置**：只存本地、不发 onEmitArtifact，
  //   否则拖动时每一帧都在刷整块 artifact（壳那边是整块替换，代价白付）。
  //   代价是新产物到达时会被 useEffect 重置回 1 —— 与 cutaway 的既有行为一致。
  const [radiusScale, setRadiusScale] = useState(1)

  useEffect(() => {
    const feature = data?.feature
    setView(feature === 'octahedral' || feature === 'tetrahedral' ? feature : 'cell')
    setCutaway(false)
    setRadiusScale(1)
  }, [data])

  const chooseView = (next: View) => {
    setView(next)
    if (data) onEmitArtifact('visual3d', { ...data, feature: next })
  }

  const structure = data?.structure ?? 'fcc'
  const label = STRUCT_LABEL[structure] ?? structure
  const params = data?.params
  const activeKind = VIEWS.find((item) => item.id === view)?.kind
  const siteCount = activeKind ? (data?.sites ?? []).filter((site) => site.kind === activeKind).length : 0
  const hasData = Boolean(data?.atoms?.length)

  // ── 半径滑杆读数 ──
  // 相切半径 r/a 由后端给；没有就退回「最近邻距离的一半」（几何上等价）。
  const tangentRatio = params ? (params.tangentRadiusRatio ?? params.nearestNeighbor / 2) : null
  const radiusNow = tangentRatio != null ? tangentRatio * radiusScale : null
  // 球体积 ∝ r³，所以致密度随 t³ 缩放。t=1 时正好等于后端给的教材值。
  const packingNow = params ? params.packing * radiusScale ** 3 : null
  const radiusState: RadiusState = radiusScale < 0.98 ? 'gap' : radiusScale > 1.02 ? 'overlap' : 'tangent'
  const st = RADIUS_STATES[radiusState]

  return <div className="feat" style={{ height: '100%', minHeight: 0, overflowY: 'auto', padding: 0 }}>
    <div style={{ padding: '16px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
        <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', fontWeight: 700 }}>晶体结构可视化</span>
        <span style={{ height: 1, flex: 1, background: 'var(--border-soft)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>{label}</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>交互式晶胞模型</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {VIEWS.map((item) => <button key={item.id} className="chip" onClick={() => chooseView(item.id)}
          aria-pressed={view === item.id}
          style={view === item.id ? { color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' } : undefined}>
          {item.label}
        </button>)}
        <span style={{ flex: 1 }} />
        <button className="chip" onClick={() => setCutaway((value) => !value)} aria-pressed={cutaway}
          title="移除晶胞近侧的一半原子，观察内部排列"
          style={cutaway ? { color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' } : undefined}>
          {cutaway ? '剖视已开启' : '剖视内部'}
        </button>
      </div>
    </div>

    <div style={{ position: 'relative', height: 'clamp(290px, 47vh, 520px)', margin: '0 10px', overflow: 'hidden', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-soft)', background: 'radial-gradient(ellipse at 52% 43%, #1b2c42 0%, #111b29 52%, #10151f 100%)' }}>
      {!hasData ? <div className="box" style={{ margin: 14 }}>在对话里询问晶胞或间隙结构，Agent 会加载对应的 3D 模型。</div> : (
        <Canvas camera={{ position: [2.45, 1.9, 2.55], fov: 39 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
          <CrystalScene data={data!} view={view} cutaway={cutaway} radiusScale={radiusScale} />
        </Canvas>
      )}
      <div style={{ position: 'absolute', left: 12, top: 11, display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px', border: '1px solid rgba(160,190,230,.15)', borderRadius: 'var(--r-sm)', background: 'rgba(12,19,29,.68)', backdropFilter: 'blur(8px)', color: '#d7e5fa', fontSize: 'var(--fs-xs)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 9px var(--ok)' }} />
        拖动旋转 <span style={{ color: '#687d99' }}>·</span> 滚轮缩放
      </div>
      {data?.stacking && <div style={{ position: 'absolute', left: 12, bottom: 11, padding: '6px 9px', borderRadius: 'var(--r-sm)', border: '1px solid rgba(160,190,230,.15)', background: 'rgba(12,19,29,.68)', backdropFilter: 'blur(8px)', color: '#cbd9ee', fontSize: 'var(--fs-xs)' }}>
        密排层序 <strong style={{ color: '#fff', marginLeft: 5 }}>{data.stacking}</strong>
      </div>}
    </div>

    <div style={{ padding: '13px 16px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        <Metric label="晶胞原子数" value={params?.atomsPerCell ?? '—'} detail="个 / 晶胞" />
        <Metric label="配位数" value={params?.coordination ?? '—'} detail="最近邻原子数" />
        <Metric label="理论堆积因子" value={params ? `${Math.round(params.packing * 100)}%` : '—'} detail="教材值 · 相切时" />
      </div>

      {/* ── 原子半径滑杆 ────────────────────────────────────────────
          把「致密度 0.74」从一个要背的结论，变成学生自己拖出来的实验：
          拖到 r 恰好相切，读数才等于教材值；拖过头则原子重叠。 */}
      {params && radiusNow != null && packingNow != null && (
        <div style={{
          marginTop: 9, padding: '10px 12px 11px',
          border: `1px solid ${st.border}`, borderRadius: 'var(--r-md)', background: st.bg,
        }}>
          <div className="kv" style={{ border: 'none', paddingBottom: 0 }}>
            <span>原子半径</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>r = {radiusNow.toFixed(3)} a</span>
          </div>
          <input
            type="range"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={0.01}
            value={radiusScale}
            onChange={(e) => setRadiusScale(Number(e.target.value))}
            aria-label="原子半径，1.0 表示最近邻原子恰好相切"
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div className="kv" style={{ border: 'none', paddingBottom: 0 }}>
            <span>当前致密度</span>
            <span style={{ color: st.color, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
              {(packingNow * 100).toFixed(2)}%
            </span>
          </div>
          <div className="kv" style={{ border: 'none' }}>
            <span>状态</span>
            <span style={{ color: st.color }}>{st.label}</span>
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-faint)', fontSize: 'var(--fs-xs)', lineHeight: 1.55 }}>
            {radiusState === 'tangent'
              ? `2r = 最近邻距离 ${params.nearestNeighbor.toFixed(3)} a，相邻原子球面刚好接触 —— 此时致密度正是教材值。`
              : `拖到 r = ${tangentRatio!.toFixed(3)} a 时原子恰好相切，致密度回到 ${Math.round(params.packing * 100)}%。`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
        <Legend color={COLORS.atom} label={ATOM_ROLE[structure]?.corner ?? '晶格原子'} />
        {ATOM_ROLE[structure]?.rest && <Legend color={COLORS.atomLight} label={ATOM_ROLE[structure].rest} />}
        <Legend color={COLORS.bond} label="最近邻键" />
        <Legend color={COLORS.octa} label="八面体间隙" />
        <Legend color={COLORS.tetra} label="四面体间隙" />
        {activeKind && <span style={{ marginLeft: 'auto' }}>当前高亮 {siteCount} 个位置</span>}
      </div>
      {params && <button className="chip" style={{ marginTop: 13, width: '100%' }}
        onClick={() => onSendMessage(`请结合当前 ${label} 模型，讲解它的原子排列、每晶胞原子数 ${params.atomsPerCell} 和配位数 ${params.coordination}。`)}>
        让 Agent 讲解当前结构
      </button>}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-sm)', padding: '4px 0' }}>
          晶体学要点 · {concepts.length} 条（点击展开）
        </summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {concepts.map((card) => (
            <article key={card.id} style={{
              padding: '10px 11px', border: '1px solid var(--border-soft)',
              borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)',
            }}>
              <strong style={{ fontSize: 'var(--fs-sm)' }}>{card.title}</strong>
              <p style={{ margin: '5px 0 0', fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--text-dim)' }}>{card.fact}</p>
              <p style={{ margin: '5px 0 0', fontSize: 'var(--fs-xs)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                <strong>辨析边界：</strong>{card.caution}
              </p>
              <button className="chip" style={{ marginTop: 8 }}
                onClick={() => onSendMessage(card.question)}>
                追问 Agent
              </button>
            </article>
          ))}
        </div>
      </details>
    </div>
  </div>
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div style={{ minWidth: 0, padding: '9px 10px', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)', background: 'var(--bg-elevated)' }}>
    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>{label}</div>
    <div style={{ color: 'var(--text)', fontSize: 'var(--fs-lg)', lineHeight: 1.25, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: '9px', letterSpacing: '0.03em' }}>{detail}</div>
  </div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}66` }} />{label}
  </span>
}
