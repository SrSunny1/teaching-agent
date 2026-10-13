import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { FeatureProps } from '../../lib/types'

/**
 * 3D 可视化（visual3d）
 *
 * 把材料微观结构做成可交互的 3D 场景。内容取自《教材》实验一「三、实验内容」。
 *
 * 四条约定（全项目通用，见 AGENTS.md）：
 *   1. 从 props.artifact?.data 读数据
 *   2. 本地交互即时反馈 —— 切视图不发网络请求
 *   3. 需要 Agent 干活时调 props.onSendMessage()
 *   4. 要把新状态推回画布时调 props.onEmitArtifact('visual3d', {...})
 *
 * ⚠️ 晶体学计算一律在后端（load_structure），这里只渲染。
 */

/* ── 数据形状（与后端 load_structure 的 artifact 对齐） ── */

interface Atom {
  x: number
  y: number
  z: number
}
interface Site {
  x: number
  y: number
  z: number
  kind: string
}
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
  }
}

const STRUCT_LABEL: Record<string, string> = {
  sc: '简单立方 (SC)',
  bcc: '体心立方 (BCC)',
  fcc: '面心立方 (FCC)',
  hcp: '密排六方 (HCP)',
}

type View = 'cell' | 'octahedral' | 'tetrahedral'

const VIEWS: { id: View; label: string; kind?: string }[] = [
  { id: 'cell', label: '晶胞' },
  { id: 'octahedral', label: '八面体间隙', kind: '八面体间隙' },
  { id: 'tetrahedral', label: '四面体间隙', kind: '四面体间隙' },
]

/* ── 颜色（跟 tokens.css 的色调走，不引入新依赖） ── */
const COLOR_ATOM = '#6b9fff'
const COLOR_ATOM_CORE = '#a7c4ff'
const COLOR_BOND = '#4a5568'
const COLOR_CELL = '#6b7280'
const COLOR_OCTA = '#fbbf24'
const COLOR_TETRA = '#4ade80'

/* ── 几何辅助 ── */

/** 原子坐标在晶胞单位（0~1），乘晶胞参数后减半居中 */
function toVec(a: Atom, cell: { a: number; b: number; c: number }): [number, number, number] {
  return [(a.x - 0.5) * cell.a, (a.y - 0.5) * cell.b, (a.z - 0.5) * cell.c]
}

/** 平行六面体的 12 条棱 */
function cellEdges(cell: { a: number; b: number; c: number }): [number, number, number][][] {
  const h = { a: cell.a / 2, b: cell.b / 2, c: cell.c / 2 }
  const v: [number, number, number][] = [
    [-h.a, -h.b, -h.c], [h.a, -h.b, -h.c], [-h.a, h.b, -h.c], [h.a, h.b, -h.c],
    [-h.a, -h.b, h.c], [h.a, -h.b, h.c], [-h.a, h.b, h.c], [h.a, h.b, h.c],
  ]
  const pairs: [number, number][] = [
    [0, 1], [1, 3], [3, 2], [2, 0],
    [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  return pairs.map(([i, j]) => [v[i], v[j]])
}

/* ── 场景片段 ── */

function Atoms({ atoms, cell, radius }: { atoms: Atom[]; cell: Payload['cell'] & object; radius: number }) {
  return (
    <group>
      {atoms.map((a, i) => {
        const [x, y, z] = toVec(a, cell)
        // 顶点上的原子略小、亮一点，便于区分顶点与面心/体心
        const isCorner = [a.x, a.y, a.z].every((v) => v === 0 || v === 1)
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[radius * (isCorner ? 1 : 1.12), 24, 18]} />
            <meshStandardMaterial
              color={isCorner ? COLOR_ATOM : COLOR_ATOM_CORE}
              metalness={0.25}
              roughness={0.42}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function Bonds({ atoms, bonds, cell, radius }: { atoms: Atom[]; bonds: [number, number][]; cell: Payload['cell'] & object; radius: number }) {
  const segs = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    return bonds
      .map(([i, j]) => {
        const a = atoms[i]
        const b = atoms[j]
        if (!a || !b) return null
        const pa = new THREE.Vector3(...toVec(a, cell))
        const pb = new THREE.Vector3(...toVec(b, cell))
        const dir = new THREE.Vector3().subVectors(pb, pa)
        const len = dir.length()
        if (len < 1e-6) return null
        const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5)
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize())
        return { mid: mid.toArray() as [number, number, number], quat, len }
      })
      .filter(Boolean) as { mid: [number, number, number]; quat: THREE.Quaternion; len: number }[]
  }, [atoms, bonds, cell])

  return (
    <group>
      {segs.map((s, i) => (
        <mesh key={i} position={s.mid} quaternion={s.quat}>
          <cylinderGeometry args={[radius * 0.22, radius * 0.22, s.len, 8]} />
          <meshStandardMaterial color={COLOR_BOND} metalness={0.15} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function CellFrame({ cell }: { cell: Payload['cell'] & object }) {
  const edges = useMemo(() => cellEdges(cell), [cell])
  return (
    <group>
      {edges.map(([p, q], i) => {
        const a = new THREE.Vector3(...p)
        const b = new THREE.Vector3(...q)
        const dir = new THREE.Vector3().subVectors(b, a)
        const len = dir.length()
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        return (
          <mesh key={i} position={mid.toArray()} quaternion={quat}>
            <cylinderGeometry args={[0.008, 0.008, len, 6]} />
            <meshBasicMaterial color={COLOR_CELL} />
          </mesh>
        )
      })}
    </group>
  )
}

function Sites({ sites, cell, radius }: { sites: Site[]; cell: Payload['cell'] & object; radius: number }) {
  return (
    <group>
      {sites.map((s, i) => {
        const [x, y, z] = toVec(s, cell)
        const color = s.kind === '八面体间隙' ? COLOR_OCTA : COLOR_TETRA
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[radius * 0.55, 16, 12]} />
            <meshStandardMaterial color={color} transparent opacity={0.72} roughness={0.3} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ── 主组件 ── */

export default function Component({ artifact, onSendMessage, onEmitArtifact }: FeatureProps) {
  const data = (artifact?.data ?? null) as Payload | null

  // 视图切换是本地状态，不发网络请求（约定第 2 条）。
  // 但要把当前视图推回画布，这样壳知道学生在看什么（约定第 4 条）。
  const [view, setView] = useState<View>(
    (data?.feature as View) === 'octahedral' || (data?.feature as View) === 'tetrahedral'
      ? (data!.feature as View)
      : 'cell',
  )

  const switchView = (v: View) => {
    setView(v)
    if (data) {
      onEmitArtifact('visual3d', { ...data, feature: v })
    }
  }

  const cell = data?.cell ?? { a: 1, b: 1, c: 1 }
  const atoms = data?.atoms ?? []
  const bonds = data?.bonds ?? []
  const params = data?.params
  const radius = (params?.nearestNeighbor ?? 0.7071) * 0.26

  const activeKind = VIEWS.find((v) => v.id === view)?.kind
  const sites = activeKind ? (data?.sites ?? []).filter((s) => s.kind === activeKind) : []

  const hasData = atoms.length > 0

  return (
    <div className="feat" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* ── 头部：结构名 + 视图切换 ── */}
      <div style={{ padding: '12px 14px 8px' }}>
        <h3 style={{ margin: 0, marginBottom: 2 }}>3D 可视化</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          {data ? STRUCT_LABEL[data.structure ?? ''] ?? data.structure : '等待数据'}
          {data?.stacking ? ` · ${data.stacking}` : ''}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className="chip"
              onClick={() => switchView(v.id)}
              style={
                view === v.id
                  ? {
                      borderColor: 'var(--accent-border)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }
                  : undefined
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3D 场景 ── */}
      <div style={{ flex: 1, minHeight: 260, position: 'relative' }}>
        {!hasData ? (
          <div className="box" style={{ margin: 14 }}>
            等待 Agent 触发 —— 在对话里问「面心立方晶胞有几个原子」，或看 preview 的样例数据
          </div>
        ) : (
          <Canvas camera={{ position: [2.3, 1.7, 2.3], fov: 42 }} dpr={[1, 2]}>
            <ambientLight intensity={0.55} />
            <directionalLight position={[4, 6, 5]} intensity={1.15} />
            <directionalLight position={[-5, -3, -4]} intensity={0.35} />

            <Atoms atoms={atoms} cell={cell} radius={radius} />
            <Bonds atoms={atoms} bonds={bonds} cell={cell} radius={radius} />
            <CellFrame cell={cell} />
            {sites.length > 0 && <Sites sites={sites} cell={cell} radius={radius} />}

            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              minDistance={1.4}
              maxDistance={9}
              makeDefault
            />
          </Canvas>
        )}
      </div>

      {/* ── 底部：教材参数 ── */}
      {params && (
        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--border-soft)' }}>
          <div className="kv">
            <span>每晶胞原子数</span>
            <span>{params.atomsPerCell}</span>
          </div>
          <div className="kv">
            <span>配位数</span>
            <span>{params.coordination}</span>
          </div>
          <div className="kv" style={{ border: 'none' }}>
            <span>致密度</span>
            <span>{params.packing}</span>
          </div>
          {sites.length > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
              当前显示 {sites.length} 个{activeKind}
            </div>
          )}
          <button
            className="chip"
            style={{ marginTop: 10 }}
            onClick={() =>
              onSendMessage(
                `请讲解：${STRUCT_LABEL[data?.structure ?? '']} 的${activeKind ? activeKind : '原子排布'}`
                + `，为什么每个晶胞有 ${params.atomsPerCell} 个原子、配位数 ${params.coordination}？`,
              )
            }
          >
            让 Agent 展开解释
          </button>
        </div>
      )}
    </div>
  )
}
