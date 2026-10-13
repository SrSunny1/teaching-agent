import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { FeatureProps } from '../../lib/types'

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
  params?: { atomsPerCell: number; coordination: number; packing: number; nearestNeighbor: number }
}

const STRUCT_LABEL: Record<string, string> = {
  sc: '简单立方', bcc: '体心立方', fcc: '面心立方', hcp: '密排六方',
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
}

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
      const size = radius * (corner ? 0.92 : 1.13)
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

function Bonds({ atoms, bonds, cell, radius, structure, cutaway }: {
  atoms: Atom[]; bonds: [number, number][]; cell: Payload['cell'] & object; radius: number
  structure?: Payload['structure']; cutaway: boolean
}) {
  return <group>
    {bonds.map(([i, j], index) => {
      const a = atoms[i]
      const b = atoms[j]
      if (!a || !b || (cutaway && (!visibleInCut(a, structure) || !visibleInCut(b, structure)))) return null
      return <Rod key={index} start={toVec(a, cell, structure)} end={toVec(b, cell, structure)}
        radius={radius * 0.12} color={COLORS.bond} opacity={0.68} />
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

function CrystalScene({ data, view, cutaway }: { data: Payload; view: View; cutaway: boolean }) {
  const cell = data.cell ?? { a: 1, b: 1, c: 1 }
  const atoms = data.atoms ?? []
  const bonds = data.bonds ?? []
  const structure = data.structure
  const radius = (data.params?.nearestNeighbor ?? 0.7071) * 0.255
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
    <Bonds atoms={atoms} bonds={bonds} cell={cell} radius={radius} structure={structure} cutaway={cutaway} />
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

  useEffect(() => {
    const feature = data?.feature
    setView(feature === 'octahedral' || feature === 'tetrahedral' ? feature : 'cell')
    setCutaway(false)
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
          <CrystalScene data={data!} view={view} cutaway={cutaway} />
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
        <Metric label="原子堆积因子" value={params ? `${Math.round(params.packing * 100)}%` : '—'} detail="原子体积分数" />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
        <Legend color={COLORS.atom} label="晶格原子" />
        <Legend color={COLORS.bond} label="最近邻键" />
        <Legend color={COLORS.octa} label="八面体间隙" />
        <Legend color={COLORS.tetra} label="四面体间隙" />
        {activeKind && <span style={{ marginLeft: 'auto' }}>当前高亮 {siteCount} 个位置</span>}
      </div>
      {params && <button className="chip" style={{ marginTop: 13, width: '100%' }}
        onClick={() => onSendMessage(`请结合当前 ${label} 模型，讲解它的原子排列、每晶胞原子数 ${params.atomsPerCell} 和配位数 ${params.coordination}。`)}>
        让 Agent 讲解当前结构
      </button>}
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
