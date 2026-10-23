# 材料科学 RAG 知识库

从一套成熟的工业级 RAG 系统中抽出来的**插件版**：保留完整的 RAG 全流程，
换掉主题（材料科学），简化掉登录/用户/管理员/审批，并把重型基础设施
（PostgreSQL + Milvus + etcd + MinIO + bge-m3 微服务）换成了可嵌入的轻量实现。

> 一句话：**拷走即用**。`python start.py` 就能跑通「上传 → 解析 → 分块 → 嵌入 → 检索 → 生成 → 溯源」全链路。

---

## 快速开始

```bash
# 方式一：Windows 双击
启动.bat

# 方式二：命令行
python start.py

# 指定端口 / 不开浏览器
python start.py --port 9000 --no-browser
```

启动脚本会自动完成：环境体检 → 初始化数据库 → 灌入内置示例语料 → 起服务 → 自检 → 打开浏览器。
默认访问 <http://127.0.0.1:8765>。

**配 Key**：启动后打开界面右上角的 **设置**，填入 LLM 的 Base URL / Key / 模型名，点「测试连接」确认通，
再点「保存」——保存即刻热生效，无需重启服务。详情见下方 [设置页](#设置页web-内配置-key)。

**依赖**（核心零依赖，但强烈建议装上这两个）：

```bash
pip install pypdf numpy          # ← 强烈建议：直接决定 PDF 解析质量
pip install paddleocr            # 扫描件 OCR（需要额外下载模型，约 GB 级）
```

`requirements.txt` 里列的就是这些可选项——**核心功能对第三方包零依赖，不装也能跑**，
但**不装 `pypdf` 的 PDF 解析质量会差很多**，原因见下方 [PDF 解析质量](#pdf-解析质量关键)。

---

## 目录结构

```
材料科学RAG系统/
├── start.py                 一键启动（建库 / 灌样例 / 起服务 / 自检）
├── 启动.bat                 Windows 双击启动
├── .env.example             配置模板（复制为 .env 生效）
│
├── core/                    基础层（零依赖）
│   ├── config.py            配置加载 + .env 解析
│   ├── store.py             SQLite 数据访问（父子双层分块表结构）
│   ├── settings_store.py    ★ 运行时配置读写（写回 .env，密钥掩码）
│   ├── logging.py           日志（文件 + 控制台）
│   └── ids.py               ID 生成
│
├── rag/                     RAG 核心
│   ├── pipeline.py          全流程编排（摄入 / 检索 / 生成 / 流式 / 热重载）
│   ├── parsers/
│   │   ├── service.py       解析编排（PDF / Markdown / 文本）
│   │   ├── ppsv3_adapter.py ★ PP-StructureV3 版面解析（跨解释器子进程）
│   │   ├── paddle_adapter.py PaddleOCR 可选增强
│   │   └── pdf_native.py    ★ 纯标准库 PDF 解析器
│   ├── chunker.py           父子双层分块器
│   ├── embedder.py          三级降级嵌入（API / 本地 / 哈希）
│   ├── vectorstore.py       向量库 + BM25 混合检索（读写锁保护）
│   ├── llm.py               LLM 客户端（流式 SSE）
│   ├── prompts.py           材料科学领域提示词 + 抽取式降级作答
│   └── text_utils.py        token 估算 + CJK 友好分词
│
├── server/http_api.py       HTTP 服务（路由 / multipart / SSE / 静态托管）
├── web/                     前端（原生 HTML+CSS+JS，无构建、无 CDN）
├── ppsv3/                   ★ 自研 PDF 解析（rag.py，自包含单文件 CLI）
├── samples/                 内置材料科学示例语料（5 篇 Markdown + PDF 生成器）
├── sdk/                     ★ 给其它智能体用的插件客户端
│   ├── materials_rag_client.py
│   └── agent_tools.json     Function Calling 工具清单
├── tools/                   辅助工具（Markdown → PDF 生成器）
└── data/                    运行时数据（SQLite / 上传文件 / 向量索引 / 日志）
```

---

## RAG 全流程

```
                    ┌───────────── 摄入 ─────────────┐
 PDF / MD / TXT ──▶ 解析 ──▶ 父子双层分块 ──▶ 嵌入 ──▶ 向量索引
                     │          │              │
              ppsv3/pypdf/内置  父块=章节      三级降级
                  PaddleOCR    子块=检索单元   API/本地/哈希
                    └──────────────────────────────────┘

                    ┌───────────── 问答 ─────────────┐
 提问 ──▶ 问题嵌入 ──▶ 混合检索(稠密+BM25) ──▶ 上下文组装
      ──▶ LLM 流式生成 ──▶ 引用落库 ──▶ 证据溯源
                    └────────────────────────────────┘
```

### 关键设计决策（与原项目的对照）

| 环节 | 原项目 | 本插件 | 原因 |
|---|---|---|---|
| 数据库 | PostgreSQL + SQLAlchemy 异步 | SQLite（标准库 sqlite3） | 单文件、免部署 |
| 向量库 | Milvus（HNSW/COSINE）+ etcd + MinIO | 内存索引 + BM25，落盘 JSON | 免去一套容器编排 |
| 嵌入 | bge-m3 独立微服务（需 torch） | API → 本地 → 哈希三级降级 | 离线也能跑通 |
| PDF | PaddleOCR PP-StructureV3（GB 级依赖） | **四级降级**：ppsV3 → paddle → pypdf → 内置 | 零依赖兜底，有环境则自动升级 |
| 任务队列 | 独立 worker 进程 + spawn 子进程 | 后台线程 + job 进度表 | 省掉进程管理 |
| 认证 | JWT + 用户/角色/审批流 | 全部移除 | 插件不需要多租户 |
| 配置 | 只认 `.env` + 环境变量 | `.env` 为准，界面可写回 | 单一配置源，不打架 |

### 多级降级（重点）

这是本插件"一定能跑起来"的关键：

1. **嵌入**：有 API Key → 调 OpenAI 兼容 `/embeddings`；装了本地模型 → 进程内加载；
   都没有 → **哈希词袋向量**（零依赖，词法级检索，对术语密集型文献其实相当有效）。
2. **生成**：有 API Key → LLM 生成式回答；没有 → **抽取式作答**（直接摘录证据原文并排序，
   明确标注"未经语言模型润色"，绝不冒充生成结果）。生成中途失败也会降级而不是报错。
3. **解析（四级）**：**ppsV3 版面解析** → PaddleOCR → pypdf → 内置解析器，
   逐层降级并在元数据里如实记录实际用了哪个（`doc.parser` 字段）。

---

## PDF 解析质量（关键）

这一节解释了为什么"能解析"和"解析得好"是两件事。

### 解析器按可信度择优，不是按字数

四级降级链上每个解析器都可能成功返回，此时系统要选一个。
**选错就会得到能入库、但没法读的文本。**

内置解析器会在字符之间插入伪空格，例如同一页的两种情况：

```
内置：吉林农业大学学报20 26 htt p://xu eba o.jl au.ed u.cn
      Journ al of Jili n Agricul tur al U nive rsit y
     基于STM3 2与物联网的粮仓智能巡检机器人系统设计

pypdf：吉林农业大学学报 2026    http://xuebao.jlau.edu.cn
      Journal of Jilin Agricultural University
      基于 STM32 与物联网的粮仓智能巡检机器人系统设计
```

注意一个反直觉的细节：**内置解析器字数更多**（23900 vs 23764），
因为垃圾空格把长度撑大了。所以早期"谁字多谁赢"的择优逻辑会**稳定地挑中最差的解析器**。

现在改为按解析器可信度排序：`ppsv3 > paddle > pypdf > 内置`。
只有当高可信度解析器抽到的文本明显偏少（低于最优值的 67%）时，才让位给文本更多的那个。
这样既保证质量，又不会在 pypdf 部分失效时丢内容。

### 为什么强烈建议装 pypdf

实测同一篇 PDF：

| 解析器 | 结果 |
|---|---|
| 内置 | **0 字**（直接报"文件已损坏"） |
| pypdf | **20795 字**（正常） |

内置解析器对某些字体编码解不出来，会整篇抽空；此时报错是误导性的
"文件可能已损坏或是加密受限文档"——文件其实是好的。装了 pypdf 就正常了。

---

## ppsV3 版面解析（PDF 增强）

`ppsv3/rag.py` 是基于 PaddleOCR PP-StructureV3 的自研解析器，相比纯文本抽取，
它能识别**版面结构**——标题层级、表格、公式、图片区域，并按阅读顺序输出 Markdown。
对材料科学论文里常见的性能对比表、物性参数表，这是质量差距最大的一环。

### 为什么要跨解释器调用

PP-StructureV3 只支持 Python 3.9–3.11，而插件主体跑在 3.13，两者无法共存于同一进程。
所以适配器把 `rag.py` 当**外部 CLI** 调用：spawn 一个兼容版本的解释器，
结果 JSON 从 stdout 提取（PaddleOCR 会往日志里吐大量噪音，因此用括号配平从末尾反向提取）。

### 开启方式

1. 准备一个 Python 3.9–3.11 的**独立环境**（推荐 GPU 版，见 `requirements.txt` 里已验证的组合）。
2. 界面 **设置 → PDF 版面解析**：打开开关，填入该环境的解释器路径，
   设备填 `gpu:0`（有 NVIDIA 显卡时），点「检测环境」，状态变为可用后保存。
3. 之后上传的 PDF 会优先走 ppsV3；失败自动降级到下一级，不影响入库。

自动探测顺序（解释器留空时）：同目录 `.venv` → `python3.11/3.10/3.9` → `py -3.x`。
探测结果缓存在 `data/ppsv3_env.json`，**冷却期 300 秒**，避免每次请求都 spawn 一堆进程
（实测首次全量扫描 22.6 秒，命中缓存后 0.001 秒）。

### CPU 还是 GPU：差距是数量级的

同一篇 7 页 PDF 的实测对比：

| 设备 | 耗时 | 结果 |
|---|---|---|
| CPU（关闭 oneDNN） | **> 11 分钟未完成** | 超时放弃 |
| GPU（RTX 5070 / 8GB） | **97.7 秒** | 76 个版面块，27525 字符 |

所以**有显卡就一定要用 GPU**。设置里把设备从 `cpu` 改成 `gpu:0` 即可，
前提是那个环境装的是 `paddlepaddle-gpu`（而非 `paddlepaddle`）。

### 版面配图

ppsV3 会把识别出的**图片 / 表格 / 图表区域裁成截图**，随解析结果一起归档到
`data/assets/<文献ID>/`，通过 `/api/assets/<文献ID>/<文件名>` 提供访问。

这些配图在三个位置可见：

- **文献详情 → 版面配图**：整篇的图表一览，点击可看原图
- **段落卡片**：命中段落自带配图，右上角标出「N 图」
- **问答引用**：引用卡片下方直接附上该段涉及的原文图表

实现上，截图引用以 `![id](/api/assets/...)` 内联在正文里，因此**图片天然跟着
分块走**——不需要额外做位置对齐。展示时前端把它们抽出来渲染成 `<img>`，
引用原文则剥离语法只留纯文本。

独立图表块（`image_` / `table_` / `chart_`）会全部内联进正文；公式图与嵌套子图
（`img_in_formula_box_` 等）只在「版面配图」一览里出现，不占正文。

**同页配图兜底**：问「系统总体架构图是怎样的」时，命中的往往是没有内联配图的
纯文字段落，而那张图就在同一页上。所以检索结果里若某段自身没有配图，会自动补上
**同页**的版面配图（每段最多 3 张）——这样引用卡片上就能看到原文的图。
兜底只作用于检索/问答结果，文献详情里的段落列表不受影响，免得被同页配图刷屏。

### 真实页码

ppsV3 每个版面块都带 PDF 真实页码，解析时会回填到段落上，因此引用里显示的是
「第 5 页」而不是恒为「第 1 页」，文献列表的总页数也与 PDF 一致。

这里有个容易踩的坑：Markdown 解析器默认按 token 预算**合成分页**（文本类文件
没有真实页码才这么做），13 页的 PDF 会被切成 27 个"页"。ppsV3 走的是另一条
按真实页码分页的链路，不要用 `len(doc.pages)` 去覆盖它。

### 质量报告

ppsV3 每次解析都会回传质量指标，可在「设置 → 检测环境」里查看：
`page_count` / `block_count` / `type_counts`（版面块类型分布）/
`visual_block_count`（图片+表格块数）/ `title_binding_rate`（标题绑定率）/
`table_text_rate`（表格文本占比）/ `image_count` / `elapsed_seconds`。
如果 `table_text_rate` 异常高，通常说明表格被当成正文了，可考虑关闭公式/图表识别再试。

对应环境变量见下方 [配置](#配置)。

---

## 设置页（Web 内配置 Key）

界面右上角的 **设置** 把配置收敛到三个分组，保存即写回 `.env` 并**热生效**：

| 分组 | 字段 |
|---|---|
| **语言模型** | Base URL、API Key、模型名、温度、超时 |
| **嵌入模型** | Provider、Base URL、API Key、模型名、维度 |
| **PDF 版面解析** | ppsV3 开关、解释器路径、脚本路径、设备、高精度模式、超时 |

### 保存即生效

保存后服务端执行 `pipeline.reconfigure()`：重读配置、重建 LLM / 嵌入 / 解析客户端、
失效 ppsV3 环境缓存。**不需要重启服务**。

响应里会带上 `needs_reindex` 提示：如果你**换了嵌入模型**（比如从哈希向量换成 bge-m3），
旧向量与新模型不在同一空间，必须重新索引，界面会明确提示——否则检索质量会反常下降。

### 「测试连接」按钮

保存前可以先测。它会发一个 `max_tokens: 1` 的最小请求，并按 HTTP 状态码给中文诊断：

| 状态码 | 提示 |
|---|---|
| 401 / 403 | 鉴权失败——Key 不对或已失效 |
| 402 | 余额不足 |
| 404 | 接口不存在——Base URL 可能少了 `/v1` |
| 429 | 被限流 |

测试请求会绕过系统代理（`ProxyHandler({})`），避免公司代理把请求拦在中途导致的误判。

### 密钥安全

- **只出不进**：接口返回的密钥一律是掩码（`sk-tes****efgh`），真实值从不下行。
- **掩码回传 = 未修改**：前端原样回传掩码会被识别为"这栏没动"，不会用 `sk-ab****yz` 覆盖真实 Key。
- **落盘在 `.env`**：单一配置源，避免界面一套、环境变量一套互相打架。
- 写入走 `mkstemp` + `os.replace` 原子替换；原地更新保留你写的注释。

---

## 作为插件接入另一个智能体

### 方式一：Python SDK（推荐）

把 `sdk/` 拷进你的工程：

```python
from materials_rag_client import MaterialsRagClient

rag = MaterialsRagClient("http://127.0.0.1:8765")

# 握手检查
print(rag.meta()["capabilities"])

# 录入知识（无需文件）
rag.add_text("实验记录 2026-10", "6061 铝合金固溶 530℃ 保温 1h，水淬后 175℃ 人工时效 8h…")

# 检索（只检索不生成）
for chunk in rag.search("铝合金时效强化", top_k=5):
    print(chunk["document_title"], chunk["score"], chunk["content"][:100])

# 问答（带引用）
result = rag.ask("铝合金 T6 和 T7 时效有什么区别？")
print(result["answer"])
for c in result["citations"]:
    print(c["chunk_id"], c["section_title"], c["score"])

# 流式
for delta in rag.ask_stream("钙钛矿为什么稳定性差？"):
    print(delta, end="", flush=True)
```

SDK 只依赖标准库，`python sdk/materials_rag_client.py --ask "…"` 也可直接当命令行用。

### 方式二：Function Calling

`sdk/agent_tools.json` 提供了 6 个工具的完整 schema，直接喂给支持 tool calling 的模型即可：

| 工具 | 用途 |
|---|---|
| `materials_rag_status` | 查能力（LLM 是否接入、嵌入模式、语料规模）——建议会话开始时调一次 |
| `materials_rag_search` | 只检索证据 |
| `materials_rag_ask` | 带引用的问答 |
| `materials_rag_add_text` | 往知识库写文本 |
| `materials_rag_list_documents` | 列文献与处理状态 |
| `materials_rag_get_evidence` | 按 chunk_id 取原文溯源 |

### 方式三：裸 HTTP

```bash
curl -X POST http://127.0.0.1:8765/api/ask \
     -H "Content-Type: application/json" \
     -d '{"question":"高熵合金有哪些强化机制？","top_k":5}'
```

---

## 接口一览

统一响应信封：`{"success": true, "data": ..., "request_id": "..."}`，
失败为 `{"success": false, "error": {"code": "...", "message": "..."}}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/meta` | 服务能力 + 语料统计 + 主题配置 |
| GET | `/api/stats` | 详细统计 |
| GET | `/api/documents` | 文献列表（`?q=&status=&limit=`） |
| POST | `/api/documents/upload` | 上传文件（multipart：`file`/`title`/`source`/`tags`） |
| POST | `/api/documents/text` | 文本入库（`title`/`content`/`source`/`tags`） |
| GET | `/api/documents/{id}` | 文献详情 + 章节树 |
| DELETE | `/api/documents/{id}` | 删除（含向量清理） |
| POST | `/api/documents/{id}/reingest` | 重新解析索引 |
| GET | `/api/documents/{id}/chunks` | 段落列表 |
| GET | `/api/chunks/{chunk_id}` | 段落原文 + 章节上下文 + 相邻块 |
| GET | `/api/jobs/{id}` | 摄入任务进度 |
| GET/POST/PATCH/DELETE | `/api/conversations[/id]` | 会话管理 |
| POST | `/api/conversations/{id}/messages` | 问答（非流式） |
| POST | `/api/conversations/{id}/messages/stream` | 问答（SSE 流式） |
| POST | `/api/search` | **无状态检索**（插件首选） |
| POST | `/api/ask` | **无状态问答**（插件首选） |
| GET | `/api/settings` | 读配置（密钥返回掩码 + `configured` 徽章） |
| PUT | `/api/settings` | 写配置（白名单校验 → 写 `.env` → 热重载） |
| POST | `/api/settings/test` | 测试 LLM / 嵌入端点连通性 |
| POST | `/api/settings/ppsv3/detect` | 探测 ppsV3 运行环境 |

SSE 事件序列：`meta` → `retrieval` → `delta`(多次) → `done`；异常时为 `error`。

### 安全默认

- **CORS 默认同源**：`MSRAG_CORS_ORIGINS` 默认为空，即不放行任何跨域请求。
  因为服务只监听本机，若默认 `*`，**你浏览器访问的任意网页都能静默读走整个知识库**。
  插件的正规接入方式是 SDK / 命令行（服务端调用，不受 CORS 约束），所以同源是安全的默认值。
  确有跨域需求时显式配置：`MSRAG_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`。
- **上传前置限流**：先按 `Content-Length` 判断超限，超了直接 413 且不读 body，避免大 body 占满内存。
- **异常不外泄**：内部异常只在 `debug=True` 时附带 details，客户端永远只拿到 `request_id`。

---

## 配置

复制 `.env.example` 为 `.env`。所有变量都可选：

| 变量 | 默认 | 作用 |
|---|---|---|
| `MSRAG_PORT` | `8765` | 端口 |
| `MSRAG_LLM_API_KEY` | 空 | **留空则用抽取式作答**；填入后升级为生成式 |
| `MSRAG_LLM_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容地址 |
| `MSRAG_LLM_MODEL` | `deepseek-chat` | 模型名 |
| `MSRAG_EMBEDDING_PROVIDER` | `auto` | `auto`/`api`/`local`/`hash` |
| `MSRAG_EMBEDDING_BASE_URL` | SiliconFlow | 嵌入服务地址 |
| `MSRAG_TOP_K` | `6` | 默认证据条数 |
| `MSRAG_BM25_WEIGHT` | `0.35` | 关键词通道占比 |
| `MSRAG_CHUNK_SIZE` / `OVERLAP` | `700` / `120` | 分块 token 预算与重叠 |
| `MSRAG_PARSER_MODE` | `auto` | `auto`/`paddle`/`text` |
| `MSRAG_MAX_UPLOAD_MB` | `50` | 上传上限 |
| `MSRAG_CORS_ORIGINS` | **空** | 跨域白名单，逗号分隔。**空 = 只允许同源**，详见[安全默认](#安全默认) |
| `MSRAG_PPSV3_ENABLED` | `false` | 是否启用 ppsV3 版面解析 |
| `MSRAG_PPSV3_PYTHON` | 空 | 兼容版解释器路径（空 = 自动探测 3.11/3.10/3.9） |
| `MSRAG_PPSV3_SCRIPT` | 空 | `rag.py` 路径，默认用内置 `ppsv3/rag.py` |
| `MSRAG_PPSV3_DEVICE` | `cpu` | 推理设备 |
| `MSRAG_PPSV3_ACCURATE` | `false` | 高精度模式（开启公式/图表识别，更慢） |
| `MSRAG_PPSV3_TIMEOUT` | `900` | 单篇解析超时（秒） |

也兼容 `DEEPSEEK_API_KEY`、`LLM_MODEL`、`OPENAI_API_KEY` 等常见写法，方便直接复用已有环境变量。

> **变更提示**：`MSRAG_LLM_STREAM` 已移除（该配置项读入后从未被使用，属于死配置）。
> 流式由 `/api/conversations/{id}/messages/stream` 这一条路由决定，无需开关。

---

## 常见问题

**Q：没有 API Key 能跑吗？**
能。检索照常工作，生成会降级为"抽取式作答"（摘录证据原文）。界面上有明确标识，不会假装是模型生成的。

**Q：Key 填在哪？一定要改 `.env` 吗？**
不用。界面 **设置** 里填完点保存即可，会写回 `.env` 并立即生效。改 `.env` 也行，两者是同一份配置。

**Q：扫描件 PDF 解析不出文字？**
内置解析器只能提取文本层。安装 `paddleocr` 并把 `.env` 里设为 `MSRAG_PARSER_MODE=paddle` 即可启用 OCR。
若还想保住版面（表格/公式/标题层级），改用 ppsV3，见 [ppsV3 版面解析](#ppsv3-版面解析pdf-增强)。

**Q：ppsV3 检测不到环境？**
先确认解释器是 **3.9–3.11**（PP-StructureV3 不支持 3.12+），再确认 `import paddleocr` 能成功。
常见坑是 OpenCV 装了一半——表现为 `recursion is detected during loading of "cv2"`，
重装即可：`pip uninstall opencv-python opencv-contrib-python && pip install opencv-python`。
探测有 300 秒缓存，改完环境点「检测环境」会强制刷新。

**Q：换了嵌入模型后检索变差了？**
换模型必须重新索引——新旧向量不在同一空间。保存配置时若触发，界面会给出提示，
去文献库对受影响的文献点「重新索引」即可。

**Q：检索结果不够准？**
默认是零依赖哈希向量（词法级）。配置 `MSRAG_EMBEDDING_API_KEY` 换成 bge-m3 这类语义模型后会明显提升。

**Q：端口被占用？**
`python start.py --port 9000`。

**Q：想清空重建？**
`python start.py --reset`。

**Q：能多大规模？**
定位是个人/团队知识库。线性向量扫描在数万段落内仍是毫秒级；装了 numpy 会更快。再大就该换回 Milvus 了。

**Q：并发上传时会不会出问题？**
不会。向量索引的读写由可重入锁串行化，SQLite 的章节/段落替换走单事务（要么整篇进，要么整篇不进）。
压力测试（4 检索线程 + 1 入库线程持续 12 秒）零错误。
