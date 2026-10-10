# 材料物理实验教学 Agent

教学类竞赛作品。知识边界为「材料科学基础实验教材 7 个实验 + 劳动教育四大模块」，
界面是 DeepSeek Harness / Codex 风格的三栏工作台。

**两个文档，各管一头：**

| 文档 | 管什么 | 谁看 |
|---|---|---|
| **README.md**（本文件） | 项目本身：怎么跑、模块是什么、契约、agent 指令、环境坑 | 全员 |
| **[协作流程.md](协作流程.md)** | 怎么一起干：仓库怎么建、谁能改什么、每天做什么、什么时候找人 | 全员 |

> **每个模块负责人：** 看 [协作流程.md](协作流程.md) 认领，
> 然后回来复制本文件**第四节**自己那一段丢给 agent。

---

## 一、跑起来

### 第一次：装环境（每台机器一次，约 10 分钟）

**Windows（双击就行）：**

```
setup.bat
```

**Linux / macOS：**

```bash
./setup.sh
```

脚本会做 4 件事：检查本机有没有 Python/Node → 装 Python 依赖（Windows 用 `backend\.venv` 虚拟环境）→ 生成 `.env` → 装 JS 依赖并入库知识库。
**装完就不用再装了**，以后每天只是 `git pull` 改代码。

> **装的是什么？** 你代码里 `import` 的第三方库（React、Three.js、FastAPI、OpenAI SDK…）。
> 这些包**故意不进 git**（`node_modules/` 在 `.gitignore` 里）—— 几百 MB 塞进仓库，
> clone 会慢到没法忍，而且四个人的版本会打架。所以是「clone 代码 → 各自装依赖」，这是标准做法。

### 每天：启动

**Windows（双击）：**

```
start.bat
```

会开两个窗口（后端 / 前端）并自动打开浏览器。关掉窗口就是停服务。

**Linux / macOS，或想自己控制：**

```bash
# 终端 1 —— 后端
cd backend && uvicorn app.main:app --reload --port 8000

# 终端 2 —— 前端
cd frontend && npm run dev
```

### 只想看自己的模块效果？

装完环境就能看，**不需要启动后端、不需要 API Key**：

```bash
cd frontend && npm run dev     # 打开 http://localhost:5173
```

点左栏自己的模块 → 画布用 `preview.ts` 里的样例数据渲染 → 右上角标注「预览数据」。

| 地址 | 是什么 |
|---|---|
| **http://localhost:5173** | **★ 界面在这里** |
| http://localhost:8000 | 后端 API，只返回一段说明 JSON，**不是界面** |
| http://localhost:8000/docs | 接口文档，可交互调试 |

后端没启动、或没配 Key 时，前端自动进 **mock 模式**，界面照样能点。
点左栏自己的模块，画布会用自带样例数据渲染，右上角标注「预览数据」。

自检（**提交前必跑**）：

```bash
# 边界检查，10 秒，无依赖
python scripts/check-boundaries.py

# 数值模型 + Agent 循环 + 自动注册（要装过后端依赖）
# Windows：backend\.venv\Scripts\python backend\tests\test_smoke.py
# 其他：  python3 backend/tests/test_smoke.py
```

---

## 二、6 个模块归谁

左栏顺序与思维导图一致，由各 `index.ts` 的 `order` 字段控制。

| # | 模块 | artifactType | 前端 | 后端工具 | 负责人 |
|---|---|---|---|---|---|
| 1 | 知识库 · 术语库问答 | `knowledge` | `features/knowledge/` | `search_knowledge` / `troubleshoot_instrument` / `aggregate_safety_rules` | 同学1 |
| 2 | 材料结构 3D 可视化 | `structure3d` | `features/structure3d/` | `load_structure` | 同学1 |
| 3 | 费曼追问 | `feynman` | `features/feynman/` | —（走对话流） | 同学2 |
| 4 | 知识图谱 · 问题图谱 | `graph` | `features/graph/` | `query_graph` | 同学2 |
| 5 | 图像诊断 | `micrograph` | `features/micrograph/` | `diagnose_micrograph` | 同学3 |
| 6 | 热处理工艺沙盒 | `heatTreatment` | `features/heatTreatment/` | `simulate_heat_treatment` | 同学4 |
| — | **框架（壳）** | — | `src/shell/`、`src/lib/` | `app/chat.py` | **待指定** |

> ⚠️ **框架必须由一个人独占。** 6 个模块都有人，但框架没有 owner 就会烂掉。
> 定了之后把 `CODEOWNERS` 里的 `@p1`~`@p4` 换成真实 GitHub 用户名。

---

## 三、契约（Agent ↔ 壳 的唯一接口）

### Artifact 协议

后端通过 SSE 推 `{artifactType, data}`，壳查表找到注册该类型的组件，把 `data` 原样丢给它渲染。
**所以新增功能不需要改壳一行代码。**

每个 `features/<名>/index.ts` 默认导出：

```ts
export default {
  id: 'heatTreatment',            // 必须等于文件夹名
  title: '热处理工艺沙盒',          // 左栏显示名
  artifactTypes: ['heatTreatment'], // 全局唯一，见下表
  order: 60,                       // 左栏排序
  preview,                         // 样例数据，见第六节
  Component,
} satisfies FeatureModule
```

组件收到 `{artifact, onSendMessage, onEmitArtifact}`。
**组件内不要自己发网络请求** —— 需要数据就调 `onSendMessage()` 让 Agent 去调工具。

### artifactType 与数据形状（封闭集合，与思维导图一一对应）

**JSON 字段一律 camelCase。**

| artifactType | 数据形状 |
|---|---|
| `knowledge` | `{query, chunks: [{source, experiment, section, text}], terms: [{zh, en, definition, refs}]}` |
| `structure3d` | `{structure, feature, atoms: [{x,y,z}], bonds: [[i,j]], sites, cell, stacking, params}` |
| `feynman` | `{concept, rounds: [{question, userAnswer, critique}], score}` |
| `graph` | `{mode: 'knowledge'\|'question', nodes: [{id,label,type,desc,refs}], edges: [{source,target,relation}], focus}` |
| `micrograph` | `{imageUrl, isMicrograph, confidence, defects: [{type, cause, fix, textbookStep}], summary}` |
| `heatTreatment` | `{cooling, temperTemp, carbon, structure, hardnessHrc, curve: [[t,h]], diagnosis, warning}` |

### SSE 事件（只有 7 种，不许私自加第 8 种）

| type | 载荷 | 前端行为 |
|---|---|---|
| `thinking` | `{text}` | 追加到「思考过程」折叠区 |
| `token` | `{text}` | 追加正文，打字机 |
| `tool_call` | `{id, name, label, args}` | 插入工具卡片，转圈 |
| `tool_result` | `{id, summary, detail}` | 卡片停止转圈，显示摘要 |
| `artifact` | `{artifactType, data}` | 挂到右栏画布 |
| `error` | `{message}` | 状态栏红色提示 |
| `done` | `{}` | 结束本轮 |

后端工具写在 `backend/app/tools/<名>/__init__.py`，导出 `TOOL`：

```python
from ..base import Tool, ToolResult

async def _run(args: dict) -> ToolResult:
    return ToolResult(summary="一行摘要", detail="展开看的内容")

TOOL = Tool(
    name="你的工具名",                      # 必须等于文件夹名
    label="展示文案 · {参数名}",
    description="给模型看的说明，写得越清楚它越知道何时该调",
    parameters={"type": "object", "properties": {}, "required": []},
    run=_run,
)
```

返回 `ToolResult(..., artifact_type="xxx", artifact={...})` 就能挂到画布。

---

## 四、六个模块的 Agent 指令

**每个负责人复制自己那一段，丢给 agent 即可。** 每段都是自包含的。

先读一遍这三条，六段里不再重复：

- **只改** `frontend/src/features/<你的模块>/` 和 `backend/app/tools/<你的工具>/`
- **绝不改** `src/shell/`、`src/styles/`、`src/lib/`、`backend/app/chat.py`、`events.py`
- **不要装新依赖**（three / @react-three/fiber / @antv/g6 / katex 已装好）

`features/heatTreatment/` 是**完整参考实现**（含本地交互、SVG 绘图、参考模型），照着抄结构。

---

### 模块 1 · 知识库 · 术语库问答（同学1）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：知识库 · 术语库问答。

【铁律】
只改 frontend/src/features/knowledge/ 和 backend/app/tools/search_knowledge/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
不要装新依赖。JSON 字段用 camelCase。

【模块职责】
1. 知识库问答：基于教材+任务书的 RAG，答案必须带出处
2. 术语库：材料物理中英术语对照
（另有 troubleshoot_instrument / aggregate_safety_rules 两个子能力，后端已实现，只返回文本）

【当前状态】
- 前端 Component.tsx 已实现：渲染「命中原文卡（带来源/实验/章节徽标）+ 术语卡」
- 后端 search_knowledge 已产出 knowledge artifact，chunks 有真实数据
- ❌ terms 目前恒为空数组 —— 术语抽取还没做，这是你的主要任务

【你要做的】
1. 建术语表。从 backend/knowledge/raw/ 的教材与任务书里抽取材料物理术语，
   写成 backend/knowledge/terms.json，格式：[{zh, en, definition, refs:[出处]}]
   覆盖：晶体结构、位错、相、组织、热处理、硬度、金相制样 等主题。
2. 在 search_knowledge 的 _run 里按 query 匹配术语表，填充 artifact 的 terms 字段
   （当前那里有 TODO 注释）。
3. 改进检索质量：当前是关键词 2-gram 打分，试试加入同义词扩展
   （例如「筛分」↔「筛」「目数」）。

【验收】
- 对话里问「250目筛分的作用」→ 画布显示命中原文 + 至少 1 张术语卡
- 问一个知识库外的词（如「铝合金焊接」）→ 明确回答「知识库未收录」，不编造
- python scripts/check-boundaries.py 全绿

【完成后】群里喊「知识库模块可以点了」。
```

---

### 模块 2 · 材料结构 3D 可视化（同学1）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：材料结构 3D 可视化。

【铁律】
只改 frontend/src/features/structure3d/ 和 backend/app/tools/load_structure/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
three / @react-three/fiber / @react-three/drei 已装好，不要装别的。

【模块职责】
把《教材》实验一要求的晶体结构可视化，功能清单直接照抄教材「三、实验内容」：
- FCC / BCC / HCP 晶胞的球棍模型、原子排列密度
- 四面体间隙与八面体间隙的位置、分布
- 从晶胞拆出 (100)(110)(111) 晶面（HCP 拆 (0001)(11-20)），并在晶面上标定晶向指数
- 密排面堆垛顺序（FCC 的 ABCABC / HCP 的 ABAB）
- 刃型 / 螺型 / 混合型位错线附近的原子排布，支持勾画柏氏矢量闭合回路

【当前状态】
- 后端 load_structure 已能真算原子坐标、最近邻键、间隙位置，产出 structure3d artifact
  （数据形状：{structure, feature, atoms:[{x,y,z}], bonds:[[i,j]], sites, cell, stacking, params}）
- ❌ 前端 Component.tsx 只是占位，把 JSON 打印出来 —— 你的任务就是把它做成真的 3D

【要做的】
1. 先改 preview.ts 的样例数据（已有 FCC 数据），存盘后浏览器自动刷新就能看到
2. 用 @react-three/fiber 写 3D 场景：球棍模型、OrbitControls 旋转缩放
3. 按 feature 参数切换视图：cell / octahedral / tetrahedral / plane / stacking / dislocation
4. 后端补上尚未实现的 feature：plane（晶面截取）、stacking（堆垛顺序）、dislocation（位错）
⚠️ 晶体学计算一律放后端（同学1 你自己写 Python），前端只渲染 —— 这是为了给前端减负。

【注意】
load_structure 的文档字符串里标了一个待办：间隙位置的**个数**要对照教材核实一遍。
现在给的是几何位置集合，可视化够用，但讲「每个晶胞含几个间隙」时必须按教材口径。

【验收】
- 左栏点「材料结构 3D 可视化」→ 能看到可旋转的 FCC 晶胞
- 能切到八面体/四面体间隙视图，能看到间隙位置标出来
- 对话问「面心立方晶胞有多少原子」→ 画布加载 3D 模型，回答带出处
- python scripts/check-boundaries.py 全绿

【完成后】群里喊「3D 模块可以点了」。
```

---

### 模块 3 · 费曼追问（同学2）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：费曼追问。

【铁律】
只改 frontend/src/features/feynman/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
不要装新依赖。JSON 字段用 camelCase。

【模块职责】
学生用自己的话复述一个概念 → Agent 扮演只会追问的初学者，找出表述中的模糊点与逻辑跳跃，
逐层追问（至少 3 轮）→ 最后给出对照评价与改进建议。

【数据形状】artifactType 是 `feynman`
{concept, rounds: [{question, userAnswer, critique}], score}

【当前状态】
- 前端 Component.tsx 只是占位，把 JSON 打印出来
- 后端没有对应工具 —— 追问逻辑目前没有实现

【要做的】
1. 先改 preview.ts（已有一份「回火」三轮追问的样例），浏览器自动刷新即可看到
2. 改 Component.tsx：把 rounds 画成对话时间线 —— 每轮显示
   「Agent 的追问 → 学生的回答 → 点评」，最后一轮后显示总分与总评。
   参考 features/heatTreatment/Component.tsx 的结构与 tokens.css 里的已有样式类。
3. 后端追问逻辑：在 backend/app/tools/ 新建 feynman_quiz/ 文件夹，导出 TOOL，
   产出 feynman artifact。追问策略写进工具的 description 里，让模型按「先找模糊点、
   再找逻辑跳跃、最后给对照评价」的顺序推进。
   ⚠️ 新建工具不需要改任何注册表，pkgutil 自动扫描。
4. 学生答非所问时要先澄清问题再回主线，不要无限追问（这条写进工具 description）。

【验收】
- 左栏点「费曼追问」→ 能看到三轮追问的时间线渲染
- 对话里说「我来讲讲什么是回火」→ Agent 开始追问，画布实时更新轮次
- 至少 3 轮后才给总评
- python scripts/check-boundaries.py 全绿

【完成后】群里喊「费曼追问可以点了」。
```

---

### 模块 4 · 知识图谱 · 问题图谱（同学2）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：知识图谱 · 问题图谱。

【铁律】
只改 frontend/src/features/graph/ 和 backend/app/tools/query_graph/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
@antv/g6 已装好，不要装别的图表库。

【模块职责】
- 知识图谱：主干链「成分 → 相组成 → 组织形态 → 性能 → 可调控工艺」（出自《教材》实验四）
- 问题图谱：以「问题」为节点重构知识结构，边表示前置依赖/因果/对比
- 两图共享同一批概念数据，可切换

【数据形状】artifactType 是 `graph`
{mode: 'knowledge'|'question', nodes: [{id,label,type,desc,refs}], edges: [{source,target,relation}], focus}
封闭集合：relation = 前置依赖/因果/对比/组成；type = 成分/相/组织/性能/工艺/缺陷

【当前状态】
- 后端 query_graph 已能返回数据：优先读 data/graph.json，没有就用内置种子图
  （种子图有 23 个节点 + 22 条关系，够跑通链路）
- ❌ 前端 Component.tsx 只是占位 —— 你的任务是用 G6 画出来

【要做的】
1. 先改 preview.ts（已有 7 节点 5 关系的小图），刷新即可看到
2. 用 @antv/g6 渲染：节点按 type 分色，边按 relation 分线型，支持拖拽/缩放/聚焦高亮
3. 实现 knowledge / question 两种视图切换
4. 点击节点要能跳转到对应的知识库条目（调 onSendMessage 让 Agent 去检索）
5. 扩充图谱内容：现在种子图是我写的，节点数和关系密度都不够撑起演示。
   你的活儿是把《教材》实验四的组织-性能关系、实验二十的热处理工艺链补全，
   写进 data/graph.json。
⚠️ 图布局坐标由后端算好下发，前端不要跑力导向布局（渲染会卡）。

【验收】
- 左栏点「知识图谱 · 问题图谱」→ 能看到可交互的图
- 两图可切换，点击节点有反应
- 对话问「含碳量和组织有什么关系」→ 画布显示知识图谱
- python scripts/check-boundaries.py 全绿

【完成后】群里喊「图谱可以点了」。
```

---

### 模块 5 · 图像诊断（同学3）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：图像诊断。

【铁律】
只改 frontend/src/features/micrograph/ 和 backend/app/tools/diagnose_micrograph/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
不要装新依赖。JSON 字段用 camelCase。

【模块职责】
学生上传金相或试样表面照片 → 多模态模型识别制样缺陷 → 输出四段式：
缺陷类型 → 成因 → 下一步纠正操作 → 对应教材步骤。

【数据形状】artifactType 是 `micrograph`
{imageUrl, isMicrograph, confidence, defects: [{type, cause, fix, textbookStep}], summary}

【当前状态】
- 后端 diagnose_micrograph 已实现：调多模态模型，缺陷分类硬编码在 DEFECTS 里，
  **模型自由发挥的缺陷类型一律丢弃** —— 这是为了不让它发明教材里没有的缺陷。
  非金相图片返回 isMicrograph=false。
- ❌ 前端 Component.tsx 只是占位 —— 你的任务是把缺陷诊断结果画出来

【要做的】
1. 先改 preview.ts，加一张试样图片（放 frontend/public/ 下，imageUrl 写 '/xxx.jpg'），
   刷新即可看到
2. 改 Component.tsx：
   - 顶部显示图片预览
   - 每处缺陷一张卡：类型标签 + 成因 + 纠正操作 + 教材步骤徽标
   - 显示 confidence；isMicrograph=false 时显示「无法判定」而不是硬给结论
3. 接上传交互：Composer 里已有图片附件按钮（壳里预留的），
   需要和框架负责人商量怎么把图片传到你这块画布
4. 缺陷清单要逐条对齐《教材》实验三：取样位置不当 / 边缘圆角 / 腐蚀不均匀（夹持腐蚀电池）/
   假组织 / 划痕 / 拖尾 / 腐蚀过度 / 腐蚀不足

【验收】
- 左栏点「图像诊断」→ 能看到样例图片 + 缺陷卡渲染
- 对话里传一张金相照片 → 返回真实诊断，「预览数据」标签消失
- 传一张非金相图片（比如截图）→ 显示「无法判定」，不硬给结论
- python scripts/check-boundaries.py 全绿

【注】这条链路要真跑需要 API Key（多用 VISION_MODEL 环境变量）。
没有 Key 时先确保预览数据渲染好看。

【完成后】群里喊「图像诊断可以点了」。
```

---

### 模块 6 · 热处理工艺沙盒（同学4）

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：热处理工艺沙盒。

【铁律】
只改 frontend/src/features/heatTreatment/ 和 backend/app/tools/simulate_heat_treatment/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py。
不要装新依赖（图表用内联 SVG，参考现有实现）。

【模块职责】
三个滑杆控制冷却方式 / 回火温度 / 含碳量，实时联动输出：
组织名称、硬度 HRC、回火温度-硬度曲线、工艺诊断、越界警示。
数据区间取自《教材》实验二十（45 钢）。

【当前状态】
✅ **这个模块已经是完整参考实现，能跑了。** 前端有滑杆交互 + 内联 SVG 曲线，
   后端有数值模型，两端数值区间一致。
   它的作用是给其他模块当样板 —— 你拿到的是一个已经完成的东西。

【所以你的任务不一样：把它做深，而不是从零做】
1. **补全教材依据**：现在模型只有 45 钢一条曲线。教材表20-1 还有炉冷/空冷/水冷 ×
   回火温度的完整对照，以及保温时间（碳钢 1–9 min/mm、合金钢约 2 min/mm）。
   把这些补进去，让沙盒能回答「保温时间怎么定」这类问题。
2. **加 C 曲线可视化**：《教材》实验二十讲了理想冷却曲线（650–500℃ 快冷，
   Ms 点约 300–200℃ 以下慢冷）和临界冷却速度。这是本模块最有技术含量的部分，
   做一个可交互的冷却曲线图 —— 这是竞赛展示的加分项。
3. **组织示意图**：教材几乎没配图（只有 2 张）。用 SVG 画马氏体/珠光体/索氏体的
   示意组织，随滑杆联动。**评委用的是同一本教材，但没人有交互式组织图。**
4. 越界警示已实现（降温过快、回火温度超区间等），可按需补充。

【已知的两个坑，改代码前务必读注释】
- 教材那条曲线本身就是 45 钢实测值，0.45%C 处**不能**再做含碳量修正
  （曾经因此把 200℃ 回火算成 53 HRC，落在教材 57–60 之外）
- 教材在 500℃ 处中温/高温回火区间重叠（40 HRC vs 35 HRC），
  模型取 500℃ 归中温回火，500–510℃ 是过渡带，界面上要如实提示

【验收】
- 拖动三个滑杆，组织名称、硬度、曲线实时联动，帧率 ≥30fps
- 45 钢水冷 + 200℃ 回火落在 57–60 HRC（教材区间）
- 新增的内容不破坏 python backend/tests/test_smoke.py
- python scripts/check-boundaries.py 全绿

【完成后】群里喊「热处理沙盒更新了」。
```

---

## 五、环境坑（已踩过）

**1. WSL 挂载盘上 `npm install` 报 `ENOTEMPTY`**
项目在 `/mnt/e/...` 时 DrvFs 不满足 `rmdir` 原子性。清干净重来：
```bash
cd frontend && rm -rf node_modules package-lock.json && npm install
```
**建议把项目放到 WSL 的 Linux 侧（`~/` 下）开发，这个坑会消失。**

**2. 不要用 `npm install --no-optional`** —— 会跳过 rollup 的平台二进制，构建报 `MODULE_NOT_FOUND`。
补救：`npm install @rollup/rollup-linux-x64-gnu --no-save`

**3. 不要裸跑 `npx tsc`** —— 会去网上抓一个同名的废弃包。用 `npm run build` 或 `./node_modules/.bin/tsc`。

**4. 改完知识库素材要重新入库** —— `cd backend && python knowledge/ingest.py`
素材放 `backend/knowledge/raw/`。

**5. 老式 `.doc` 是 OLE 二进制**，`ingest.py` 用 UTF-16LE 抽取兜底，能用但不如 `.docx` 干净。
正式入库前建议用 Word 转成 `.docx`。
