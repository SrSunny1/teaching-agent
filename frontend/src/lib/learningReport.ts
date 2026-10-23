import type { Message } from './types'

export interface ReportConversation { id: string; title: string; messages: Message[] }
export interface Finding { topic: string; evidence: string; comment: string; source: string }
export interface LearningReport {
  generatedAt: string
  conversations: number
  questions: number
  strengths: Finding[]
  weaknesses: Finding[]
  suggestions: string[]
  overview: string
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

/** Only attributed feedback whose quoted answer exists in a preceding user turn is evidence. */
export function buildLearningReport(conversations: ReportConversation[]): LearningReport {
  const strengths: Finding[] = [], weaknesses: Finding[] = []
  const seen = new Set<string>()
  let questions = 0
  for (const conv of conversations) {
    const answers: string[] = []
    for (const message of conv.messages) {
      if (message.role === 'user') { answers.push(message.content); questions++; continue }
      if (message.responseMode !== 'live' || message.streaming) continue
      for (const tool of message.tools ?? []) {
        if (tool.status !== 'ok' || tool.name !== 'feynman_followup') continue
        const args = object(tool.args)
        for (const raw of Array.isArray(args.rounds) ? args.rounds : []) {
          const round = object(raw), answer = text(round.userAnswer)
          if (!answer || !answers.some(a => a.includes(answer))) continue
          for (const item of Array.isArray(round.marks) ? round.marks : []) {
            const mark = object(item), quote = text(mark.quote), note = text(mark.note)
            if (!quote || !note || !answer.includes(quote) || !['good', 'vague', 'jump'].includes(String(mark.kind))) continue
            const key = `${conv.id}|${text(args.concept)}|${answer}|${quote}`
            if (seen.has(key)) continue
            seen.add(key)
            const finding = { topic: text(args.concept) || '概念讲解', evidence: quote, comment: note, source: conv.title }
            ;(mark.kind === 'good' ? strengths : weaknesses).push(finding)
          }
        }
      }
    }
  }
  const suggestions = [...new Set(weaknesses.map(f => `针对「${f.topic}」：结合教材核对“${f.evidence}”这句话，补充概念定义、适用条件和推理依据，再用自己的话完整解释。`))]
  if (!strengths.length && !weaknesses.length) suggestions.push('选择一个已学习的概念，用自己的话回答费曼追问并完成点评，再生成报告；仅凭提问和阅读无法判断掌握程度。')
  else suggestions.push('对已获正向反馈的知识点，尝试换一个材料或情境解释，检查是否能迁移应用。')
  return {
    generatedAt: new Date().toLocaleString('zh-CN'), conversations: conversations.length, questions,
    strengths, weaknesses, suggestions,
    overview: `本报告覆盖选中的 ${conversations.length} 条会话、${questions} 条学生消息。找到 ${strengths.length} 条正向点评及 ${weaknesses.length} 条待加强点评。${strengths.length + weaknesses.length ? '这些结论仅反映所列作答片段，不代表整门课程的掌握水平。' : '目前缺少可核验的作答点评，尚不能判断优势或不足。'}`,
  }
}

export function reportText(report: LearningReport): string {
  const findings = (items: Finding[], fallback: string) => items.length ? items.map(f => `- ${f.topic}：${f.comment}\n  作答：“${f.evidence}”\n  来源会话：${f.source}`).join('\n') : fallback
  return `# 学习评价报告\n\n生成时间：${report.generatedAt}\n\n## 整体学习情况\n${report.overview}\n\n## 表现较好的知识点\n${findings(report.strengths, '证据不足，暂不判断。')}\n\n## 需要加强的具体问题\n${findings(report.weaknesses, '暂无可核验的薄弱点；不等于全部掌握。')}\n\n## 学习建议\n${report.suggestions.map(s => '- ' + s).join('\n')}\n\n评价边界：仅依据所选会话中的真实费曼作答与已有自动点评，不计模拟数据、预览、未完成回复或来源不明的旧记录。未纳入独立练习和错题库。自动点评供学习参考，不是教师认定或正式成绩。\n`
}
