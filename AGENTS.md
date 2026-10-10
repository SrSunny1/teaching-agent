# AGENTS.md —— 给编码 Agent 的项目规则

> 这个文件会被 Codex 之类的编码工具自动读取。**动手改代码前先读完。**
> 详细说明见 [`README.md`](README.md)（项目本身）与 [`协作流程.md`](协作流程.md)（怎么一起干）。

## 项目是什么

教学类竞赛作品「材料物理实验教学 Agent」。四人分工，每人负责 1–2 个模块。
知识边界是封闭的：《材料科学基础》实验教材 7 个实验 + 劳动教育四大模块，**越界的问题一律拒答**。
界面是三栏 Agent 工作台（左栏模块导航 / 中栏对话流 / 右栏可视化画布）。

## ★ 铁律：三道线

这是最重要的规则。**默认假设你只被授权改 🟢 那一层。**

| 线 | 路径 | 规则 |
|---|---|---|
| 🟢 **可以改** | `frontend/src/features/<当前模块>/`、`backend/app/tools/<当前工具>/` | 只在用户明确认领的模块范围内 |
| 🟡 **先问再说** | `frontend/src/lib/types.ts`、`backend/app/events.py`、`package.json`、`README.md` 第三节 | 改之前先告诉用户「我要改 X，影响 Y」，等他确认 |
| 🔴 **不要碰** | `frontend/src/shell/`、`frontend/src/styles/`、`backend/app/chat.py`、`AGENTS.md`、`CODEOWNERS` | 除非用户明确要求改框架 |

**额外的两条：**

- **不要互相 import**。功能模块之间不许 import 对方（`import x from '../graph/...'` 是违规的）。
  需要共享的代码提出来放到 `frontend/src/lib/`，并告诉用户。
- **不要装新依赖**，除非用户明确同意。已装的：React 18、Vite、Tailwind、`@react-three/fiber`、
  `@react-three/drei`、three、`@antv/g6`、katex、react-markdown。

## 契约速查（改前后端都要看）

**JSON 字段一律 camelCase。** 完整契约见 `README.md` 第三节。

每个功能模块在 `frontend/src/features/<名>/index.ts` 默认导出：

```ts
export default {
  id: '<名>',                       // 必须等于文件夹名
  title: '模块名',
  artifactTypes: ['<artifactType>'], // 全局唯一
  order: 10,                        // 左栏排序
  preview,                          // 样例数据，在 preview.ts
  Component,
} satisfies FeatureModule
```

后端工具写在 `backend/app/tools/<名>/__init__.py`，导出 `TOOL`，
`name` 必须等于文件夹名。返回 `ToolResult(..., artifact_type="xxx", artifact={...})` 就能挂到画布。

**artifactType 是开放的自定义字符串**，每个模块自己定，全局唯一即可。
`ArtifactType` 类型就是 `string`，**故意不做成联合类型** —— 因为模块会换，
写死名字会导致每换一个模块都要改 `types.ts` 这个共享文件。

当前已有的（`python scripts/module.py list` 可随时查）：

| artifactType | 模块 | 数据形状 |
|---|---|---|
| `knowledge` | 知识库 · 术语库问答 | `{query, chunks:[{source,experiment,section,text}], terms:[{zh,en,definition,refs}]}` |
| `structure3d` | 材料结构 3D 可视化 | `{structure, feature, atoms:[{x,y,z}], bonds:[[i,j]], sites, cell, stacking, params}` |
| `feynman` | 费曼追问 | `{concept, rounds:[{question,userAnswer,critique}], score}` |
| `graph` | 知识图谱 · 问题图谱 | `{mode:'knowledge'\|'question', nodes:[{id,label,type,desc,refs}], edges:[{source,target,relation}], focus}` |
| `micrograph` | 图像诊断 | `{imageUrl, isMicrograph, confidence, defects:[{type,cause,fix,textbookStep}], summary}` |
| `heatTreatment` | 热处理工艺沙盒 | `{cooling, temperTemp, carbon, structure, hardnessHrc, curve:[[t,h]], diagnosis, warning}` |

拼写错误有运行时兜底：重名会 warn，没人认领的类型画布会显示「没有功能认领」而不是白屏。

**封闭集合（这几个不要乱加值）**：`relation` = 前置依赖/因果/对比/组成；
`type`（图谱节点）= 成分/相/组织/性能/工艺/缺陷；`section`（知识库）= 见 `README.md` 契约表。

## 加/删模块用脚手架，不要手搓

```bash
python scripts/module.py list                       # 现有模块
python scripts/module.py new <名> --title "显示名" --artifact <类型> [--tool <工具名>]
python scripts/module.py rm <名>                    # 连前后端一起删
```

**不需要改任何公共文件** —— 前端 `import.meta.glob`、后端 `pkgutil` 都是扫描目录的。
手搓容易漏（比如工具名和模块名不一致时，删模块会漏删后端工具）。

## 数值必须有教材依据

**不许编造参数。** 涉及工艺参数、硬度、温度时，数值必须能追溯到教材或任务书原文，
回答里要给出处（格式：`> 出处：《教材》实验X · 章节名`）。教材没写的，在界面上标注「教材未涉及」。

已知的两个坑（改 `simulate_heat_treatment` 前务必读它的注释）：
- 教材那条回火温度-硬度曲线本身就是 45 钢实测值，**0.45%C 处不能再做含碳量修正**
- 教材在 500℃ 处中温/高温回火区间重叠，模型取 500℃ 归中温回火，500–510℃ 是过渡带

## 干完必须跑的自检

```bash
python scripts/check-boundaries.py        # 项目根目录；越界就报红
python backend/tests/test_smoke.py        # 改了数值模型或 chat.py 后必跑
```

前端类型检查：`cd frontend && npx tsc -b`（**不要裸跑 `npx tsc`**，会抓到废弃的同名包）。

**报红先修，不要让用户带着错误提交。**

## 怎么跑起来看效果

```bash
# Windows：双击 setup.bat（装一次），双击 start.bat（每天启动）
# Linux/macOS：./setup.sh，然后 cd backend && uvicorn app.main:app --reload --port 8000
#               + cd frontend && npm run dev
```

**界面在 http://localhost:5173**（8000 是后端 API，打开只有一段 JSON，不是界面）。

点左栏模块 → 画布用 `preview.ts` 的样例数据渲染 → 右上角标注「预览数据」。
**这一步不需要后端、不需要 API Key**，改完代码浏览器自动刷新。

## 参考实现

`frontend/src/features/heatTreatment/` 是**全项目的样板**：有本地交互、内联 SVG 绘图、
参考数值模型，注释里写了「组件该怎么写」的四条约定。**做新模块前先读它。**

## 环境坑

- 项目在 Windows 挂载盘（WSL 的 `/mnt/...`）上时 `npm install` 可能报 `ENOTEMPTY`
- 不要用 `npm install --no-optional`（会跳过 rollup 的平台二进制，构建报 `MODULE_NOT_FOUND`）
- 老式 `.doc` 是 OLE 二进制，`knowledge/ingest.py` 用 UTF-16LE 抽取兜底，能用但不如 `.docx` 干净
