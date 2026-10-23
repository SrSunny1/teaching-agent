# 课程图谱 —— 模块任务书

> **作用域：`frontend/src/features/module1/` 及 `backend/app/tools/query_graph/`。**
> 项目级规则（三道线、契约、自检命令）在仓库根目录的 [`AGENTS.md`](../../../../AGENTS.md)，**先读那个**。
> 两者冲突时以本文件为准（嵌套更深的优先）。

| 项 | 值 |
|---|---|
| 模块名 | **课程图谱**（知识图谱 + 问题图谱） |
| artifactType | `module1` |
| 前端 | `frontend/src/features/module1/`（**整页模式**：图谱占满中间与右侧；全局对话触发时仍走画布模式） |
| 后端工具 | **`backend/app/tools/query_graph/`**（mode = knowledge / question） |
| 左栏顺序 | 10 |
| 负责人 | **SrSunny1** |
| 模块身份 `persona` | **已填**（见 `index.ts`） |

---

## 一、这个模块要做什么

把课程的**知识结构**和**问题链**画出来，让学生看清「知识点之间怎么连、一个问题通向哪些问题」。

- **整页工作台**：点左栏「课程图谱」→ 壳的对话栏让位，星图 / 问题链占满中间与右侧；
  右上角「Agent 问答」抽屉是硬规矩 3 的入口（工具调用卡片 + 流式回答），
  图谱里的「让 Agent 讲解 / 深度解析」会自动打开抽屉。
- **知识图谱**：五级知识点（1 个课程核心 → 6 大星团 → 三/四/五级细分），
  **真 WebGL 3D 星空**（`@react-three/fiber` + `@react-three/drei`）：
  六大星系团分布在立体六芒 3D 坐标（`SECTORS.center`），三级在倾斜轨道面成环、
  四/五级绕父节点展开（`galaxyLayout.ts` 计算 + 斥力松弛防遮挡）；
  `Stars`/`Sparkles` 星野、发光星球（加色辉光 + 行星环）、`QuadraticBezierLine` 空间弧边、
  `OrbitControls` 自由环绕/缩放/平移。
  点击星球 → 相机**飞越到它前方**并把轨道中心切到该节点（之后上下/左右拖拽 = 绕它 360° 环绕），
  其余节点退暗，只高亮它的**上级 / 下级 / 跨星团关联**网络；
  顶部面包屑逐级回跳，右侧详情面板列出全部关联并可跳到「关联的课程问题」。
  **视角预设**：全景 / 俯瞰 / 侧视 / 深空巡航（贴近星系 + 自动环视），另有 ± 缩放按钮、
  星团筛选 chips、层级图例过滤、关系图例（组成 / 因果 / 前置依赖 / 对比）、搜索定位、明暗切换。
- **问题图谱**：三层递进问题链（第一层级基础理解 → 第二层级实验表征 → 第三层级综合应用），
  卡片按截图样式渲染（序号 / 层级配色 / 认知标签 / 关联知识点 chips / 连接锚点计数），
  同出口的贝塞尔连线**扇形散开防重叠**；悬停或点击卡片 → 高亮整条路径并叠加流动光点；
  点知识点 chip → 跳回知识图谱并聚焦该节点；详情抽屉含解答要点、常见错误、上下游问题。

**数据来源（不许编造）**：`backend/knowledge/raw/课程讲义/01~06-*.md`、
`backend/knowledge/raw/教学大纲/01~02-*.md`、《材料物理专业实验讲义》（郭永利）。

## 二、数据形状

前端静态数据在 `frontend/src/features/module1/graphData.ts`（**单一真相源**），
后端 `data/graph.json` 由它生成（`/tmp/gen-graph.cjs` 式的 esbuild 脚本，改完要同步重新生成）。

```json
{
  "mode": "knowledge | question",
  "focus": "节点 id 或关键词（可空）",
  "nodes": [{ "id": "temper", "label": "回火：高温回火、中温回火、低温回火", "level": 5,
              "sector": 4, "parent": "fourfires", "type": "工艺", "desc": "…", "refs": ["课程讲义·金属材料热处理"] }],
  "edges": [{ "source": "quench", "target": "temper", "relation": "前置依赖" }],
  "questionNodes": [{ "id": "q3_2", "label": "如何制定合适的热处理工艺", "tier": 3,
                      "type": "创造", "desc": "…", "knowledgeIds": ["heattreat"] }],
  "questionEdges": [{ "source": "q2_1", "target": "q3_2", "relation": "前置依赖" }]
}
```

- `relation` 封闭集合：**前置依赖 / 因果 / 对比 / 组成**（组成 = 父子层级边）。
- `type`（知识点）：可选的封闭集合 **成分 / 相 / 组织 / 性能 / 工艺 / 缺陷**；不填就按层级展示。
- `tier`：1 基础理解 / 2 实验表征 / 3 综合应用；`bloom`：记忆 / 理解 / 应用 / 分析 / 创造。
- 前端渲染只用静态数据；artifact 只负责「切视图 + 聚焦」，字段是 `mode` 与 `focus`。

## 三、当前状态

- ✅ 知识图谱：**71 节点 / 105 边**（一级 1 / 二级 6 / 三级 25 / 四级 35 / 五级 4），
  **R3F 真 WebGL 3D 星空**：六大星系团立体六芒分布（`SECTORS.center` 真 3D 坐标），
  `Stars`/`Sparkles` 星野 + 发光星球（加色辉光/行星环）+ `QuadraticBezierLine` 空间弧边，
  `OrbitControls` 自由环绕 + 点击星球飞越并绕它旋转、面包屑回跳、星团筛选、搜索、
  层级筛选、明暗切换、复位、自动旋转、聚焦关联网络、详情面板
- ✅ 问题图谱：13 道三层问题（6 / 4 / 3）、18 条前置依赖边，
  SVG 贝塞尔连线束（同出口扇形散开、ResizeObserver 重算）、路径流动高亮、详情抽屉、
  与知识图谱双向联动
- ✅ 整页工作台：图谱占满中间与右侧，右上角「Agent 问答」抽屉（工具调用卡片 + 流式回答），
  图谱按钮触发的提问会自动打开抽屉
- ✅ `query_graph` 工具已从 `_RETIRED` 启用，产出 `artifact_type="module1"`，
  `focus` 支持按名称/关键词模糊匹配
- ⬜ 待补：学生自测题自动生成（暂不做，避免越界编题）

## 四、验收标准

**通用三条：** 左栏点进来 preview 正常渲染；对话触发 `query_graph` 后画布切到对应视图并聚焦；
`python scripts/check-boundaries.py` 全绿。

**本模块特有：**

- 整页模式：点左栏「课程图谱」→ 中间对话栏消失、图谱占满中间与右侧；
  右上角「Agent 问答」能展开，提问后能看到工具调用卡片与流式回答
- 知识图谱：节点分六个星团、层级正确（一级 1 / 二级 6 / 三级 25 / 四级 35 / 五级 4），
  无节点重叠到看不清；点击「金相样品的制备」→ 仅其上下级与跨星团关联保持高亮
- 问题图谱：三列分别 6 / 4 / 3 张卡片；连接锚点数字与真实边数一致；
  点击第一层级任一卡片 → 其下游路径全部高亮，其余卡片变淡
- 双向联动：问题卡片的知识点 chip → 知识图谱聚焦；知识节点详情里的「关联课程问题」→ 问题图谱聚焦
- 「让 Agent 讲解 / 深度解析」按钮能把问题发进对话，且 Agent 回答可溯源到讲义

## 五、怎么写（四条约定）

1. **从 `props.artifact?.data` 读 `mode` / `focus`**；图谱数据本身是前端静态数据。
2. **本地交互即时反馈**（旋转、缩放、选中、筛选）**不发网络请求**。
3. **需要 Agent 干活时调 `props.onSendMessage('...')`。**
4. **样式用 tokens.css 变量**（`--bg-panel` / `--text` / `--border` 等），不新增全局样式。

**布局计算放前端（纯静态数据），内容与出处必须可追溯到课程讲义/教学大纲。**

## 六、只改这些

- `frontend/src/features/module1/`
- `backend/app/tools/query_graph/`
- `data/graph.json`（由 `graphData.ts` 生成，不要手改）

其他地方一律不碰。提交前跑 `python scripts/check-boundaries.py`、`python backend/tests/test_smoke.py`
与 `cd frontend && npx tsc -b`。
