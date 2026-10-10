import type { FeatureProps } from '../../lib/types'

/**
 * 金相图像诊断（micrograph）
 *
 * TODO（负责人请补全）:
 * - 渲染 {imageUrl, defects:[{type, cause, fix, textbookStep}], confidence}
 * - 缺陷分类必须逐条对齐《教材》实验三：取样位置不当 / 边缘圆角 /
 *   腐蚀不均匀（夹持腐蚀电池）/ 假组织（变形层未除）/ 划痕 / 拖尾 /
 *   腐蚀过度发黑 / 腐蚀不足
 * - 输出固定四段式：缺陷类型 → 成因 → 下一步纠正操作 → 对应教材步骤
 *
 * 数据形状见 README.md 的「三、契约」。
 * 完整实现可参考 features/heatTreatment/。
 */
export default function Component({ artifact }: FeatureProps) {
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>金相图像诊断</h3>
      <div className="sub">上传试样照片 · 缺陷识别 · 成因与纠正操作</div>

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
