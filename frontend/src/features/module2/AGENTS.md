# 知识库RAG —— 模块任务书

> **作用域：`frontend/src/features/module2/` 及 `backend/app/tools/materials_rag/`。**
> 项目级规则（三道线、契约、自检命令）在仓库根目录的 [`AGENTS.md`](../../../../AGENTS.md)，**先读那个**。
> 两者冲突时以本文件为准（嵌套更深的优先）。

| 项 | 值 |
|---|---|
| 模块名 | **知识库RAG** |
| artifactType | `module2`（仅画布预览用元信息） |
| 前端 | `frontend/src/features/module2/`（**整页模式**：iframe 内嵌原系统） |
| 后端工具 | **`backend/app/tools/materials_rag/`**（包装原系统 HTTP API） |
| 接入对象 | **仓库内置的「材料科学RAG系统」**（`../../../../材料科学RAG系统/`，默认 `http://127.0.0.1:8765`） |
| 左栏顺序 | 20 |
| 模块身份 `persona` | **已填**（见 `index.ts`） |
| 主题 | **不自建界面** —— 原系统的黄米色界面 1:1 呈现，主题归原系统管 |

---

## 一、这个模块要做什么

左栏的可点击块「知识库RAG」→ 整页**直接内嵌用户已有的「材料科学RAG系统」Web 界面**
（总览 / 文献库 / 智能问答 / 设置，含其暗色切换），**不自建任何页面、不改原系统一行代码**。

原系统自带完整能力：PDF/Markdown 入库、混合检索（语义向量 + BM25）、带证据引用的
生成式回答与段落级溯源。接口契约见其 `sdk/agent_tools.json` 与 `sdk/plugin.yaml`。

**连接判定**：iframe `onLoad` → 已连接；6 秒未触发 → 判定未启动，显示启动指引
（双击 `材料科学RAG系统/启动.bat` 或 `python start.py`）。服务地址可在顶栏地址框改
（存 localStorage 键 `plugin.knowledgeBase.baseUrl`，默认 `http://127.0.0.1:8765`）。

## 二、后端工具 materials_rag（与原系统共用同一套 API）

`backend/app/tools/materials_rag/__init__.py` 用标准库 urllib 包装原系统 HTTP API
（信封 `{"success": true, "data": ...}`），动作与 `sdk/agent_tools.json` 一一对应：

| action | 原系统接口 | 用途 |
|---|---|---|
| `status` | GET /api/meta | 服务能力与知识库规模 |
| `search` | POST /api/search | 检索原文段落（只检索不生成），引用标 chunk_id |
| `ask` | POST /api/ask | 带证据引用的生成式回答 |
| `list` | GET /api/documents | 文献列表（q / docStatus / limit 过滤） |
| `get` | GET /api/chunks/{id} | 按 chunk_id 取证据原文 |
| `add_text` | POST /api/documents/text | 文本入库（title + content 必填） |

- 服务地址读环境变量 `MSRAG_BASE_URL`（或 `MSRAG_HOST` / `MSRAG_PORT`），默认 8765；
- 服务未启动时**如实**返回启动指引，不臆造数据；
- HTTP 调用走 `asyncio.to_thread`，不阻塞事件循环；
- **不新增鉴权、不改原系统代码**；检索不到就明确告知模型"如实说明，不要臆造"。

## 三、当前状态

- ✅ 整页 iframe 内嵌（顶栏：状态点 / 地址框 / 连接 / 刷新 / 新窗口打开 / 插件开关）
- ✅ 未启动引导卡片（启动方法 + 重试 + 新窗口打开）
- ✅ 后端 `materials_rag` 六动作工具（含超时与连接失败兜底）
- ✅ 画布版 `Component.tsx`：说明 + 快捷入口（新窗口打开 / 让 Agent 查文献 / 查状态）
- ★ 历史版本说明：本模块曾自建黄米色自检页与 `rag_selfcheck` 工具（检查 teaching-agent
  自带 chunks.jsonl 语料），按用户要求已整体移除 —— 知识库全部模式以用户原系统为准。
  教学智能体 `data/chunks.jsonl` 那套语料仍在，仅不再由本模块管理。

## 四、验收标准

**通用三条：** 左栏点进来画布正常渲染；对话触发 `materials_rag` 后能拿到真实结果；
`python scripts/check-boundaries.py` 全绿。

**本模块特有：**

- 左栏白色风格可点击块「知识库RAG」→ 点击整页出现**原系统界面**（样式与原系统启动后一模一样）
- 原系统未启动时：显示启动指引卡片（不白屏）；启动后点「重试」→ 界面出现，状态点变绿
- 顶栏「新窗口打开」能新开原系统页面；地址框改端口后能连上
- 对话里问「知识库里有哪些文献」→ Agent 调 `materials_rag list` → 返回真实文献列表
- 问课程知识 → Agent 调 `search` / `ask` → 回答带 chunk_id 引用；知识库没有的内容，Agent 明确说明
- 顶栏「插件」开关关闭 → 本页立即显示「插件已禁用」卡片，**左栏入口保留**，点「启用」即刻恢复
  （不允许出现"禁用后入口消失找不回来"的死路）

## 五、怎么写（四条约定）

1. iframe 是唯一的内容载体，**不要在 iframe 外再包自定义业务界面**；
   ⚠️ `.kb-pos` 必须保持 flex 容器 —— iframe 没有固定高度，父容器不是 flex 时会回落到浏览器默认 150px，看起来就像"下半屏白屏"；
2. 连接状态判定只用 iframe 生命周期（onLoad / 超时），组件不发数据请求；
3. 需要 Agent 干活时调 `props.onSendMessage('...')`；
4. 顶栏样式用 tokens.css 令牌，**不改 tokens.css、不改原系统 web/ 目录**。

## 六、只改这些

- `frontend/src/features/module2/`
- `backend/app/tools/materials_rag/`

**原系统目录 `材料科学RAG系统/` 一律不碰。** 提交前跑 `python scripts/check-boundaries.py`
与 `cd frontend && npx tsc -b`。
