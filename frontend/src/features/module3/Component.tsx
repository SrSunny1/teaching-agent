import type { FeatureProps } from '../../lib/types'

/**
 * 模块3（module3）
 *
 * ★ 这是脚手架生成的占位实现，请替换。
 *
 * 怎么写，参考 _backup-旧模块/heatTreatment/ —— 那是全项目的样板：
 *   1. 从 props.artifact?.data 读数据
 *   2. 本地交互即时反馈，不要自己发网络请求
 *   3. 需要 Agent 干活时调 props.onSendMessage()
 *   4. 要把新状态推给画布时调 props.onEmitArtifact()
 *
 * 数据形状由你自己定，定好后写进 README.md 第三节的契约表，并告诉其他人。
 */
export default function Component({ artifact }: FeatureProps) {
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>模块3</h3>
      <div className="sub">脚手架生成的占位 —— 待实现</div>

      {!data && (
        <div className="box">
          在对话里提问，Agent 调到你的工具后，结果会显示在这里
        </div>
      )}

      {data ? (
        <>
          <div className="sub" style={{ marginBottom: 6 }}>
            当前产物（占位渲染，替换成真实可视化）
          </div>
          <pre className="raw">{JSON.stringify(data, null, 2)}</pre>
        </>
      ) : null}
    </div>
  )
}
