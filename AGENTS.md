# AGENTS.md —— 给编码 Agent 的项目规则

> 这个文件会被 Codex 之类的编码工具自动读取。**动手改代码前先读完。**
> 详细说明见 [`README.md`](README.md)（项目本身）与 [`协作流程.md`](协作流程.md)（怎么一起干）。

## 项目是什么

教学类竞赛作品「材料物理实验教学 Agent」。四人分工，每人负责 1–2 个模块。
知识边界是封闭的：《材料科学基础》实验教材 7 个实验 + 劳动教育四大模块，**越界的问题一律拒答**。
界面是三栏 Agent 工作台（左栏模块导航 / 中栏对话流 / 右栏可视化画布）。

## ★ 先读你的任务书

**每个模块有一份自己的任务书**，在 `frontend/src/features/<模块名>/AGENTS.md`。
它包含：这个模块要做什么、数据形状、当前进度、验收标准、怎么写。

**动手前先读对应那份。** 确定自己负责哪个模块看仓库根目录的 `CODEOWNERS`：

| 编号 | 模块名 | 任务书 | 负责人 |
|---|---|---|---|
| 1 | 模块 1（待定） | `frontend/src/features/module1/AGENTS.md` | A |
| 2 | 模块 2（待定） | `frontend/src/features/module2/AGENTS.md` | A |
| 3 | 模块 3（待定） | `frontend/src/features/module3/AGENTS.md` | B |
| 4 | 模块 4（待定） | `frontend/src/features/module4/AGENTS.md` | B |
| **7** | **3D 可视化** | `frontend/src/features/visual3d/AGENTS.md` | **SrSunny1** |
| **8** | **费曼追问** | `frontend/src/features/feynman/AGENTS.md` | **SrSunny1** |

> 📌 **visual3d / feynman 已定名**，**模块 1~4 仍是编号占位，名字待定。**
> （原模块 5、6 已删除，负责人 C 暂无模块）
> 名字定了之后，改三处：各任务书的「模块名」行、`CODEOWNERS` 的路径、本表。
> 用 `python scripts/module.py list` 随时核对当前状态。

> ⚠️ **`CODEOWNERS` 是给 GitHub 用的**（决定谁的 PR 该找谁 review），
> **编码 agent 不读它**。任务看上面这张表，归属看 `CODEOWNERS`，两者不是一回事。
>
> 如果你在仓库根目录运行，本文件是自动注入的；模块任务书需要你主动去读
> （或者 `cd` 进那个模块目录再启动，那样它也会自动注入）。

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
  persona: '这个模块在教学上负责什么',  // 可选，见下
  artifactTypes: ['<artifactType>'], // 全局唯一
  order: 10,                        // 左栏排序
  preview,                          // 样例数据，在 preview.ts
  autoOpenCanvas: false,             // 可选：展示型模块设 true，见下
  Component,
} satisfies FeatureModule
```

**`autoOpenCanvas`（可选，默认 false）—— 产出 artifact 时要不要自动展开右栏画布。**

判据只有一条：**这个模块的交付物是不是那块画布本身？**
展示型（3D、图谱、图表、动画）设 `true`；对话型（追问、讲解、批改）**别设** ——
内容都在对话流里，画布弹出只是从问答区抢屏幕。

**`persona`（可选）—— 让 Agent 知道自己是谁。** 它会随每次请求发给后端、拼进系统提示词。
不填的话，学生在你的模块里问「你负责什么」，Agent 只会笼统答「我是教学智能体」。

- 只写**职责 / 范围**，不要写「你有什么能力、什么权限」——知识边界、溯源要求、
  必须调工具这些由 `backend/app/config.py` 的 `SYSTEM_PROMPT` 统一授予，写在 persona 里
  既不生效、还会和它打架。
- 单行、≤100 字；**不要写字段名**（`id`、`artifactTypes` 这类）、**不要用英文撇号** ——
  `scripts/module.py` 和 `check-boundaries.py` 都用正则扫 `index.ts` 且取最左匹配。

后端工具写在 `backend/app/tools/<名>/__init__.py`，导出 `TOOL`，
`name` 必须等于文件夹名。返回 `ToolResult(..., artifact_type="xxx", artifact={...})` 就能挂到画布。

**artifactType 是开放的自定义字符串**，每个模块自己定，全局唯一即可。
`ArtifactType` 类型就是 `string`，**故意不做成联合类型** —— 因为模块会换，
写死名字会导致每换一个模块都要改 `types.ts` 这个共享文件。

当前已有的（`python scripts/module.py list` 可随时查）：

| artifactType | 模块 | 数据形状 |
|---|---|---|
| `module1` | 模块 1（名字待定） | 【待填 —— 在该模块任务书的「数据形状」一节写】 |
| `module2` | 模块 2（名字待定） | 【待填】 |
| `module3` | 模块 3（名字待定） | 【待填】 |
| `module4` | 模块 4（名字待定） | 【待填】 |
| `visual3d` | 3D 可视化 | `{structure, feature, atoms:[{x,y,z}], bonds:[[i,j]], sites, cell, stacking, params}` |
| `feynman` | 费曼追问 | `{concept, rounds:[{question,userAnswer,critique}], score}` |

> 📌 **这张表是全项目的契约表。** 每个模块的数据形状定下来后，**同步填进来**，
> 并在群里说一声 —— 前后端都按这张表对字段。

拼写错误有运行时兜底：重名会 warn，没人认领的类型画布会显示「没有功能认领」而不是白屏。

**封闭集合（这几个不要乱加值）**：`relation` = 前置依赖/因果/对比/组成；
`type`（图谱节点）= 成分/相/组织/性能/工艺/缺陷；`section`（知识库）= 见 `README.md` 契约表。

## 整页模式：什么时候该用，四条硬规矩

默认每个模块渲染在**右栏画布**里（对话流还在左边）。但 `FeatureModule` 可以多填一个
`page` 组件 —— 填了它，**点这个模块时主区整个换成它**，壳的顶栏/对话流/输入框全部让位。
代码示例见 `frontend/src/features/pageDemo/`（一个最小可跑的整页示例）。

```ts
const feature: FeatureModule = {
  id: 'xxx',
  title: '...',
  artifactTypes: ['xxx'],
  order: 50,
  preview,
  Component,        // 画布模式（默认）
  page: Page,       // ★ 整页模式（可选）—— 只在下面这种情况才填
}
```

### 什么时候该用

**技术上没有数量上限** —— 6 个模块全用整页都行，代码里没有任何计数。

真正的判断标准是**这个模块需要的是「更大的画布」，还是「另一种交互形态」**：

| 该用整页 | 不必用整页 |
|---|---|
| **管理型界面**：上传、索引、浏览、检索、批量操作 | **展示型模块**：3D、图谱、图表、动画 |
| **多 tab 工作台**：一个模块里有好几套互不相干的视图 | 单个可视化 |
| 确实塞不进「对话 + 画布」的形态 | 只是想"大一点" |

> 只想"大一点"的 → 点画布标题栏的 ⛶ **全屏按钮**（不用改代码），别开整页。

### 三条硬规矩

1. **左栏永远是壳的。** 模块不许改左栏、不许在左栏加东西。左栏是产品的统一标识，
   也是学生离开整页的出口。

2. **配色/字体/圆角必须用 `tokens.css` 的 CSS 变量。** 你可以有完全不同的**布局**，
   但必须在同一套**设计语言**里。**不许自造一套**（比如米色背景 + 蜂巢底纹 + 另一套圆角）。

   > 让界面显得零散的，**不是"布局不同"，是"设计语言不同"**。
   > Gmail 的收件箱、日历、设置页布局完全不同，但一看就是一个产品 —— 因为它们共用
   > 同一套字体、颜色、间距、控件。换了设计语言才是"8 个应用拼起来的"。

3. **必须留一个「能看见 Agent 在干活」的入口。** ★ 这条最重要。

   整页模式下**没有对话栏**，所以模块内要自己提供一个。最自然的形式是一个
   「智能问答」tab：用户提问 → 看到**工具调用卡片** → 看到**流式回答**。

   **为什么必须留**：这个作品叫「教学 Agent」。三栏工作台、工具调用卡片、流式回答 ——
   这些是「这是个 Agent」的视觉证据。如果整页界面看起来只是普通网页，
   **评委就看不到"Agent"在哪了**，那这个作品的核心卖点就丢了。

### 整页模块照样能驱动 Agent

`page` 组件拿到的 props 和 `Component` 完全一样：
`{ artifact, onSendMessage, onEmitArtifact }`。
所以整页界面里也能调 `onSendMessage()` 让 Agent 去干活 —— 只是界面由你自己画。
`pageDemo` 的「智能问答」tab 就是规矩 3 的示范写法。

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

**已知的两个坑**（改后端工具 `simulate_heat_treatment` 的数值模型前务必读它的注释）：
- 教材那条回火温度-硬度曲线本身就是 45 钢实测值，**0.45%C 处不能再做含碳量修正**
  （曾因此把 200℃ 回火算成 53 HRC，落在教材 57–60 区间外）
- 教材在 500℃ 处中温/高温回火区间重叠（40 HRC vs 35 HRC），模型取 500℃ 归中温回火，
  500–510℃ 是过渡带，界面上要如实提示

改了数值模型后跑 `backend/tests/test_smoke.py` —— 它会逐点校验是否落在教材区间内。

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

**界面地址看 Vite 启动时打印的 `Local:` 那一行** —— 默认 5173，被别的项目占了会自动往后跳
（5174、5175…）。**别照抄 README 里写死的数字**；打开错端口会看到别的项目，症状是「模块点不动」。
8000 是后端 API，打开只有一段 JSON，不是界面。

点左栏模块 → 进这个模块**自己的对话** → 画布默认是空的（可视化由对话触发）。
想看模块自带的样例数据，画布空态里点「查看样例数据」→ 右上角会标注「预览数据」。
**这一步不需要后端、不需要 API Key**，改完代码浏览器自动刷新
（⚠️ 项目在 WSL 挂载盘 `/mnt/...` 上时这条**不成立** —— 前后端的热更新都会静默失效，
见 `README.md` 第五节第 7 条。**看不到效果时先怀疑进程在跑旧版本，再怀疑代码**）。

## 参考实现

**热处理工艺沙盒**是全项目的样板（本地交互、内联 SVG 绘图、参考数值模型，
注释里写了「组件该怎么写」的四条约定）。做新模块前先读它。

它现在在 **`frontend/src/reference/heatTreatment/`**（2026-10-11 重构成 module1~8 之前的版本）：

```bash
ls frontend/src/reference/heatTreatment/     # Component.tsx / model.ts / preview.ts / index.ts
```

**它不会出现在左栏**（不在 `frontend/src/features/` 下），只是拿来抄结构用的。
看完不需要恢复它 —— 直接照着写自己的组件即可。

## 环境坑

- 项目在 Windows 挂载盘（WSL 的 `/mnt/...`）上时 `npm install` 可能报 `ENOTEMPTY`
- 不要用 `npm install --no-optional`（会跳过 rollup 的平台二进制，构建报 `MODULE_NOT_FOUND`）
- 老式 `.doc` 是 OLE 二进制，`knowledge/ingest.py` 用 UTF-16LE 抽取兜底，能用但不如 `.docx` 干净
