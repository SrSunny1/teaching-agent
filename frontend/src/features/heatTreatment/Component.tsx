import { useEffect, useMemo, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import {
  COOLING_LABEL,
  TEMPER_CURVE,
  simulate,
  type Cooling,
  type Params,
} from './model'

/**
 * B1 热处理工艺沙盒（★ 本项目技术难度担当）
 *
 * 这是全项目的参考实现，其他功能请照这个结构写：
 *   1. 从 props.artifact?.data 读初始参数
 *   2. 本地交互即时反馈（不直接发网络请求）
 *   3. 需要 Agent 介入时调 props.onSendMessage()
 *   4. 要把新状态推给画布时调 props.onEmitArtifact()
 *
 * 数据形状见 README.md 的「三、契约」。
 */

const DEFAULTS: Params = { cooling: 'water', temperTemp: 200, carbon: 0.45 }

interface Payload {
  cooling?: Cooling
  temperTemp?: number
  carbon?: number
}

function readParams(a: FeatureProps['artifact']): Params {
  const d = (a?.data ?? {}) as Payload
  return {
    cooling: d.cooling ?? DEFAULTS.cooling,
    temperTemp: typeof d.temperTemp === 'number' ? d.temperTemp : DEFAULTS.temperTemp,
    carbon: typeof d.carbon === 'number' ? d.carbon : DEFAULTS.carbon,
  }
}

/* ── 曲线（内联 SVG，不引图表库） ── */
function Curve({ activeT }: { activeT: number }) {
  const W = 320
  const H = 132
  const pad = { l: 30, r: 10, t: 12, b: 22 }
  const xs = TEMPER_CURVE.map((p) => p[0])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = 20
  const y1 = 66

  const px = (t: number) => pad.l + ((t - x0) / (x1 - x0)) * (W - pad.l - pad.r)
  const py = (h: number) => pad.t + ((y1 - h) / (y1 - y0)) * (H - pad.t - pad.b)

  const path = TEMPER_CURVE.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p[0])},${py(p[1])}`).join(' ')
  const at = TEMPER_CURVE.reduce((best, p) =>
    Math.abs(p[0] - activeT) < Math.abs(best[0] - activeT) ? p : best,
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* 网格 */}
      {[30, 40, 50, 60].map((h) => (
        <g key={h}>
          <line x1={pad.l} x2={W - pad.r} y1={py(h)} y2={py(h)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={pad.l - 5} y={py(h) + 3} fontSize="8" fill="var(--text-faint)" textAnchor="end">
            {h}
          </text>
        </g>
      ))}
      {/* 三条教材区间底色 */}
      <rect x={px(150)} y={py(60)} width={px(250) - px(150)} height={py(57) - py(60)} fill="var(--ok-soft)" />
      <rect x={px(350)} y={py(48)} width={px(500) - px(350)} height={py(40) - py(48)} fill="var(--warn-soft)" />
      <rect x={px(500)} y={py(35)} width={px(600) - px(500)} height={py(25) - py(35)} fill="var(--accent-soft)" />

      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" />

      <circle cx={px(at[0])} cy={py(at[1])} r="3.5" fill="var(--accent)" />
      <text x={px(at[0])} y={py(at[1]) - 7} fontSize="9" fill="var(--accent)" textAnchor="middle">
        {at[1]} HRC
      </text>

      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--border)" strokeWidth="1" />
      {[200, 400, 600].map((t) => (
        <text key={t} x={px(t)} y={H - pad.b + 12} fontSize="8" fill="var(--text-faint)" textAnchor="middle">
          {t}℃
        </text>
      ))}
    </svg>
  )
}

export default function Component({ artifact, onSendMessage, onEmitArtifact }: FeatureProps) {
  const [params, setParams] = useState<Params>(() => readParams(artifact))

  // 后端推来新产物时同步参数
  useEffect(() => {
    setParams(readParams(artifact))
  }, [artifact])

  const result = useMemo(() => simulate(params), [params])
  const quenched = params.cooling === 'water'

  const update = (patch: Partial<Params>) => {
    const next = { ...params, ...patch }
    setParams(next)
    onEmitArtifact('heatTreatment', { ...next, ...simulate(next) })
  }

  return (
    <div className="feat">
      <h3>热处理工艺沙盒</h3>
      <div className="sub">45 钢 · 加热 860℃ 保温 15–20 min · 数据区间取自《教材》实验二十</div>

      {/* ── 冷却方式 ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(Object.keys(COOLING_LABEL) as Cooling[]).map((c) => (
          <button
            key={c}
            className="chip"
            onClick={() => update({ cooling: c })}
            style={
              params.cooling === c
                ? { borderColor: 'var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)' }
                : undefined
            }
          >
            {COOLING_LABEL[c]}
          </button>
        ))}
      </div>

      {/* ── 回火温度 ── */}
      <div style={{ opacity: quenched ? 1 : 0.4, pointerEvents: quenched ? 'auto' : 'none', marginBottom: 12 }}>
        <div className="kv" style={{ border: 'none', paddingBottom: 2 }}>
          <span>回火温度</span>
          <span>{params.temperTemp} ℃</span>
        </div>
        <input
          type="range"
          min={100}
          max={650}
          step={10}
          value={params.temperTemp}
          onChange={(e) => update({ temperTemp: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
      </div>

      {/* ── 含碳量 ── */}
      <div style={{ marginBottom: 14 }}>
        <div className="kv" style={{ border: 'none', paddingBottom: 2 }}>
          <span>含碳量</span>
          <span>{params.carbon.toFixed(2)} %</span>
        </div>
        <input
          type="range"
          min={0.02}
          max={2.11}
          step={0.01}
          value={params.carbon}
          onChange={(e) => update({ carbon: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
      </div>

      {/* ── 结果 ── */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '12px 13px',
          marginBottom: 12,
        }}
      >
        <div className="kv">
          <span>组织</span>
          <span style={{ fontFamily: 'var(--font-sans)' }}>{result.structure}</span>
        </div>
        <div className="kv" style={{ border: 'none', alignItems: 'baseline' }}>
          <span>硬度</span>
          <span style={{ fontSize: 24, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {result.hardnessHrc}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>HRC</span>
          </span>
        </div>
      </div>

      {result.warning && (
        <div
          style={{
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            borderRadius: 'var(--r-sm)',
            padding: '8px 11px',
            fontSize: 'var(--fs-sm)',
            marginBottom: 12,
            color: 'var(--warn)',
          }}
        >
          {result.warning}
        </div>
      )}

      {quenched && (
        <div style={{ marginBottom: 12 }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            回火温度 — 硬度曲线
          </div>
          <Curve activeT={params.temperTemp} />
        </div>
      )}

      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 12 }}>
        {result.diagnosis}
      </div>

      <button
        className="chip"
        onClick={() =>
          onSendMessage(
            `请解释：45 钢在 ${COOLING_LABEL[params.cooling]}、回火 ${params.temperTemp}℃ 时，` +
              `为什么得到${result.structure}、硬度约 ${result.hardnessHrc} HRC？`,
          )
        }
      >
        让 Agent 展开解释
      </button>
    </div>
  )
}
