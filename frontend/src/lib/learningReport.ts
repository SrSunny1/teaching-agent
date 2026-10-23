import type { Message } from './types'

export interface ReportConversation { id: string; title: string; messages: Message[] }
export interface Finding { topic: string; evidence: string; comment: string; source: string }
export interface TopicAssessment { topic: string; score: number; reason: string; source: string; answers: string[] }
export interface LearningReport {
  assessments: TopicAssessment[]
  referenceScore: number | null
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
  const assessments = new Map<string, TopicAssessment>()
  let questions = 0
  for (const conv of conversations) {
    const answers: string[] = []
    for (const message of conv.messages) {
      if (message.role === 'user') { answers.push(message.content); questions++; continue }
      if (message.responseMode !== 'live' || message.streaming) continue
      for (const tool of message.tools ?? []) {
        if (tool.status !== 'ok' || tool.name !== 'feynman_followup') continue
        const args = object(tool.args)
        const verifiedAnswers = new Set<string>()
        for (const raw of Array.isArray(args.rounds) ? args.rounds : []) {
          const round = object(raw), answer = text(round.userAnswer)
          if (!answer || !answers.some(a => a.includes(answer))) continue
          if (text(round.question) && text(round.critique)) verifiedAnswers.add(answer)
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
        // Cumulative calls replace earlier scores for the same conversation/topic.
        if (verifiedAnswers.size >= 3 && typeof args.score === 'number' && Number.isInteger(args.score)
          && args.score >= 0 && args.score <= 100 && text(args.overall) && text(args.concept)) {
          assessments.set(`${conv.id}|${text(args.concept)}`, {
            topic: text(args.concept), score: args.score, reason: text(args.overall),
            source: conv.title, answers: [...verifiedAnswers],
          })
        }
      }
    }
  }
  const suggestions = [...new Set(weaknesses.map(f => `针对「${f.topic}」：结合教材核对“${f.evidence}”这句话，补充概念定义、适用条件和推理依据，再用自己的话完整解释。`))]
  if (!strengths.length && !weaknesses.length) suggestions.push('选择一个已学习的概念，用自己的话回答费曼追问并完成点评，再生成报告；仅凭提问和阅读无法判断掌握程度。')
  else if (strengths.length) suggestions.push('对已获正向反馈的知识点，尝试换一个材料或情境解释，检查是否能迁移应用。')
  const assessed = [...assessments.values()]
  const topicScores = new Map<string, number[]>()
  for (const item of assessed) topicScores.set(item.topic, [...(topicScores.get(item.topic) ?? []), item.score])
  const means = [...topicScores.values()].map(scores => scores.reduce((a, b) => a + b, 0) / scores.length)
  return {
    assessments: assessed,
    referenceScore: means.length ? Math.round(means.reduce((a, b) => a + b, 0) / means.length) : null,
    generatedAt: new Date().toLocaleString('zh-CN'), conversations: conversations.length, questions,
    strengths, weaknesses, suggestions,
    overview: `本报告覆盖选中的 ${conversations.length} 条会话、${questions} 条学生消息。找到 ${strengths.length} 条正向点评及 ${weaknesses.length} 条待加强点评。${strengths.length + weaknesses.length ? '这些结论仅反映所列作答片段，不代表整门课程的掌握水平。' : '目前缺少可核验的作答点评，尚不能判断优势或不足。'}`,
  }
}

export function reportText(report: LearningReport): string {
  const scoring = `## 已评价知识点参考分\n${report.referenceScore === null ? '暂无法评分；未评价不计为零分。' : `${report.referenceScore} / 100`}\n同一知识点先取会话均值，再对知识点等权平均并四舍五入。仅采用至少三条不同有效作答后的已有模型总评，不代表整门课程能力。理解、应用、表达尚无独立量表数据，不拆分赋分。\n${report.assessments.map(a => `### ${a.topic}：${a.score} / 100\n来源：${a.source}\n${a.reason}\n${a.answers.map(answer => `- 作答：${answer}`).join('\n')}`).join('\n')}\n\n`
  const findings = (items: Finding[], fallback: string) => items.length ? items.map(f => `- ${f.topic}：${f.comment}\n  作答：“${f.evidence}”\n  来源会话：${f.source}`).join('\n') : fallback
  return `# 个人学习评价报告\n\n生成时间：${report.generatedAt}\n\n${scoring}## 整体学习情况\n${report.overview}\n\n## 表现较好的知识点\n${findings(report.strengths, '证据不足，暂不判断。')}\n\n## 需要加强的具体问题\n${findings(report.weaknesses, '暂无可核验的薄弱点；不等于全部掌握。')}\n\n## 学习建议\n${report.suggestions.map(s => '- ' + s).join('\n')}\n\n评价边界：仅依据所选会话中的真实费曼作答与已有自动点评，不计模拟数据、预览、未完成回复或来源不明的旧记录。未纳入独立练习和错题库。自动点评供学习参考，不是教师认定或正式成绩。\n`
}
