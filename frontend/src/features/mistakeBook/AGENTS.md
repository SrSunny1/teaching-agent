# 材料科学错题集 —— 模块任务书

> **作用域：`frontend/src/features/mistakeBook/` 及 `backend/app/tools/mistake_book/`。**
> 项目级规则（三道线、契约、自检命令）在仓库根目录的 [`AGENTS.md`](../../../../AGENTS.md)，**先读那个**。
> 两者冲突时以本文件为准（嵌套更深的优先）。

| 项 | 值 |
|---|---|
| 模块名 | **材料科学错题集** |
| artifactType | `mistakeBook` |
| 前端 | `frontend/src/features/mistakeBook/`（**画布模式**，与费曼追问、3D 可视化同位阶） |
| 后端工具 | **`backend/app/tools/mistake_book/`**（已建，含 16 条错题库） |
| 左栏顺序 | 30 |
| 模块身份 `persona` | **已填**（见 `index.ts`） |
| 主题 | 主智能体白色基调 + 模块内部**可配置主题色**（默认墨金，调试面板可换） |

---

## 一、这个模块要做什么

**本模块为【材料科学错题集画布插件】，用于学生错题诊断、错误溯源、订正指导。**
（这句身份标识固定显示在画布顶部横幅。）

交互范式参考作业帮错题解析，画布上的每条错题严格按六段渲染：

**① 原题展示 → ② 学生错误答案（红） → ③ 错误根源（类型标签 + 说明） →
④ 知识点溯源（知识点 + 出处 chips） → ⑤ 正确解答（绿） → ⑥ 避坑总结**

画布独立开合，不影响费曼、3D 可视化等其他画布的运行。

## 二、错题库（数据源）

**唯一真相源：`backend/app/tools/mistake_book/bank.py`。** 前端不存题库。

- **大纲预存方向**：晶体结构与晶体缺陷 / 凝固与结晶 / 材料显微组织分析 /
  典型材料的物相组织观察 / 材料表面硬度的测定 / 材料膨胀系数的测定 / 金属材料的热处理；
- **扩充的高频易错点**：16 条覆盖 晶体学、晶体缺陷、扩散、相图、相变、热处理、
  凝固与结晶、金属材料、材料力学性能、陶瓷材料、高分子材料、金相实验 共 12 类；
- 每条必须五件套齐全：题目原文 / 学生典型错误作答 / 错误根源 / 标准正确解答 / 同类易错提醒；
- `rootCauseKind` 封闭集合：**概念混淆 / 公式误用 / 模型理解偏差 / 忽略边界条件 / 计算失误 / 其他**
  （后端 `ROOT_CAUSE_KINDS` 与前端 `types.ts` 双处维护，改要同步）；
- 数值口径：回火硬度区间出自《教材》实验二十（与 `config.SYSTEM_PROMPT` 一致）；
  共析 0.77%C·727℃、共晶 4.3%C·1148℃、FCC 0.74 等为通用课程事实，条目内逐条标出处。

## 三、工具动作与数据形状

`mistake_book` 工具按 `action` 分四路，artifact 统一为
`{ mode, entries: MistakeEntry[], total, note?, candidates? }`（camelCase，形状见 `types.ts`）：

| action | 触发场景 | 行为 |
|---|---|---|
| `list` | 「浏览全部题库」 | 返回全部/指定分类条目 |
| `draw` | 「抽一道错题」/ 点分类 chip | 按 topic/category 匹配（中文 2-gram），抽 1~3 条 |
| `record` | 对话里拆解完一道错题 | **模型填五件套** → 工具校验整形 → 推画布；缺 question/studentAnswer 拒收并提示追问 |
| `extract` | 「从知识库出题」 | 检索 chunks.jsonl 原文片段作出题素材（candidates），配套相关题库条目，**检索不到就如实说，不许编题** |

★ `record` 的触发时机靠工具 `description` 里的封闭集合与"必须推送"约束——
改 description 时别放松「对话中出现错题并完成拆解后必须调 record」这条。

## 四、前端交互与本地状态

- **错题拆解 tab**：artifact 条目在前、本地记录在后（按 id 去重）；本地记录可删除；
  `extract` 模式附带的出题素材卡片渲染在列表下方。
- **录入错题 tab**：手动表单（题目/错误作答必填，其余可后补）→ `saveRecord()` 存 localStorage
  （键 `plugin.mistakeBook.records`，上限 100 条）→ `onEmitArtifact('mistakeBook', {...})` 推上画布。
- **题库浏览 tab**：12 个分类 chip → 点击发消息抽题；主题输入框 → 从知识库出题。
- **调试 tab**（预留调试接口，满足联调需求）：
  - `window.__mistakeBookDebug`：`dump()` / `add(entry)` / `clear()` / `selfTest()`（见 `records.ts`）；
  - 「运行自检」按钮跑存储与校验链路自检；「模拟一条解析输出」不经后端直接测画布渲染链路；
  - **主题色配置**（4 色色板，键 `plugin.mistakeBook.accent`）；**插件启用开关**；
  - 最近一次产物 raw JSON。
- 画布展示的条目**合并去重**逻辑在 `Component.tsx`（artifact 优先）；改合并规则要同时照顾
  手动录入与对话解析两条来源。

## 五、验收标准

**通用三条：** 左栏点进来 preview 正常渲染（回火错题六段完整）；对话触发工具后画布显示真实条目；
`python scripts/check-boundaries.py` 全绿。

**本模块特有：**

- 画布顶部固定显示模块身份横幅；六段式卡片编号、颜色（错答红 / 正解绿 / 根因黄标签）正确
- 「抽一道错题」→ 画布实时追加一条五件套齐全的错题
- 对话里贴一道错题（如「我把共析点答成了 4.3%」）→ Agent 拆解 → record 推画布
- 手动录入：只填两必填项也能入画布（缺失字段显示"待补全"占位，不白屏）
- 刷新页面后手动录入的错题仍在（localStorage 持久化）
- 调试面板：selfTest 全绿；模拟输出能渲染；主题色切换即时生效且只影响本模块
- 关掉插件开关 → 画布显示「插件已禁用」卡片，**左栏入口保留**，点「启用」即刻恢复
  （不允许出现"禁用后入口消失找不回来"的死路）；费曼、3D 可视化画布不受任何影响
- `extract` 检索不到主题时，Agent 如实告知，不编造习题

## 六、怎么写（四条约定）

1. 从 `props.artifact?.data` 读数据，`null` 显示空态引导；
2. 本地交互（切 tab、表单、删除）不发网络请求；
3. 需要 Agent 干活（抽题/出题/解析）时调 `props.onSendMessage('...')`；
4. 白底基调用 tokens.css 令牌；模块主题色收敛在 `--mb-accent` 一个变量里，**不改 tokens.css**。

**解析与评判逻辑在 Python 后端 / 模型侧，前端只负责渲染六段拆解** ——
不要在前端实现错题匹配或根因分析。

## 七、只改这些

- `frontend/src/features/mistakeBook/`
- `backend/app/tools/mistake_book/`

其他地方一律不碰。提交前跑 `python scripts/check-boundaries.py` 与 `cd frontend && npx tsc -b`。
