/**
 * Mock 演示流。
 *
 * 后端没起来时用它驱动界面，保证「界面永远可演示」。
 * 后端就绪后自动切换为真实流，这个文件不参与线上路径。
 *
 * 注意：这不是最终数据，只是让壳能跑起来的占位。
 * 各功能 owner 请在后端工具里给出真实数据。
 */
import type { ArtifactType, SSEEvent } from './types'

interface MockScript {
  /** 触发词，命中即用这个脚本 */
  match: RegExp
  events: SSEEvent[]
}

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
      { type: 'token', text: '**250 目标准实验筛**的作用是把粉碎后的 SiO₂ 粉料按粒径分级。\n\n' },
      { type: 'token', text: '目数指每英寸长度上的筛孔数，250 目对应筛孔孔径约 **58 μm**。\n\n' },
      { type: 'token', text: '它的目的有三个：\n\n' },
      { type: 'token', text: '1. **去除粗颗粒**——未粉碎到位的大颗粒被截留在筛上；\n' },
      { type: 'token', text: '2. **去除杂质**——混入的异物被一并拦截；\n' },
      { type: 'token', text: '3. **保证粒径统一**——筛下细粉料粒径分布收窄。\n\n' },
      { type: 'token', text: '粒径统一直接影响后续固相反应的**反应速率与产物均匀性**：粉料越细越均匀，' },
      { type: 'token', text: '颗粒间接触面积越大，扩散路径越短，800 ℃ 保温 5 h 的预烧结才能充分完成脱水与除晶型预处理。\n\n' },
      { type: 'token', text: '> 出处：《教材》实验二 · 三、实验内容；《任务书》劳育模块二' },
      {
        type: 'artifact',
        artifactType: 'knowledge',
        data: {
          query: '250目筛分',
          chunks: [
            {
              source: '教材',
              experiment: '实验二 凝固与结晶',
              section: '实验内容',
              text: '采用 250 目标准实验筛进行精细筛分，充分过滤粗颗粒、杂质，仅保留粒径均匀的筛下细粉料，保障原料粒径统一性。',
            },
            {
              source: '任务书',
              experiment: '劳育模块二 材料制备工艺实践',
              section: '实验内容',
              text: '粉碎完成后，采用 250 目标准实验筛进行精细筛分，充分过滤粗颗粒、杂质，仅保留粒径均匀的筛下细粉料，保障原料粒径统一性。',
            },
          ],
          terms: [
            {
              zh: '250 目标准实验筛',
              en: '250-mesh standard test sieve',
              definition: '目数指每英寸长度上的筛孔数，250 目对应筛孔孔径约 58 μm。',
              refs: ['《教材》实验二 · 三、实验内容'],
            },
          ],
        },
      },
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
        summary: '回火马氏体 · 约 58 HRC',
        detail: '回火温度 200 ℃ 落在 150–250 ℃ 低温回火区间，所得组织为回火马氏体。\n参考：《教材》实验二十 二、实验原理。',
      },
      { type: 'token', text: '45 钢在 **860 ℃ 保温 15–20 min 后水冷**，得到马氏体组织，硬度很高但脆性大。\n\n' },
      { type: 'token', text: '再经 **200 ℃ 回火**，得到**回火马氏体**，硬度约 **57–60 HRC**。\n\n' },
      { type: 'token', text: '回火的目的不是降低硬度，而是**降低回火应力、减少脆性**，同时保住高硬度。\n' },
      { type: 'token', text: '这也是切削工具、量具、滚动轴承钢的典型工艺。\n\n' },
      { type: 'token', text: '> 出处：《教材》实验二十 · 二、实验原理（低温回火）' },
      {
        type: 'artifact',
        artifactType: 'heatTreatment',
        data: {
          cooling: 'water',
          temperTemp: 200,
          carbon: 0.45,
          structure: '回火马氏体',
          hardnessHrc: 59,
          curve: [
            [150, 60],
            [200, 59],
            [250, 57],
            [300, 52],
            [350, 48],
            [400, 44],
            [450, 42],
            [500, 40],
            [550, 30],
            [600, 25],
          ],
          diagnosis: '低温回火区间（150–250℃）：保持高硬度，用于切削工具、量具、轴承。',
          warning: null,
        },
      },
      { type: 'done' },
    ],
  },
  {
    match: /位错|晶胞|晶体结构|面心|体心|密排/,
    events: [
      { type: 'thinking', text: '这是晶体结构问题，加载 3D 模型。' },
      {
        type: 'tool_call',
        id: 't1',
        name: 'load_structure',
        label: '加载晶体结构 · 面心立方 (FCC)',
        args: { structure: 'fcc', feature: 'cell' },
      },
      { type: 'tool_result', id: 't1', summary: 'FCC 晶胞 · 4 个原子/晶胞 · 配位数 12', detail: '数据由后端晶体学计算模块生成。' },
      { type: 'token', text: '**面心立方（FCC）**晶胞的原子位于 8 个顶点和 6 个面心。\n\n' },
      { type: 'token', text: '每个晶胞实际包含 $8 \\times \\frac{1}{8} + 6 \\times \\frac{1}{2} = 4$ 个原子，' },
      { type: 'token', text: '配位数为 12，致密度 0.74。\n\n' },
      { type: 'token', text: '右侧已加载 3D 模型，你可以旋转查看，也可以切换到四面体/八面体间隙视图。\n\n' },
      { type: 'token', text: '> 出处：《教材》实验一 · 二、实验原理' },
      { type: 'artifact', artifactType: 'structure3d', data: { structure: 'fcc', feature: 'cell' } },
      { type: 'done' },
    ],
  },
]

const FALLBACK: SSEEvent[] = [
  { type: 'thinking', text: '（mock 模式）后端未连接，这是一条占位回复。' },
  { type: 'token', text: '当前处于 **mock 演示模式** —— 后端未启动，界面用占位数据驱动。\n\n' },
  { type: 'token', text: '启动后端后即可获得真实回答：\n\n' },
  { type: 'token', text: '```bash\ncd backend && uvicorn app.main:app --reload --port 8000\n```\n\n' },
  { type: 'token', text: '可以试着问我：**250 目筛分的作用**、**45 钢淬火后回火**、**面心立方晶胞**。' },
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

/** 便捷：给功能 owner 做占位数据用 */
export function mockArtifact(type: ArtifactType, data: unknown): SSEEvent {
  return { type: 'artifact', artifactType: type, data }
}
