import type { FeatureProps } from '../../lib/types'

/**
 * 材料结构 3D（structure3d）
 *
 * TODO（负责人请补全）:
 * - 用 @react-three/fiber 渲染 props.artifact.data 里的 {atoms, bonds, cell}
 * - 严禁在前端做晶体学计算：原子坐标、间隙位置、晶面截取、柏氏回路一律由后端算好下发
 * - 功能清单直接照抄《教材》实验一「三、实验内容」，逐条实现即为验收通过
 * - 参考：README.md 的「三、契约」 的 load_structure 工具入参
 *
 * 数据形状见 README.md 的「三、契约」。
 * 完整实现可参考 features/heatTreatment/。
 */
export default function Component({ artifact }: FeatureProps) {
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>材料结构 3D</h3>
      <div className="sub">FCC / BCC / HCP 晶胞 · 四面体与八面体间隙 · 晶面晶向 · 柏氏矢量回路</div>

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
