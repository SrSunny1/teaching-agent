/**
 * Mock 演示流。
 *
 * 后端没起来、或没配 API Key 时用它驱动界面，保证「界面永远可演示」。
 * 后端就绪后自动切换为真实流，这个文件不参与线上路径。
 *
 * ⚠️ 这里的是**占位数据**，不是真实检索结果。真实数据由各模块的后端工具下发。
 * 各模块 owner 做完自己的工具后，可以让 mock 少推点东西。
 */
import type { ArtifactType, SSEEvent } from './types'

interface MockScript {
  /** 触发词，命中即用这个脚本 */
  match: RegExp
  events: SSEEvent[]
}

/** FCC 晶胞 —— 与 backend/app/tools/load_structure 的真实计算一致（14 原子 / 36 键 / 21 间隙） */
const FCC = {"structure":"fcc","feature":"cell","atoms":[{"x":0.0,"y":0.0,"z":0.0},{"x":0.0,"y":0.0,"z":1.0},{"x":0.0,"y":1.0,"z":0.0},{"x":0.0,"y":1.0,"z":1.0},{"x":1.0,"y":0.0,"z":0.0},{"x":1.0,"y":0.0,"z":1.0},{"x":1.0,"y":1.0,"z":0.0},{"x":1.0,"y":1.0,"z":1.0},{"x":0.5,"y":0.5,"z":0},{"x":0.5,"y":0.5,"z":1.0},{"x":0.5,"y":0,"z":0.5},{"x":0.5,"y":1.0,"z":0.5},{"x":0,"y":0.5,"z":0.5},{"x":1.0,"y":0.5,"z":0.5}],"bonds":[[0,8],[0,10],[0,12],[1,9],[1,10],[1,12],[2,8],[2,11],[2,12],[3,9],[3,11],[3,12],[4,8],[4,10],[4,13],[5,9],[5,10],[5,13],[6,8],[6,11],[6,13],[7,9],[7,11],[7,13],[8,10],[8,11],[8,12],[8,13],[9,10],[9,11],[9,12],[9,13],[10,12],[10,13],[11,12],[11,13]],"sites":[{"x":0.5,"y":0.0,"z":0.0,"kind":"八面体间隙"},{"x":0.5,"y":0.0,"z":1.0,"kind":"八面体间隙"},{"x":0.5,"y":1.0,"z":0.0,"kind":"八面体间隙"},{"x":0.5,"y":1.0,"z":1.0,"kind":"八面体间隙"},{"x":0.0,"y":0.5,"z":0.0,"kind":"八面体间隙"},{"x":0.0,"y":0.5,"z":1.0,"kind":"八面体间隙"},{"x":1.0,"y":0.5,"z":0.0,"kind":"八面体间隙"},{"x":1.0,"y":0.5,"z":1.0,"kind":"八面体间隙"},{"x":0.0,"y":0.0,"z":0.5,"kind":"八面体间隙"},{"x":0.0,"y":1.0,"z":0.5,"kind":"八面体间隙"},{"x":1.0,"y":0.0,"z":0.5,"kind":"八面体间隙"},{"x":1.0,"y":1.0,"z":0.5,"kind":"八面体间隙"},{"x":0.5,"y":0.5,"z":0.5,"kind":"八面体间隙"},{"x":0.25,"y":0.25,"z":0.25,"kind":"四面体间隙"},{"x":0.25,"y":0.25,"z":0.75,"kind":"四面体间隙"},{"x":0.25,"y":0.75,"z":0.25,"kind":"四面体间隙"},{"x":0.25,"y":0.75,"z":0.75,"kind":"四面体间隙"},{"x":0.75,"y":0.25,"z":0.25,"kind":"四面体间隙"},{"x":0.75,"y":0.25,"z":0.75,"kind":"四面体间隙"},{"x":0.75,"y":0.75,"z":0.25,"kind":"四面体间隙"},{"x":0.75,"y":0.75,"z":0.75,"kind":"四面体间隙"}],"cell":{"a":1.0,"b":1.0,"c":1.0},"stacking":"ABCABC…（密排面 {111}）","params":{"atomsPerCell":4,"coordination":12,"packing":0.74,"nearestNeighbor":0.7071}}

const scripts: MockScript[] = [
  {
    match: /筛分|250\s*目/,
    events: [
      { type: 'thinking', text: '用户问的是筛分的作用，先检索知识库确认教材原文。' },
      {
        type: 'tool_call',
        id: 't1',
        name: 'search_knowledge',
        label: '检索知识库 ·「250目筛分」',
        args: { query: '250目筛分' },
      },
      {
        type: 'tool_result',
        id: 't1',
        summary: '命中 2 条 · 教材实验二 / 任务书模块二',
        detail:
          '《教材》实验二 三、实验内容：\n「采用 250 目标准实验筛进行精细筛分，充分过滤粗颗粒、杂质，仅保留粒径均匀的筛下细粉料。」\n\n《任务书》模块二 材料制备工艺实践：\n「粉碎完成后，采用 250 目标准实验筛进行精细筛分……保障原料粒径统一性。」',
      },
      {
        type: 'token',
        text: '**250 目标准实验筛**的作用是把粉碎后的 SiO₂ 粉料按粒径分级。\n\n',
      },
      { type: 'token', text: '目数指每英寸长度上的筛孔数，250 目对应筛孔孔径约 **58 μm**。\n\n' },
      { type: 'token', text: '它的目的有三个：\n\n' },
      { type: 'token', text: '1. **去除粗颗粒**——未粉碎到位的大颗粒被截留在筛上；\n' },
      { type: 'token', text: '2. **去除杂质**——混入的异物被一并拦截；\n' },
      { type: 'token', text: '3. **保证粒径统一**——筛下细粉料粒径分布收窄。\n\n' },
      { type: 'token', text: '> 出处：《教材》实验二 · 三、实验内容；《任务书》劳育模块二' },
      { type: 'done' },
    ],
  },
  {
    match: /热处理|淬火|回火|45\s*钢/,
    events: [
      { type: 'thinking', text: '用户在问热处理工艺，调用沙盒工具，用教材表20-1 的 45 钢数据。' },
      {
        type: 'tool_call',
        id: 't1',
        name: 'simulate_heat_treatment',
        label: '热处理沙盒 · 水冷 + 200℃ 回火',
        args: { cooling: 'water', temper_temp: 200, carbon: 0.45 },
      },
      {
        type: 'tool_result',
        id: 't1',
        summary: '回火马氏体 · 约 59 HRC',
        detail:
          '回火温度 200 ℃ 落在 150–250 ℃ 低温回火区间，所得组织为回火马氏体。\n参考：《教材》实验二十 二、实验原理。',
      },
      {
        type: 'token',
        text: '45 钢在 **860 ℃ 保温 15–20 min 后水冷**，得到马氏体组织，硬度很高但脆性大。\n\n',
      },
      {
        type: 'token',
        text: '再经 **200 ℃ 回火**，得到**回火马氏体**，硬度约 **57–60 HRC**。\n\n',
      },
      {
        type: 'token',
        text: '回火的目的不是降低硬度，而是**降低回火应力、减少脆性**，同时保住高硬度。\n',
      },
      { type: 'token', text: '> 出处：《教材》实验二十 · 二、实验原理（低温回火）' },
      { type: 'done' },
    ],
  },
  {
    match: /八面体|四面体|间隙/,
    events: [
      { type: 'thinking', text: '用户在问间隙位置，加载晶胞并叠加间隙。' },
      {
        type: 'tool_call',
        id: 't1',
        name: 'load_structure',
        label: '加载晶体结构 · FCC + 间隙',
        args: { structure: 'fcc', feature: 'octahedral' },
      },
      {
        type: 'tool_result',
        id: 't1',
        summary: 'FCC · 八面体间隙 13 个 · 四面体间隙 8 个',
        detail: '数据由后端晶体学计算生成。教材实验一要求标出晶胞中所有八面体和四面体的间隙位置。',
      },
      { type: 'token', text: '**面心立方的间隙位置**：\n\n' },
      {
        type: 'token',
        text: '- **八面体间隙**：12 个棱的中点 + 1 个体心，共 13 个几何位置。由 6 个原子围成。\n',
      },
      {
        type: 'token',
        text: '- **四面体间隙**：位于 (1/4,1/4,1/4) 类位置，共 8 个。由 4 个原子围成。\n\n',
      },
      {
        type: 'token',
        text: '右栏已加载晶胞，点「八面体间隙」/「四面体间隙」可以切换高亮显示。\n\n',
      },
      { type: 'token', text: '> 出处：《教材》实验一 · 三、实验内容' },
      { type: 'artifact', artifactType: 'visual3d', data: FCC },
      { type: 'done' },
    ],
  },
  {
    match: /位错|晶胞|晶体结构|面心|体心|密排|间隙|可视化|3d|3D|配位数|致密度/,
    events: [
      { type: 'thinking', text: '这是晶体结构问题，加载 3D 模型。' },
      {
        type: 'tool_call',
        id: 't1',
        name: 'load_structure',
        label: '加载晶体结构 · 面心立方 (FCC)',
        args: { structure: 'fcc', feature: 'cell' },
      },
      {
        type: 'tool_result',
        id: 't1',
        summary: 'FCC 晶胞 · 4 个原子/晶胞 · 配位数 12',
        detail: '数据由后端晶体学计算模块生成。',
      },
      { type: 'token', text: '**面心立方（FCC）**晶胞的原子位于 8 个顶点和 6 个面心。\n\n' },
      {
        type: 'token',
        text: '每个晶胞实际包含 $8 \\times \\frac{1}{8} + 6 \\times \\frac{1}{2} = 4$ 个原子，',
      },
      { type: 'token', text: '配位数为 12，致密度 0.74。\n\n' },
      {
        type: 'token',
        text: '右侧已加载 3D 模型：可拖动旋转、滚轮缩放；点「八面体间隙」/「四面体间隙」看间隙位置。\n\n',
      },
      { type: 'token', text: '> 出处：《教材》实验一 · 二、实验原理' },
      {
        type: 'artifact',
        artifactType: 'visual3d',
        data: FCC,
      },
      { type: 'done' },
    ],
  },
]

const FALLBACK: SSEEvent[] = [
  { type: 'thinking', text: '（mock 模式）后端未连接，这是一条占位回复。' },
  { type: 'token', text: '当前处于 **mock 演示模式** —— 后端未启动或未配 API Key，界面用占位数据驱动。\n\n' },
  {
    type: 'token',
    text: '启动后端即可获得真实回答：\n\n```bash\ncd backend && uvicorn app.main:app --reload --port 8000\n```\n\n',
  },
  {
    type: 'token',
    text: '可以试着问：**面心立方晶胞**（会加载 3D 模型）、**250 目筛分的作用**、**45 钢淬火后回火**。',
  },
  { type: 'done' },
]

function pick(query: string): SSEEvent[] {
  return scripts.find((s) => s.match.test(query))?.events ?? FALLBACK
}

/** 把脚本按节奏逐条吐出，模拟真实流式。 */
export async function streamMock(
  query: string,
  onEvent: (e: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const events = pick(query)
  for (const e of events) {
    if (signal?.aborted) return
    onEvent(e)
    const delay =
      e.type === 'token' ? 45 : e.type === 'tool_call' ? 320 : e.type === 'tool_result' ? 520 : 180
    await new Promise((r) => setTimeout(r, delay))
  }
}

/** 便捷：给模块 owner 做占位数据用 */
export function mockArtifact(type: ArtifactType, data: unknown): SSEEvent {
  return { type: 'artifact', artifactType: type, data }
}
