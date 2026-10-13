# 材料物理实验教学 Agent

教学类竞赛作品。知识边界为「材料科学基础实验教材 7 个实验 + 劳动教育四大模块」，
界面是 DeepSeek Harness / Codex 风格的三栏工作台。

**两个文档，各管一头：**

| 文档 | 管什么 | 谁看 |
|---|---|---|
| **README.md**（本文件） | 项目本身：怎么跑、模块是什么、契约、**怎么写一个模块**、环境坑 | 全员 |
| **[协作流程.md](协作流程.md)** | 怎么一起干：仓库怎么建、谁能改什么、每天做什么、什么时候找人 | 全员 |
| **[项目结构.md](项目结构.md)** | **每个文件夹/文件干什么用的** —— 找东西看这里 | 全员 |

> **模块会换，方法不会。** 第四节是通用的「怎么写一个模块」，不绑定任何具体模块 ——
> 复制里面的**指令模板**，填上你自己的模块信息，丢给 Codex 即可。

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
cd frontend && npm run dev
```

点左栏模块 → 进这个模块**自己的对话** → 画布默认是空的（可视化由对话触发）。
想看模块自带的样例数据，画布空态里点「查看样例数据」。

### ★ 界面在哪个端口？看 Vite 启动时打印的那行

**默认 5173，但被别的项目占了就自动换端口。** 以终端里 Vite 实际打印的为准：

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/     ← 就是这个
```

| 地址 | 是什么 |
|---|---|
| **Vite 打印的 Local 地址** | **★ 界面在这里** |
| http://localhost:8000 | 后端 API，只返回一段说明 JSON，**不是界面** |
| http://localhost:8000/docs | 接口文档，可交互调试 |

> ⚠️ **常见误区：打开 5173 却看到别的项目。**
> 如果本机同时跑着别的前端（用 `ps aux | grep vite` 查），Vite 会自动换到 5174、5175…
> 你以为在看教学 agent，其实看的是别的项目 —— 症状就是「模块点不动」。
> **对照 Vite 启动时打印的 Local 地址**，别照着 README 写死的数字敲。

后端没启动、或没配 Key 时，前端自动进 **mock 模式**，界面照样能点（预设脚本驱动）。

自检（**提交前必跑**）：

```bash
# 边界检查，10 秒，无依赖
python scripts/check-boundaries.py

# 数值模型 + Agent 循环 + 自动注册（要装过后端依赖）
# Windows：backend\.venv\Scripts\python backend\tests\test_smoke.py
# 其他：  python3 backend/tests/test_smoke.py

# 检索质量：验证「知识库内的能命中、库外的能拒绝」
# 改了检索逻辑、术语表或知识库内容后必跑
cd backend && python tests/retrieval_probe.py
```

---

## 二、模块归谁

> **模块会换。** 这份名单是当前的方案，随时可能调整。
> 加/删模块用脚手架，**不用手搓、不用改公共文件**：
>
> ```bash
> python scripts/module.py list                    # 看现在有哪些
> python scripts/module.py new <名> --title "显示名" --artifact <类型> [--tool <工具名>]
> python scripts/module.py rm <名>                 # 连前后端一起删
> ```

左栏顺序由各 `index.ts` 的 `order` 字段控制。

**当前 6 个模块：**`visual3d` / `feynman` 已定名并由 SrSunny1 负责；模块 1~4 是编号占位，名字待定。
（原模块 5、6 已删除。）

| # | 模块 | artifactType | 前端 | 负责人 |
|---|---|---|---|---|
| 1 | 模块 1（名字待定） | `module1` | `features/module1/` | A |
| 2 | 模块 2（名字待定） | `module2` | `features/module2/` | A |
| 3 | 模块 3（名字待定） | `module3` | `features/module3/` | B |
| 4 | 模块 4（名字待定） | `module4` | `features/module4/` | B |
| — | **3D 可视化** | `visual3d` | `features/visual3d/` | **SrSunny1** |
| — | **费曼追问** | `feynman` | `features/feynman/` | **SrSunny1** |
| — | **框架（壳）** | — | `src/shell/`、`src/lib/` | **SrSunny1** |

> 📌 **名字定了之后要改三处**：各 `features/<名>/AGENTS.md` 的「模块名」行、
> `CODEOWNERS` 的路径、根 `AGENTS.md` 的任务书索引表。
> 用 `python scripts/module.py list` 随时核对当前状态。

> ⚠️ **框架必须由一个人独占**（现在是 SrSunny1，同时兼做 visual3d / feynman）。
> `CODEOWNERS` 里的 `@A` `@B` 还是代号 —— 它只在**开 PR 时**才会用到，我们基本不开 PR（直接推 main），所以不急。
> `@C`、`@D` 暂无模块（原模块 5、6 已删除）。

> **参考实现**：热处理工艺沙盒在 `frontend/src/reference/heatTreatment/`（重构前的版本），
> 是全项目的组件样板 —— 抄它的结构，但不需要恢复它。

---

## 三、契约（Agent ↔ 壳 的唯一接口）

### Artifact 协议

后端通过 SSE 推 `{artifactType, data}`，壳查表找到注册该类型的组件，把 `data` 原样丢给它渲染。
**所以新增功能不需要改壳一行代码。**

每个 `features/<名>/index.ts` 默认导出：

```ts
export default {
  id: 'feynman',                   // 必须等于文件夹名
  title: '费曼追问',                 // 左栏显示名
  artifactTypes: ['feynman'],       // 全局唯一，见下表
  order: 80,                       // 左栏排序
  preview,                         // 样例数据，在 preview.ts
  Component,
} satisfies FeatureModule
```

组件收到 `{artifact, onSendMessage, onEmitArtifact}`。
**组件内不要自己发网络请求** —— 需要数据就调 `onSendMessage()` 让 Agent 去调工具。

### artifactType 与数据形状

**artifactType 是每个模块自己定的字符串，全局唯一即可。** `ArtifactType` 类型就是 `string`，
**故意不做成联合类型**——模块会换，写死名字会导致每换一个模块都要改 `types.ts` 这个共享文件。

**JSON 字段一律 camelCase。**

| artifactType | 模块 | 数据形状 |
|---|---|---|
| `visual3d` | 3D 可视化 | `{structure, feature, atoms: [{x,y,z}], bonds: [[i,j]], sites, cell, stacking, params}` |
| `feynman` | 费曼追问 | `{concept, rounds: [{question, userAnswer, critique}], score}` |
| `module1`~`module4` | 模块 1~4（名字待定） | 【待填 —— 在各任务书的「数据形状」一节写】 |

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

## 四、怎么写一个模块

> 这一节不绑定任何具体模块 —— 模块会换，方法不会。当前有哪些模块：
> `python scripts/module.py list`

### 1. 模块由什么组成

| 文件 | 作用 | 必须吗 |
|---|---|---|
| `frontend/src/features/<名>/index.ts` | 注册：id / 标题 / artifactType / 排序 / preview | ✅ |
| `frontend/src/features/<名>/Component.tsx` | 画布渲染组件 | ✅ |
| `frontend/src/features/<名>/preview.ts` | 样例数据 —— 让你不用后端就能看到效果 | ✅ |
| `backend/app/tools/<工具名>/__init__.py` | 后端工具，导出 `TOOL` | 需要后端计算时 |
| 其他（`model.ts` / 子组件 / hooks） | 你自己的地盘，随便加 | ❌ |

**用脚手架生成，不要手搓**：

```bash
python scripts/module.py new <名> --title "显示名" --artifact <类型> [--tool <工具名>]
```

### 2. 数据是怎么流动的

```
   用户提问
      │
      ▼
   Agent（后端 chat.py）判断该调哪个工具
      │
      ▼
   你的工具 run() 执行  ──► ToolResult(summary, detail, artifact_type, artifact)
      │                                              │
      │  summary/detail 进对话流                      │ artifact 走 SSE 事件
      ▼                                              ▼
   对话里出现一张工具卡片                      壳按 artifactType 找到你的组件
   （折叠态显示 summary，展开看 detail）              │
                                                     ▼
                                          你的 Component 拿到 artifact.data 渲染
```

**两条关键约定**：

- **组件里不要自己发网络请求。** 需要数据就调 `onSendMessage()` 让 Agent 去调工具 ——
  这样所有可视化走同一条链路，录屏时也好看（评委能看到 Agent 真的在工作）。
- **`artifact_type` 必须等于你前端注册的某个类型**，否则画布会说「没有功能认领」。

### 3. 组件怎么写

收到三个 props：`artifact`（当前产物，可能为 null）、`onSendMessage`、`onEmitArtifact`。

```
   1. 从 props.artifact?.data 读数据（null 就是还没数据，显示空态）
   2. 本地交互即时反馈 —— 拖滑杆、切视图这类不要发网络请求
   3. 需要 Agent 干活时调 props.onSendMessage('...')
   4. 要把新状态推回画布时调 props.onEmitArtifact('你的类型', {...})
```

**`frontend/src/reference/heatTreatment/` 是全项目的样板**（本地交互 + 内联 SVG 绘图 + 数值模型 + 注释），
动手前先读它。样式优先用 `tokens.css` 里已有的类（`.feat` / `.kv` / `.box` / `.chip`），
要自定义就在组件里写内联样式，**不要改 `tokens.css`**（那是框架负责人的文件）。

### 4. 给 Agent 的指令模板

**复制下面整段，把 `<尖括号>` 里的换成你自己的，丢给 Codex 或任何编码 agent。**

```
你是「材料物理实验教学 Agent」项目的开发者。只负责一个模块：<模块名>。

【铁律】
只改 frontend/src/features/<模块文件夹>/ 和 backend/app/tools/<工具名>/。
绝不改 src/shell/、src/styles/、src/lib/、backend/app/chat.py、events.py、AGENTS.md。
不要装新依赖（three / @react-three/fiber / @antv/g6 / katex 已装好）。
JSON 字段一律 camelCase。

【模块职责】
<这个模块解决什么教学问题？学生用它做什么？对应教材哪个实验？>

【数据形状】artifactType 是 `<类型名>`
<把你的数据 JSON 形状写出来，例如：
{a: string, b: [{c: number, d: string}], warning: string|null}
字段尽量具体，agent 不知道形状就只能瞎猜。>

【当前状态】
<现在有什么、缺什么。例如：
- 前端 Component.tsx 是脚手架占位，只把 JSON 打印出来
- 后端工具已能产出 artifact，但 xxx 字段恒为空
- 参考实现在 `frontend/src/reference/heatTreatment/`>

【要做的】
1. <具体步骤，带文件路径>
2. <...>
3. <...>

【验收】
- 左栏点自己的模块 → 能看到 preview.ts 的样例数据渲染出来
- 对话里提问 → 能触发我的工具 → 画布显示真实结果（「预览数据」标签消失）
- 不越界：python scripts/check-boundaries.py 全绿
- <这个模块特有的、可检验的验收点，例如数值必须落在教材某区间>

【完成后】群里喊「<模块名>可以点了」。
```

### 5. 写好这段指令的要点

- **`【当前状态】`是最值钱的一节。** agent 最大的浪费是"重写已经存在的东西"或
  "猜一个错的数据形状"。把现状讲清楚，它就不会跑偏。
- **`【数据形状】`不能省。** 哪怕只是先写个大概，也比让它自己编强 ——
  前后端字段对不上一律 camelCase + 大小写，是最常见的联调事故。
- **验收要可执行。** 写「能渲染」没用，写「左栏点进去能看到 X」才有用。
- **数值类模块加一句**：数值必须有教材依据，教材没写就标注「教材未涉及」，不许编。
- **做完让它** `python scripts/check-boundaries.py`，报红先修再交付。

### 6. 交付前的自检

```bash
python scripts/module.py list              # 确认自己的模块在列表里
python scripts/check-boundaries.py         # 越界/重名/命名不符，10 秒
```

改了后端数值模型或 `chat.py` 的话再加跑 `backend/tests/test_smoke.py`。

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

**6. `setup.ps1` / `start.ps1` 必须以「UTF-8 with BOM」保存**

双击 `setup.bat` 报「表达式或语句中包含意外的标记」就是这个原因。
Windows PowerShell 5.1 在**没有 BOM** 时按 GBK 解码 `.ps1`，中文注释变乱码，
乱码字节里出现引号/花括号 → 语法被撑破。

**改了这两个文件之后**（用 VS Code 看右下角，编码必须是 `UTF-8 with BOM`），跑一下自查：

```powershell
powershell.exe -Command "$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('setup.ps1',[ref]$null,[ref]$e);$e"
```

没有任何输出 = 语法正常。`.bat` 文件则相反：**必须是纯 ASCII**（cmd.exe 不认 BOM）。
