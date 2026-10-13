# 3D 可视化 —— 模块任务书

> **作用域：`frontend/src/features/visual3d/` 及其子目录。**
> 项目级规则（三道线、契约、数值要求、自检命令）在仓库根目录的 [`AGENTS.md`](../../../../AGENTS.md)，**先读那个**。
> 两者冲突时以本文件为准（嵌套更深的优先）。

| 项 | 值 |
|---|---|
| 模块名 | **3D 可视化** |
| artifactType | `visual3d` |
| 前端 | `frontend/src/features/visual3d/` |
| 后端工具 | `backend/app/tools/load_structure/` |
| 左栏顺序 | 70 |
| 负责人 | **SrSunny1**（框架负责人兼） |
| 模块身份 `persona` | **已填**（见 `index.ts`）—— Agent 在本模块里会以晶体结构可视化子智能体的身份作答 |

---

## 一、这个模块要做什么

把材料微观结构做成**可交互的 3D 可视化**。核心内容取自《教材》实验一「三、实验内容」，
逐条实现即为验收通过：

- **晶胞**：FCC / BCC / HCP 的球棍模型、原子排列密度
- **间隙**：四面体间隙与八面体间隙的位置、分布
- **晶面晶向**：从晶胞拆出 (100) (110) (111) 晶面（HCP 拆 (0001) 与 (11-20)），
  在晶面上标定至少两个晶向指数
- **堆垛**：密排面堆垛顺序（FCC 的 ABCABC / HCP 的 ABAB）
- **位错**：刃型 / 螺型 / 混合型位错线附近的原子排布，支持**勾画柏氏矢量闭合回路**
  —— 这是最好的交互点，让学生自己绕一圈闭合，比看图强十倍

**界面上长什么样**：右栏画布显示可旋转缩放的 3D 场景，按 `feature` 参数切换视图，
配 `OrbitControls` 交互。学生问「面心立方晶胞有几个原子」时自动加载对应模型。

## 二、数据形状

后端工具 `load_structure` 返回 `ToolResult(..., artifact_type="visual3d", artifact={...})`，
前端 `Component.tsx` 从 `props.artifact?.data` 读它：

```json
{
  "structure": "sc | bcc | fcc | hcp",
  "feature": "cell | octahedral | tetrahedral | plane | stacking | dislocation",
  "atoms": [{ "x": 0, "y": 0, "z": 0 }],
  "bonds": [[0, 1], [0, 8]],
  "sites": [{ "x": 0.5, "y": 0.5, "z": 0.5, "kind": "八面体间隙" }],
  "cell": { "a": 1, "b": 1, "c": 1.633 },
  "stacking": "ABCABC…（密排面 {111}）",
  "params": { "atomsPerCell": 4, "coordination": 12, "packing": 0.74, "nearestNeighbor": 0.7071 }
}
```

**封闭集合**：`relation` = 前置依赖/因果/对比/组成；`type` = 成分/相/组织/性能/工艺/缺陷。
**JSON 字段一律 camelCase。**

⚠️ **注意 artifactType 不一致**：后端 `load_structure` 现在返回的是 `artifact_type="structure3d"`，
和本模块的 `visual3d` 对不上 —— **接手后第一件事就是改它**，否则画布会显示「没有功能认领」。

## 三、当前状态

- ⬜ **前端 `Component.tsx` 是脚手架占位**（把 JSON 打印出来）—— **主要工作量在这里**
- ⚠️ 后端 `load_structure` **能真算**原子坐标 / 最近邻键 / 间隙位置，但：
  - `_sites()` 只实现了 `octahedral` / `tetrahedral`
  - `plane` / `stacking` / `dislocation` 三个 feature **返回空数组**，要补
  - `artifact_type` 是旧的 `structure3d`，要改成 `visual3d`
- ⚠️ `load_structure` 顶部注释有个待办：**间隙位置的「个数」要对照教材核一遍**
  （现在给的是几何位置集合，可视化够用，但讲「每个晶胞含几个间隙」必须按教材口径）

## 四、验收标准

**通用三条（必须过）：**

- 左栏点进来 → `preview.ts` 的样例数据能正常渲染
- 对话里提问 → 触发工具 → 画布显示真实结果（右上角「预览数据」标签消失）
- `python scripts/check-boundaries.py` 全绿

**本模块特有：**

- 左栏点「3D 可视化」→ 能看到**可旋转、可缩放**的 FCC 晶胞
- 能切到八面体 / 四面体间隙视图，间隙位置高亮标出
- 能拆出 (100) (110) (111) 晶面，并在晶面上标出晶向指数
- 能演示 FCC 的 ABCABC 与 HCP 的 ABAB 堆垛顺序
- 能勾画柏氏矢量闭合回路（交互式，不是静态图）
- 对话问「面心立方晶胞有多少原子」→ 画布加载 3D 模型，回答带教材出处
- 每个晶胞的间隙个数与教材口径一致（不能是"几何位置集合"的个数）

## 五、怎么写（四条约定）

1. **从 `props.artifact?.data` 读数据。** `null` 就是还没数据，显示空态。
2. **本地交互即时反馈** —— 拖滑杆、切视图这类**不要发网络请求**。
3. **需要 Agent 干活时调 `props.onSendMessage('...')`。**
4. **要把新状态推回画布时调 `props.onEmitArtifact('visual3d', {...})`。**

**两条硬约束：**

- **不要在组件里自己发网络请求。** 需要数据就让 Agent 去调工具。
- **不要改 `tokens.css`。** 样式用它已有的类（`.feat` / `.kv` / `.box` / `.chip`），
  要自定义就写内联样式。

**晶体学计算一律放 Python 后端，前端只渲染** —— 项目约定（前端只有一个人，负担要减）。
原子坐标、间隙位置、晶面截取、柏氏回路，都不许在前端算。

## 六、只改这些

- `frontend/src/features/visual3d/`
- `backend/app/tools/load_structure/`

其他地方一律不碰。提交前跑 `python scripts/check-boundaries.py`。
