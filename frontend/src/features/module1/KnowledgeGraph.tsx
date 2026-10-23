import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, Line, OrbitControls, QuadraticBezierLine, Sparkles, Stars } from '@react-three/drei'
import * as THREE from 'three'
import type { KnowledgeNode, Level, Relation } from './graphData'
import {
  KNOWLEDGE_EDGES,
  KNOWLEDGE_NODES,
  LEVEL_STYLE,
  SECTORS,
  neighborsOf,
  nodeById,
  questionsOfKnowledge,
} from './graphData'
import { GALAXY_POS, tiltBasis } from './galaxyLayout'
import type { Vec3 } from './galaxyLayout'

interface Props {
  /** 外部（Agent artifact / 问题图谱跳转）要求聚焦的节点 */
  focusId?: string | null
  /** 点击「关联问题」时切到问题图谱 */
  onSelectQuestion?: (qid: string) => void
  /** 让 Agent 讲解 */
  onSend: (text: string) => void
}

const posOf = (id: string): Vec3 => GALAXY_POS.get(id) ?? [0, 0, 0]

const REL_STYLE: Record<Relation, { color: string; name: string; dash: boolean }> = {
  组成: { color: '#7d9bd8', name: '组成', dash: false },
  因果: { color: '#fbbf24', name: '因果', dash: true },
  前置依赖: { color: '#38bdf8', name: '前置依赖', dash: true },
  对比: { color: '#a78bfa', name: '对比', dash: true },
}

/** 各层级的聚焦观测距离（飞到节点后相机与节点的距离：留足视野看清周围关联星群） */
const FLY_DIST: Record<Level, number> = { 1: 24, 2: 18, 3: 13.5, 4: 10.5, 5: 9 }
const HOME_DIST = 52

/* ───────────────────────── 程序化柔光与星面贴图 ───────────────────────── */

let glowTexCache: THREE.CanvasTexture | null = null
/** 径向柔和辉光贴图：中心亮、向外平滑指数衰减到 0，彻底消除硬边圆盘与多边形棱角 */
function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexCache) return glowTexCache
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.24)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.05)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTexCache = new THREE.CanvasTexture(canvas)
  glowTexCache.needsUpdate = true
  return glowTexCache
}

const planetTexCache = new Map<string, THREE.CanvasTexture>()
/** 为不同颜色星球生成带云带、极光与星斑细节的球面纹理 */
function getPlanetTexture(hex: string): THREE.CanvasTexture {
  const hit = planetTexCache.get(hex)
  if (hit) return hit
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const base = new THREE.Color(hex)
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.48)
  const dark = base.clone().lerp(new THREE.Color('#060b18'), 0.55)

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, `#${light.getHexString()}`)
  grad.addColorStop(0.25, `#${base.getHexString()}`)
  grad.addColorStop(0.5, `#${light.getHexString()}`)
  grad.addColorStop(0.78, `#${base.getHexString()}`)
  grad.addColorStop(1, `#${dark.getHexString()}`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 星体气旋云带
  for (let y = 0; y < h; y += 3) {
    const wave = Math.sin(y * 0.19) * 0.5 + Math.cos(y * 0.07) * 0.5
    ctx.fillStyle = wave > 0 ? `rgba(255,255,255,${0.06 + wave * 0.08})` : `rgba(4,8,22,${0.05 - wave * 0.08})`
    ctx.fillRect(0, y, w, 2)
  }
  // 星斑漩涡
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 73) % (w - 30)) + 15
    const y = ((i * 41) % (h - 24)) + 12
    const rx = 8 + (i % 5) * 4
    const ry = 3 + (i % 3) * 2
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(6,12,28,0.16)'
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  planetTexCache.set(hex, tex)
  return tex
}

/* ───────────────────────── 3D 场景组件 ───────────────────────── */

interface FlyTarget {
  t: Vec3
  d: number
  /** 期望的相机方位（单位向量，target → camera）；缺省保持当前朝向 */
  dir?: Vec3
}

/**
 * 相机领航员：把 OrbitControls.target 与相机位置阻尼插值到飞行目标。
 * 到达后自动交还控制权；用户一旦拖拽（controls 'start'）立刻取消飞行，
 * 因此不会跟 OrbitControls 的拖拽/缩放/平移打架。
 */
function CameraRig({ fly, viewRef, onDist }: {
  fly: FlyTarget | null
  viewRef: React.MutableRefObject<{ t: Vec3; d: number }>
  onDist: (d: number) => void
}) {
  const controls = useThree((s) => s.controls) as any
  const camera = useThree((s) => s.camera)
  const goal = useRef<{ t: THREE.Vector3; d: number; dir: THREE.Vector3 | null } | null>(null)
  const lastD = useRef(0)

  useEffect(() => {
    if (!fly) return
    goal.current = {
      t: new THREE.Vector3(...fly.t),
      d: fly.d,
      dir: fly.dir ? new THREE.Vector3(...fly.dir).normalize() : null,
    }
  }, [fly])

  useEffect(() => {
    if (!controls) return
    const stop = () => {
      goal.current = null
    }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  useFrame((_, delta) => {
    if (!controls) return
    const g = goal.current
    if (g) {
      const k = 1 - Math.exp(-delta * 4.2)
      controls.target.lerp(g.t, k)
      const cur = camera.position.clone().sub(controls.target)
      const dir = cur.lengthSq() > 1e-6 ? cur.normalize() : new THREE.Vector3(0, 0.3, 1)
      if (g.dir) dir.lerp(g.dir, k).normalize()
      const len = camera.position.distanceTo(controls.target)
      const nl = THREE.MathUtils.lerp(len, g.d, k)
      camera.position.copy(controls.target).addScaledVector(dir, nl)
      controls.update()
      if (controls.target.distanceTo(g.t) < 0.02 && Math.abs(nl - g.d) < 0.05) goal.current = null
    }
    const d = camera.position.distanceTo(controls.target)
    viewRef.current = { t: [controls.target.x, controls.target.y, controls.target.z], d }
    if (Math.abs(d - lastD.current) > 1.5) {
      lastD.current = d
      onDist(d)
    }
  })
  return null
}

/** 单个知识点星球：程序化星面纹理 + 炽白恒星核 + 径向柔光日冕 + 星环 + 恒定尺寸悬浮标签 */
function StarNode({ node, pos, dimmed, isSel, isHi, hovered, camDist, onSelect, onHover }: {
  node: KnowledgeNode
  pos: Vec3
  dimmed: boolean
  isSel: boolean
  isHi: boolean
  hovered: boolean
  camDist: number
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const st = LEVEL_STYLE[node.level]
  const secColor = SECTORS[node.sector]?.color ?? st.color
  // 二/三级融入所属星系团主题色，层次更丰富
  const bodyColor = node.level === 1 ? '#38bdf8' : node.level === 2 ? secColor : st.color
  const r = st.radius3d * 0.78
  const bodyRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Group>(null)
  const glowTex = useMemo(() => getGlowTexture(), [])
  const planetTex = useMemo(() => getPlanetTexture(bodyColor), [bodyColor])

  useFrame((_, delta) => {
    if (bodyRef.current) bodyRef.current.rotation.y += delta * 0.22
    if (ringRef.current) ringRef.current.rotation.z += delta * 0.32
  })

  const showLabel =
    isSel || isHi || hovered ||
    node.level <= 2 ||
    (node.level === 3 && camDist < 54) ||
    (node.level === 4 && camDist < 28) ||
    (node.level === 5 && camDist < 18)
  const alpha = dimmed ? 0.14 : 1
  const scaleK = isSel ? 1.22 : hovered ? 1.12 : 1
  const haloSize = r * (isSel ? 6.2 : isHi ? 4.8 : node.level <= 2 ? 4.6 : 3.6)

  return (
    <group position={pos}>
      {/* 柔和径向日冕光晕（Billboard 始终朝向相机，边缘平滑渐变到 0，无任何多边形棱角） */}
      <Billboard follow>
        <mesh raycast={() => null}>
          <planeGeometry args={[haloSize, haloSize]} />
          <meshBasicMaterial
            map={glowTex}
            color={bodyColor}
            transparent
            opacity={(isSel ? 0.85 : isHi ? 0.62 : 0.45) * alpha}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </Billboard>

      {/* 薄层高细分大气边缘圈 */}
      <mesh scale={scaleK * 1.12} raycast={() => null}>
        <sphereGeometry args={[r, 36, 28]} />
        <meshBasicMaterial
          color="#e0f2fe"
          transparent
          opacity={(isSel ? 0.22 : 0.1) * alpha}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 星球本体（带气旋云带纹理 + 清漆高光 + 自转） */}
      <mesh
        ref={bodyRef}
        scale={scaleK}
        onClick={(e) => {
          if (e.delta > 5) return
          e.stopPropagation()
          onSelect(node.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(node.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[r, 48, 36]} />
        <meshPhysicalMaterial
          map={planetTex}
          color={bodyColor}
          emissive={bodyColor}
          emissiveIntensity={isSel ? 0.78 : isHi ? 0.52 : node.level <= 2 ? 0.45 : 0.28}
          roughness={0.28}
          metalness={0.12}
          clearcoat={0.65}
          clearcoatRoughness={0.22}
          transparent={dimmed}
          opacity={alpha}
        />
      </mesh>

      {/* 一/二/三级双层精致星环 */}
      {node.level <= 3 && (
        <group ref={ringRef} rotation={[Math.PI / 2 + 0.38, 0.15, 0.22]}>
          <mesh raycast={() => null}>
            <ringGeometry args={[r * 1.42, r * (node.level === 1 ? 2.15 : 1.85), 64]} />
            <meshBasicMaterial
              color={bodyColor}
              transparent
              opacity={(isSel ? 0.55 : 0.32) * alpha}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh raycast={() => null}>
            <ringGeometry args={[r * (node.level === 1 ? 2.25 : 1.94), r * (node.level === 1 ? 2.38 : 2.04), 64]} />
            <meshBasicMaterial
              color="#e0f2fe"
              transparent
              opacity={(isSel ? 0.38 : 0.18) * alpha}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* 屏幕恒定字号悬浮标签（去掉 distanceFactor，拉近时绝不暴涨） */}
      {showLabel && (
        <Html
          position={[0, r * scaleK + 0.38, 0]}
          center
          zIndexRange={[30, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`mg-tag lv${node.level}${isSel ? ' sel' : ''}${isHi && !isSel ? ' hi' : ''}`}
            style={{ opacity: dimmed ? 0.12 : 1 }}
          >
            {node.label.length > 22 ? `${node.label.slice(0, 22)}…` : node.label}
          </div>
        </Html>
      )}
    </group>
  )
}

/** 关系连线：组成 = 直线；跨星系关联 = 向外弯曲的空间弧线；选中关联边高亮为青色能量束 */
function EdgeLines({ visibleSet, selected }: {
  visibleSet: Set<string>
  selected: string | null
}) {
  return (
    <group>
      {KNOWLEDGE_EDGES.map((e, i) => {
        if (!visibleSet.has(e.source) || !visibleSet.has(e.target)) return null
        const a = posOf(e.source)
        const b = posOf(e.target)
        const touch = !!selected && (e.source === selected || e.target === selected)
        const dim = !!selected && !touch
        const st = REL_STYLE[e.relation]
        const color = touch ? '#22d3ee' : st.color
        const op = dim ? 0.045 : touch ? 0.95 : e.relation === '组成' ? 0.42 : 0.3
        if (e.relation === '组成') {
          return <Line key={i} points={[a, b]} color={color} transparent opacity={op} lineWidth={touch ? 2.2 : 1} />
        }
        const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
        const l = Math.hypot(m[0], m[1], m[2]) || 1
        const bow = Math.min(7, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.22)
        const mid: Vec3 = [m[0] + (m[0] / l) * bow, m[1] + (m[1] / l) * bow + bow * 0.35, m[2] + (m[2] / l) * bow]
        return (
          <QuadraticBezierLine
            key={i}
            start={a}
            end={b}
            mid={mid}
            color={color}
            transparent
            opacity={op}
            lineWidth={touch ? 2.2 : 1.1}
            dashed={st.dash && !touch}
            dashSize={0.7}
            gapSize={0.45}
          />
        )
      })}
    </group>
  )
}

/** 每个星系团的柔和星云光晕 + 倾斜轨道环 */
function ClusterDecor({ hiddenSectors }: { hiddenSectors: Set<number> }) {
  const glowTex = useMemo(() => getGlowTexture(), [])
  return (
    <group>
      {SECTORS.map((sec, i) => {
        if (hiddenSectors.has(i)) return null
        const c = sec.center as unknown as Vec3
        const [u, w] = tiltBasis(sec.tilt)
        const pts: Vec3[] = []
        for (let k = 0; k <= 72; k += 1) {
          const a = (k / 72) * Math.PI * 2
          pts.push([
            c[0] + u[0] * Math.cos(a) * 8.4 + w[0] * Math.sin(a) * 8.4,
            c[1] + u[1] * Math.cos(a) * 8.4 + w[1] * Math.sin(a) * 8.4,
            c[2] + u[2] * Math.cos(a) * 8.4 + w[2] * Math.sin(a) * 8.4,
          ])
        }
        return (
          <group key={sec.id}>
            <Billboard position={c} follow>
              <mesh raycast={() => null}>
                <planeGeometry args={[26, 26]} />
                <meshBasicMaterial
                  map={glowTex}
                  color={sec.color}
                  transparent
                  opacity={0.14}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </Billboard>
            <Line points={pts} color={sec.color} transparent opacity={0.18} lineWidth={1} />
          </group>
        )
      })}
    </group>
  )
}

/* ───────────────────────── 覆盖层样式 ───────────────────────── */

const STYLE = `
.mg-kg { position: absolute; inset: 0; overflow: hidden; user-select: none; color: var(--text, #eaf1ff); background: #04070f; }
.mg-kg.light { color: #1c2b4a; background: #eef3fd; }
.mg-tag { white-space: nowrap; font-size: 11px; line-height: 1.35; color: rgba(226,238,255,.92);
  background: rgba(7, 13, 28, 0.62); border: 1px solid rgba(125, 165, 255, 0.22);
  backdrop-filter: blur(4px); padding: 2px 7px; border-radius: 99px;
  text-shadow: 0 1px 4px rgba(2,6,20,.9); transition: opacity .18s ease; }
.mg-tag.lv1 { font-size: 13px; font-weight: 700; color: #e0f7ff; border-color: rgba(56,189,248,.5); }
.mg-tag.lv2 { font-size: 12px; font-weight: 600; color: #f0f7ff; border-color: rgba(125,165,255,.38); }
.mg-tag.hi { color: #e6f4ff; border-color: rgba(56,189,248,.42); }
.mg-tag.sel { font-size: 12.5px; color: #7fe3f5; font-weight: 600;
  background: rgba(8, 22, 42, 0.85); border-color: rgba(34,211,238,.68);
  box-shadow: 0 0 12px rgba(34,211,238,.28); }
.mg-kg.light .mg-tag { color: #1e2f52; background: rgba(255,255,255,.82);
  border-color: rgba(100,130,190,.32); text-shadow: none; }
` + `

.mg-tool { position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 8px; z-index: 120; }
.mg-iconbtn { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: var(--bg-panel, rgba(12,18,36,.86)); color: var(--text-dim, #b9c7e6);
  border: 1px solid var(--border, rgba(120,150,220,.28)); cursor: pointer; font-size: 15px; }
.mg-iconbtn:hover { color: var(--text, #eaf1ff); border-color: rgba(125,165,255,.62); }
.mg-iconbtn.on { color: #22d3ee; border-color: rgba(34,211,238,.62); }

.mg-search { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 200px; z-index: 130; }
.mg-search input { width: 100%; padding: 7px 10px; border-radius: 9px; font-size: 12px;
  background: var(--bg-panel, rgba(12,18,36,.94)); color: var(--text, #eaf1ff);
  border: 1px solid var(--border, rgba(120,150,220,.32)); outline: none; }
.mg-results { margin-top: 6px; border-radius: 9px; overflow: hidden; max-height: 220px; overflow-y: auto;
  background: var(--bg-panel, rgba(12,18,36,.97)); border: 1px solid var(--border, rgba(120,150,220,.32)); }
.mg-results button { display: block; width: 100%; text-align: left; padding: 6px 9px; font-size: 11.5px;
  background: none; border: 0; color: var(--text-dim, #b9c7e6); cursor: pointer; }
.mg-results button:hover { background: rgba(125,165,255,.16); color: var(--text, #eaf1ff); }

.mg-views { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 176px; z-index: 130;
  border-radius: 12px; padding: 9px; background: var(--bg-panel, rgba(12,18,36,.96));
  border: 1px solid var(--border, rgba(120,150,220,.32)); box-shadow: 0 14px 40px rgba(0,0,0,.4); }
.mg-views b { display: block; font-size: 10.5px; color: var(--text-muted, #8ea3c9); margin: 1px 3px 7px; }
.mg-views button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 7px;
  border-radius: 8px; border: 1px solid transparent; background: none; cursor: pointer; color: var(--text-dim, #b9c7e6); }
.mg-views button:hover { background: rgba(125,165,255,.14); color: var(--text, #eaf1ff); }
.mg-views button.on { border-color: rgba(34,211,238,.45); background: rgba(34,211,238,.12); color: #7fe3f5; }
.mg-views .ic { width: 20px; text-align: center; font-size: 13px; flex-shrink: 0; }
.mg-views em { display: block; font-style: normal; font-size: 11.5px; }
.mg-views small { display: block; font-size: 9.5px; color: var(--text-faint, #6d80a6); }

.mg-clusters { position: absolute; left: 56px; top: 12px; z-index: 110; display: flex; gap: 6px; flex-wrap: wrap;
  max-width: calc(100% - 340px); }
.mg-cluster-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 99px;
  font-size: 11px; cursor: pointer; color: var(--text-dim, #b9c7e6);
  background: var(--bg-panel, rgba(12,18,36,.72)); border: 1px solid var(--border, rgba(120,150,220,.28)); }
.mg-cluster-chip.off { opacity: .38; text-decoration: line-through; }
.mg-cluster-chip .dot { width: 7px; height: 7px; border-radius: 50%; }

.mg-crumb { position: absolute; left: 50%; transform: translateX(-50%); top: 12px; z-index: 110;
  display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 99px; font-size: 11px;
  background: var(--bg-panel, rgba(12,18,36,.82)); border: 1px solid var(--border, rgba(120,150,220,.28));
  max-width: 58%; overflow: hidden; }
.mg-crumb button { background: none; border: 0; padding: 0 2px; cursor: pointer; font-size: 11px;
  color: var(--text-dim, #b9c7e6); white-space: nowrap; }
.mg-crumb button:hover { color: #7fe3f5; }
.mg-crumb .sep { color: var(--text-faint, #66799f); }

.mg-legend { position: absolute; left: 12px; bottom: 12px; z-index: 110;
  background: var(--bg-panel, rgba(12,18,36,.82)); border: 1px solid var(--border, rgba(120,150,220,.26));
  border-radius: 12px; padding: 9px 11px; font-size: 11px; color: var(--text-dim, #b9c7e6); }
.mg-legend b { display: block; margin-bottom: 6px; color: var(--text, #eaf1ff); font-weight: 600; }
.mg-legend .row { display: flex; align-items: center; gap: 7px; padding: 2px 0; cursor: pointer; opacity: .95; }
.mg-legend .row.off { opacity: .35; text-decoration: line-through; }
.mg-legend .sw { width: 9px; height: 9px; border-radius: 50%; }

.mg-relegend { position: absolute; right: 12px; bottom: 12px; z-index: 110; display: flex; gap: 10px;
  padding: 6px 10px; border-radius: 10px; font-size: 10.5px; color: var(--text-muted, #8ea3c9);
  background: var(--bg-panel, rgba(12,18,36,.78)); border: 1px solid var(--border, rgba(120,150,220,.22)); }
.mg-relegend span { display: inline-flex; align-items: center; gap: 5px; }
.mg-relegend i { display: inline-block; width: 18px; height: 0; border-top-width: 1.6px; border-top-style: solid; }

.mg-panel { position: absolute; right: 12px; top: 12px; bottom: 12px; width: 306px; z-index: 140;
  overflow-y: auto; border-radius: 14px; padding: 14px 14px 16px;
  background: var(--bg-panel, rgba(10,16,32,.95)); border: 1px solid var(--border, rgba(120,150,220,.32));
  box-shadow: 0 16px 46px rgba(0,0,0,.45); color: var(--text, #eaf1ff); }
.mg-kg.light .mg-panel { color: #1c2b4a; }
.mg-panel h4 { margin: 0 0 6px; font-size: 14px; line-height: 1.5; }
.mg-panel .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.mg-pill { font-size: 10px; padding: 1px 7px; border-radius: 99px; border: 1px solid rgba(125,165,255,.4); color: #9fd4ff; }
.mg-kg.light .mg-pill { color: #33518f; }
.mg-panel p { margin: 6px 0; font-size: 12px; line-height: 1.7; color: var(--text-dim, #b9c7e6); }
.mg-kg.light .mg-panel p { color: #41557f; }
.mg-sec { margin-top: 12px; }
.mg-sec > b { font-size: 11px; color: var(--text-muted, #8ea3c9); font-weight: 600; }
.mg-chip { display: inline-flex; align-items: center; gap: 4px; margin: 4px 4px 0 0; padding: 3px 8px;
  border-radius: 8px; font-size: 11px; cursor: pointer; color: #cfe0ff;
  background: rgba(125,165,255,.10); border: 1px solid rgba(125,165,255,.28); }
.mg-kg.light .mg-chip { color: #25355c; }
.mg-chip:hover { background: rgba(125,165,255,.2); }
.mg-rel { font-size: 10px; color: #7ea8ff; margin-right: 3px; }
.mg-act { margin-top: 14px; display: flex; gap: 8px; }
.mg-act button { flex: 1; padding: 7px 0; border-radius: 9px; cursor: pointer; font-size: 12px;
  background: rgba(34,211,238,.14); color: #7fe3f5; border: 1px solid rgba(34,211,238,.45); }
.mg-act button:hover { background: rgba(34,211,238,.24); }
.mg-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; z-index: 105;
  font-size: 10.5px; color: var(--text-faint, #66799f); white-space: nowrap; }
`

/* ───────────────────────── 视角预设 ───────────────────────── */

interface ViewPreset {
  id: string
  label: string
  icon: string
  hint: string
  dir: Vec3
  d: number
  cruise?: boolean
}

const VIEW_PRESETS: ViewPreset[] = [
  { id: 'overview', label: '全景', icon: '◍', hint: '整个课程星系', dir: [0.22, 0.34, 0.91], d: HOME_DIST },
  { id: 'top', label: '俯瞰', icon: '⊤', hint: '从正上方看六大星团', dir: [0.02, 1, 0.04], d: 62 },
  { id: 'side', label: '侧视', icon: '↔', hint: '平视星团纵深层次', dir: [0.02, 0.06, 1], d: 58 },
  { id: 'dive', label: '深空巡航', icon: '✧', hint: '贴近星系缓慢环视', dir: [0.55, 0.25, 0.8], d: 34, cruise: true },
]

/** 祖先链：root → … → 当前节点 */
function ancestorsOf(id: string): KnowledgeNode[] {
  const chain: KnowledgeNode[] = []
  let cur = nodeById(id)
  while (cur) {
    chain.unshift(cur)
    cur = cur.parent ? nodeById(cur.parent) : undefined
  }
  return chain
}

/* ───────────────────────── 场景 ───────────────────────── */

function Scene({ visibleNodes, visibleSet, hiddenSectors, selected, highlightSet, hovered, camDist, light, autoRotate, fly, viewRef, onDist, onSelect, onHover }: {
  visibleNodes: KnowledgeNode[]
  visibleSet: Set<string>
  hiddenSectors: Set<number>
  selected: string | null
  highlightSet: Set<string>
  hovered: string | null
  camDist: number
  light: boolean
  autoRotate: boolean
  fly: FlyTarget | null
  viewRef: React.MutableRefObject<{ t: Vec3; d: number }>
  onDist: (d: number) => void
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  return (
    <>
      <color attach="background" args={[light ? '#eef3fd' : '#04070f']} />
      <fog attach="fog" args={[light ? '#eef3fd' : '#04070f', 75, 200]} />
      <ambientLight intensity={light ? 1.5 : 0.85} />
      <directionalLight position={[30, 42, 26]} intensity={light ? 1.7 : 1.15} color="#dfe9ff" />
      <pointLight position={[0, 0, 0]} intensity={55} distance={110} color="#66d5ff" />
      {!light && (
        <>
          <Stars radius={170} depth={90} count={4200} factor={4} saturation={0.05} fade speed={0.55} />
          <Sparkles count={170} scale={100} size={2.6} speed={0.22} opacity={0.55} color="#9fc8ff" />
        </>
      )}
      <ClusterDecor hiddenSectors={hiddenSectors} />
      <EdgeLines visibleSet={visibleSet} selected={selected} />
      {visibleNodes.map((n) => {
        const isSel = selected === n.id
        const isHi = highlightSet.has(n.id)
        return (
          <StarNode
            key={n.id}
            node={n}
            pos={posOf(n.id)}
            dimmed={!!selected && !isHi}
            isSel={isSel}
            isHi={isHi}
            hovered={hovered === n.id}
            camDist={camDist}
            onSelect={onSelect}
            onHover={onHover}
          />
        )
      })}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
        minDistance={3.5}
        maxDistance={170}
        minPolarAngle={0.04}
        maxPolarAngle={Math.PI - 0.04}
      />
      <CameraRig fly={fly} viewRef={viewRef} onDist={onDist} />
    </>
  )
}

/* ───────────────────────── 主组件 ───────────────────────── */

export default function KnowledgeGraph({ focusId, onSelectQuestion, onSend }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [light, setLight] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [hiddenLevels, setHiddenLevels] = useState<Set<Level>>(new Set())
  const [hiddenSectors, setHiddenSectors] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showViews, setShowViews] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [cruise, setCruise] = useState(false)
  const [camDist, setCamDist] = useState(HOME_DIST)
  const [fly, setFly] = useState<FlyTarget | null>({ t: [0, 0, 0], d: HOME_DIST, dir: [0.22, 0.34, 0.91] })
  const viewRef = useRef<{ t: Vec3; d: number }>({ t: [0, 0, 0], d: HOME_DIST })
  /** 记录按下后的位移，用来给 onPointerMissed 区分「点击空白」和「拖拽视角」 */
  const ptr = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  /* 首帧空白修复：容器尺寸稳定后通知 R3F 重新量一次（同 visual3d 的做法） */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const bump = () => window.dispatchEvent(new Event('resize'))
    const observer = new ResizeObserver(bump)
    observer.observe(el)
    const raf = requestAnimationFrame(bump)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  const visibleNodes = useMemo(
    () => KNOWLEDGE_NODES.filter((n) => !hiddenLevels.has(n.level) && !hiddenSectors.has(n.sector)),
    [hiddenLevels, hiddenSectors],
  )
  const visibleSet = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])

  const neighborInfo = useMemo(() => (selected ? neighborsOf(selected) : null), [selected])
  const highlightSet = useMemo(() => {
    const set = new Set<string>()
    if (!selected) return set
    set.add(selected)
    if (neighborInfo?.parent) set.add(neighborInfo.parent.id)
    neighborInfo?.children.forEach((c) => set.add(c.id))
    neighborInfo?.related.forEach((r) => set.add(r.node.id))
    return set
  }, [selected, neighborInfo])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return KNOWLEDGE_NODES.filter(
      (n) => n.label.toLowerCase().includes(q) || (n.fullTitle ?? '').toLowerCase().includes(q),
    ).slice(0, 7)
  }, [query])

  const selectedNode = selected ? nodeById(selected) : undefined
  const crumb = selectedNode ? ancestorsOf(selectedNode.id) : []

  /** 飞越到节点并把轨道中心切到它身上：之后上下/左右拖拽就是绕这颗星球自由环绕 */
  const flyTo = (id: string) => {
    const n = nodeById(id)
    if (!n) return
    setCruise(false)
    setFly({ t: posOf(id), d: FLY_DIST[n.level] })
  }

  const pick = (id: string) => {
    if (selected === id) {
      goHome()
      return
    }
    setSelected(id)
    flyTo(id)
  }

  const goHome = () => {
    setSelected(null)
    setCruise(false)
    setFly({ t: [0, 0, 0], d: HOME_DIST, dir: [0.22, 0.34, 0.91] })
  }

  const applyPreset = (p: ViewPreset) => {
    setShowViews(false)
    if (p.cruise) setSelected(null)
    setCruise(!!p.cruise)
    if (p.cruise) setAutoRotate(true)
    setFly({ t: [0, 0, 0], d: p.d, dir: p.dir })
  }

  const zoomBy = (k: number) => {
    const { t, d } = viewRef.current
    setFly({ t, d: Math.max(4, Math.min(160, d * k)) })
  }

  /* 外部聚焦（Agent artifact / 问题图谱跳转）：自动解禁被隐藏的层级与星团 */
  useEffect(() => {
    if (!focusId) return
    const node = nodeById(focusId)
    if (!node) return
    setHiddenLevels((prev) => {
      if (!prev.has(node.level)) return prev
      const next = new Set(prev)
      next.delete(node.level)
      return next
    })
    setHiddenSectors((prev) => {
      if (!prev.has(node.sector)) return prev
      const next = new Set(prev)
      next.delete(node.sector)
      return next
    })
    setSelected(focusId)
    flyTo(focusId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  return (
    <div
      className={`mg-kg${light ? ' light' : ''}`}
      ref={wrapRef}
      onPointerDown={(e) => {
        ptr.current = { x: e.clientX, y: e.clientY, moved: false }
      }}
      onPointerMove={(e) => {
        if (ptr.current && Math.hypot(e.clientX - ptr.current.x, e.clientY - ptr.current.y) > 5)
          ptr.current.moved = true
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{STYLE}</style>

      <Canvas
        dpr={[1, 2]}
        camera={{ position: [14, 18, 52], fov: 55, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => {
          if (ptr.current?.moved) return
          if (selected) goHome()
        }}
      >
        <Scene
          visibleNodes={visibleNodes}
          visibleSet={visibleSet}
          hiddenSectors={hiddenSectors}
          selected={selected}
          highlightSet={highlightSet}
          hovered={hovered}
          camDist={camDist}
          light={light}
          autoRotate={autoRotate && !selected}
          fly={fly}
          viewRef={viewRef}
          onDist={setCamDist}
          onSelect={pick}
          onHover={setHovered}
        />
      </Canvas>

      {/* 星团筛选 */}
      <div className="mg-clusters">
        {SECTORS.map((sec, i) => (
          <button
            key={sec.id}
            className={`mg-cluster-chip${hiddenSectors.has(i) ? ' off' : ''}`}
            title={`${hiddenSectors.has(i) ? '显示' : '隐藏'}「${sec.label}」星系`}
            onClick={() =>
              setHiddenSectors((prev) => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
          >
            <span className="dot" style={{ background: sec.color }} />
            {sec.label}
          </button>
        ))}
      </div>

      {/* 面包屑 */}
      {crumb.length > 1 && (
        <div className="mg-crumb">
          {crumb.map((n, i) => (
            <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span className="sep">›</span>}
              <button
                onClick={() => {
                  setSelected(n.id)
                  flyTo(n.id)
                }}
                style={i === crumb.length - 1 ? { color: '#7fe3f5' } : undefined}
              >
                {n.label.length > 14 ? `${n.label.slice(0, 14)}…` : n.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 左侧工具条 */}
      <div className="mg-tool">
        <button
          className={`mg-iconbtn${showSearch ? ' on' : ''}`}
          title="搜索知识点"
          onClick={() => {
            setShowSearch((v) => !v)
            setShowViews(false)
          }}
        >
          🔍
        </button>
        <button
          className={`mg-iconbtn${showViews || cruise ? ' on' : ''}`}
          title="切换视角（全景 / 俯瞰 / 侧视 / 深空巡航）"
          onClick={() => {
            setShowViews((v) => !v)
            setShowSearch(false)
          }}
        >
          🎥
        </button>
        <button className="mg-iconbtn" title="放大" onClick={() => zoomBy(0.72)}>
          ＋
        </button>
        <button className="mg-iconbtn" title="缩小" onClick={() => zoomBy(1.38)}>
          －
        </button>
        <button className="mg-iconbtn" title="复位视角" onClick={goHome}>
          ◎
        </button>
        <button
          className={`mg-iconbtn${autoRotate ? ' on' : ''}`}
          title={autoRotate ? '暂停星图旋转' : '自动旋转'}
          onClick={() => setAutoRotate((v) => !v)}
        >
          ⟳
        </button>
        <button className={`mg-iconbtn${light ? ' on' : ''}`} title="切换明暗" onClick={() => setLight((v) => !v)}>
          {light ? '🌙' : '☀'}
        </button>
      </div>

      {showViews && (
        <div className="mg-views">
          <b>切换视角</b>
          {VIEW_PRESETS.map((p) => (
            <button
              key={p.id}
              className={p.cruise && cruise ? 'on' : ''}
              onClick={() => applyPreset(p)}
              title={p.hint}
            >
              <span className="ic">{p.icon}</span>
              <span>
                <em>{p.label}</em>
                <small>{p.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {showSearch && (
        <div className="mg-search">
          <input
            autoFocus
            placeholder="搜索知识点，如「回火」"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                setSelected(matches[0].id)
                flyTo(matches[0].id)
                setShowSearch(false)
              }
            }}
          />
          {matches.length > 0 && (
            <div className="mg-results">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m.id)
                    flyTo(m.id)
                    setShowSearch(false)
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 图例（点击过滤层级） */}
      <div className="mg-legend">
        <b>知识点层级</b>
        {([1, 2, 3, 4, 5] as Level[]).map((lv) => (
          <div
            key={lv}
            className={`row${hiddenLevels.has(lv) ? ' off' : ''}`}
            onClick={() =>
              setHiddenLevels((prev) => {
                const next = new Set(prev)
                if (next.has(lv)) next.delete(lv)
                else next.add(lv)
                return next
              })
            }
            title="点击隐藏 / 显示该层级"
          >
            <span className="sw" style={{ background: LEVEL_STYLE[lv].color }} />
            {LEVEL_STYLE[lv].label}
          </div>
        ))}
      </div>

      {/* 关系图例 */}
      <div className="mg-relegend">
        {(Object.keys(REL_STYLE) as Relation[]).map((r) => (
          <span key={r}>
            <i style={{ borderTopColor: REL_STYLE[r].color, borderTopStyle: REL_STYLE[r].dash ? 'dashed' : 'solid' }} />
            {REL_STYLE[r].name}
          </span>
        ))}
      </div>

      {!selected ? (
        <div className="mg-hint">
          左键拖拽 360° 环绕 · 右键拖拽平移 · 滚轮缩放 · 🎥 视角预设 · 点击星球飞越并绕它旋转
        </div>
      ) : (
        <div className="mg-hint">
          当前以「{selectedNode?.label}」为轨道中心：上下/左右拖拽可从任意角度绕它观察 · 点空白或 ◎ 复位
        </div>
      )}

      {/* 详情面板 */}
      {selectedNode && (
        <div className="mg-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <h4>{selectedNode.fullTitle ?? selectedNode.label}</h4>
            <button
              className="mg-iconbtn"
              style={{ width: 26, height: 26, fontSize: 12, flexShrink: 0 }}
              onClick={goHome}
              title="关闭"
            >
              ✕
            </button>
          </div>
          <div className="meta">
            <span className="mg-pill">{LEVEL_STYLE[selectedNode.level].label}</span>
            <span className="mg-pill">{SECTORS[selectedNode.sector]?.label ?? '课程'}</span>
            {selectedNode.kind && <span className="mg-pill">{selectedNode.kind}</span>}
          </div>
          <p>{selectedNode.desc}</p>

          {crumb.length > 1 && (
            <div className="mg-sec">
              <b>所在路径</b>
              <p style={{ fontSize: 11 }}>{crumb.map((n) => n.label).join(' › ')}</p>
            </div>
          )}

          {neighborInfo?.parent && (
            <div className="mg-sec">
              <b>上级知识点</b>
              <div>
                <button
                  className="mg-chip"
                  onClick={() => {
                    setSelected(neighborInfo.parent!.id)
                    flyTo(neighborInfo.parent!.id)
                  }}
                >
                  {neighborInfo.parent.label}
                </button>
              </div>
            </div>
          )}

          {!!neighborInfo?.children.length && (
            <div className="mg-sec">
              <b>下级知识点（{neighborInfo.children.length}）</b>
              <div>
                {neighborInfo.children.map((c) => (
                  <button
                    key={c.id}
                    className="mg-chip"
                    onClick={() => {
                      setSelected(c.id)
                      flyTo(c.id)
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!!neighborInfo?.related.length && (
            <div className="mg-sec">
              <b>跨模块关联（{neighborInfo.related.length}）</b>
              <div>
                {neighborInfo.related.map((r) => (
                  <button
                    key={`${r.node.id}-${r.relation}`}
                    className="mg-chip"
                    onClick={() => {
                      setSelected(r.node.id)
                      flyTo(r.node.id)
                    }}
                  >
                    <span className="mg-rel">{r.relation}</span>
                    {r.node.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const qs = questionsOfKnowledge(selectedNode.id)
            if (!qs.length || !onSelectQuestion) return null
            return (
              <div className="mg-sec">
                <b>关联课程问题（{qs.length}）</b>
                <div>
                  {qs.map((q) => (
                    <button key={q.id} className="mg-chip" onClick={() => onSelectQuestion(q.id)}>
                      {q.title.length > 18 ? `${q.title.slice(0, 18)}…` : q.title}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          <div className="mg-sec">
            <b>课程出处</b>
            <p style={{ fontSize: 11 }}>{selectedNode.refs.join('；')}</p>
          </div>

          <div className="mg-act">
            <button
              onClick={() =>
                onSend(
                  `请结合课程讲义讲解知识点「${selectedNode.fullTitle ?? selectedNode.label}」，说明它和相关概念的关系，并给出课程出处。`,
                )
              }
            >
              让 Agent 讲解
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
