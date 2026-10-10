import type { FeatureProps } from '../../lib/types'

/**
 * 知识图谱 / 问题图谱（graph）
 *
 * TODO（负责人请补全）:
 * - 用 @antv/g6 渲染 {nodes, edges}，两图复用同一份数据，靠 mode 字段切换
 * - 图布局坐标由后端算好后下发，前端只负责画，不要在前端跑力导向布局
 * - 主干链：成分 → 相组成 → 组织形态 → 性能 → 可调控工艺（《教材》实验四）
 * - 点击节点要能跳转到对应的知识库条目
 *
 * 数据形状见 README.md 的「三、契约」。
 * 完整实现可参考 features/heatTreatment/。
 */
export default function Component({ artifact }: FeatureProps) {
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>知识图谱 / 问题图谱</h3>
      <div className="sub">成分 → 相 → 组织 → 性能 → 工艺 主干链 · 两种视图切换</div>

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
