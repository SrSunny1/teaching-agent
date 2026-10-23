/**
 * 画布预览数据：图谱本身是前端静态数据，这里只告诉壳「默认打开知识图谱」。
 * 点左栏「课程图谱」时不带任何聚焦，展示完整的星系图。
 */
export const preview = { mode: 'knowledge' as const, focus: null as string | null }
