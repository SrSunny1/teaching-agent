import { qaSources, retrieveQa } from './qaData'

export function answerFromSources(query: string, offline: boolean) {
  const result = retrieveQa(query)
  if (result.exact) {
    const entry = result.exact
    const sources = entry.sources.map(id => {
      const source = qaSources[id]
      return `> 出处：${source.url ? `[${source.title}](${source.url})` : source.title} · ${source.location}`
    }).join('\n\n')
    return { summary: `本地资料命中：${entry.question}`, content: `${entry.answer}\n\n**易错点：**${entry.difficulty}\n\n${sources}\n\n*本地资料检索结果，未经教师最终审核；非大模型生成或自动识图。*` }
  }
  if (!offline) return null
  const related = result.candidates.map(entry => `- ${entry.question}`).join('\n')
  return {
    summary: '本地资料未直接命中',
    content: '当前资料中没有与这个问题直接对应的答案。后端模型未连接，不能继续生成解释或处理追问。'
      + (related ? `\n\n下面仅为相关问题，不代表已找到原问题的答案：\n${related}` : '\n\n请补充实验四相关问题或向老师核实。')
      + '\n\n*本地资料检索，未调用大模型。*',
  }
}
