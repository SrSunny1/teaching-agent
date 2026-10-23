# 知识库RAG —— 模块任务书

> **作用域：`frontend/src/features/module2/` 及 `backend/app/tools/materials_rag/`。**
> 项目级规则（三道线、契约、自检命令）在仓库根目录的 [`AGENTS.md`](../../../../AGENTS.md)，**先读那个**。
> 两者冲突时以本文件为准（嵌套更深的优先）。

| 项 | 值 |
|---|---|
| 模块名 | **知识库RAG** |
| artifactType | `module2` |
| 前端 | `frontend/src/features/module2/`（**三栏画布模式**，`autoOpenCanvas: true`，与错题集、费曼追问同位阶） |
| 后端工具 | **`backend/app/tools/materials_rag/`**（包装原系统 HTTP API，并产出 `module2` 画布证据产物） |
| 接入对象 | **仓库内置的「材料科学RAG系统」**（`rag-system/`，默认 `http://127.0.0.1:8765`） |
| 左栏顺序 | 20（第二模块，位于「全局对话」与「课程图谱」之后） |
| 模块身份 `persona` | **已填**（见 `index.ts`） |
| 主题 | 主智能体 `tokens.css` 统一设计语言 + 模块内部可配置主题色 `--kb-accent`（默认靛青） |

---

## 一、这个模块要做什么

**本模块为【课程文献与证据溯源画布】，与错题集、费曼追问、3D 可视化采用完全一致的三栏工作台形态：**

- **左栏**：壳的统一导航（保留「全局对话」在第一位，「知识库RAG」作为第二模块）
- **中栏**：壳的标准对话流与输入框（天然支持 📎 上传/粘贴金相图片、工具调用卡片与流式回答）
- **右栏画布（`autoOpenCanvas: true`）**：提供全局对话没有的三项 RAG 专属能力：
  1. **Tab 1 · 证据溯源**：中栏每次触发 `materials_rag`（`search`/`ask`/`get`），后端自动将命中的原文段落、所属讲义、章节、匹配度得分与 `chunkId` 组装为 `module2` 产物推上画布；支持本地展开完整段落、「调阅解读」与「围绕此段追问」。
  2. **Tab 2 · 课程资料库（15 份封闭语料精读与定向提问）**：按 **教材（1）/ 课程讲义（6）/ 教学大纲（2）/ 劳动教育（6）** 四类分组浏览；支持**勾选 1~3 份讲义「🎯 锁定范围定向提问」**（将 `documentIds` 传给 `materials_rag`）或多篇对比。
  3. **Tab 3 · 补充资料与后台**：提供课堂笔记文本入库表单（调 `add_text`）、主题色切换，以及「新窗口打开 RAG 后台（完整版）」按钮（跳往 `:8765` 查看底层向量与 BM25 配置）。

## 二、数据形状（`KbArtifact`，camelCase）

`backend/app/tools/materials_rag/__init__.py` 在 `status` / `search` / `ask` / `list` / `get` / `add_text` 六个动作下返回 `ToolResult(..., artifact_type="module2", artifact={...})`：

```json
{
  "mode": "search",
  "query": "金相试样制备的完整流程",
  "answer": "",
  "focusedDocIds": ["doc_a163fb0e84f8ef3669"],
  "evidences": [
    {
      "chunkId": "chk_doc_a163fb0e84f8ef3669_0001_0000",
      "documentId": "doc_a163fb0e84f8ef3669",
      "documentTitle": "课程讲义·金相试样制备",
      "category": "课程讲义",
      "section": "一、实验目的与制备五步流程",
      "score": 0.912,
      "snippet": "金相试样制备是材料显微组织分析的基础环节……",
      "content": "完整原文段落……"
    }
  ],
  "documents": [
    {
      "id": "doc_a163fb0e84f8ef3669",
      "title": "课程讲义·金相试样制备",
      "category": "课程讲义",
      "source": "实验三讲义 · 取样镶嵌磨光抛光浸蚀",
      "status": "ready"
    }
  ],
  "totalDocs": 15,
  "baseUrl": "http://127.0.0.1:8765",
  "note": "检索「金相试样制备」命中 3 段课程原文证据"
}
```

## 三、验收标准

- 左栏点「知识库RAG」→ 进入三栏工作台，中栏为标准对话流（可上传/粘贴图片），右栏自动展开「课程文献与证据溯源画布」并渲染 `preview.ts` 的 3 条真实证据卡与 15 份课程资料
- 点击画布快捷检索 chip 或在中栏提问 → Agent 调用 `materials_rag` → 右栏画布实时更新命中证据卡（右上角「预览数据」标签消失）
- 在「课程资料库」勾选 1~2 份讲义并定向提问 → Agent 以 `documentIds` 精确检索所选讲义
- 「补充资料与后台」tab 中点「新窗口打开 RAG 后台（完整版）」可打开 `:8765` 原系统页面；关掉插件开关显示「插件已禁用」卡片且左栏入口保留
- `python scripts/check-boundaries.py` 与 `cd frontend && npx tsc -b` 全绿

## 四、只改这些

- `frontend/src/features/module2/`
- `backend/app/tools/materials_rag/`
- `backend/app/rag_autostart.py`
