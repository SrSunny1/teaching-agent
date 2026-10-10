import type { FeatureProps } from '../../lib/types'

/**
 * 费曼追问（feynman）
 *
 * TODO（负责人请补全）:
 * - 渲染 {concept, rounds:[{question, userAnswer, critique}], score}
 * - 追问逻辑走后端，本组件只负责把 rounds 画成时间线
 * - 至少 3 轮追问后才允许给出总评
 *
 * 数据形状见 README.md 的「三、契约」。
 * 完整实现可参考 features/heatTreatment/。
 */
export default function Component({ artifact }: FeatureProps) {
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>费曼追问</h3>
      <div className="sub">用户复述 → Agent 扮演初学者逐层追问 → 对照评价</div>

      {!data && (
        <div className="box">
          等待 Agent 触发 —— 在对话里提问，或让 Agent 调用对应工具
        </div>
      )}

      {data ? (
        <>
          <div className="sub" style={{ marginBottom: 6 }}>
            当前产物（占位渲染，待替换为真实可视化）
          </div>
          <pre className="raw">{JSON.stringify(data, null, 2)}</pre>
        </>
      ) : null}
    </div>
  )
}
