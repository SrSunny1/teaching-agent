import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const exports = {}
new Function('exports', ts.transpileModule(readFileSync(new URL('./learningReport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports)
const { buildLearningReport, reportText } = exports
const answer = { id: 'u', role: 'user', content: '珠光体由两相组成' }
const feedback = { id: 'a', role: 'assistant', content: '', responseMode: 'live', tools: [{ status: 'ok', name: 'feynman_followup', args: { concept: '珠光体', rounds: [{ userAnswer: answer.content, marks: [{ quote: '两相', kind: 'good', note: '区分了相与组织。' }, { quote: '珠光体', kind: 'vague', note: '还需说明两相的名称。' }] }] } }] }
const conv = messages => [{ id: 'c', title: '学习记录', messages }]
assert.equal(buildLearningReport([]).questions, 0)
assert.equal(buildLearningReport(conv([answer])).weaknesses.length, 0)
for (const responseMode of ['mock', undefined]) assert.equal(buildLearningReport(conv([answer, { ...feedback, responseMode }])).strengths.length, 0)
assert.equal(buildLearningReport(conv([feedback])).strengths.length, 0)
assert.equal(buildLearningReport(conv([answer, { ...feedback, streaming: true }])).strengths.length, 0)
const r = buildLearningReport(conv([answer, feedback, feedback]))
assert.equal(r.strengths.length, 1)
assert.equal(r.weaknesses.length, 1)
assert.ok(reportText(r).includes('不是教师认定或正式成绩'))
console.log('Passed: scope, provenance, quotation matching, deduplication and export')
const responses = ['第一条独立作答', '第二条独立作答', '第三条独立作答']
const users = responses.map(content => ({ ...answer, content }))
const scored = score => ({ ...feedback, tools: [{ status: 'ok', name: 'feynman_followup', args: {
  concept: '珠光体', score, overall: '概念准确，应用尚需加强。',
  rounds: responses.map(userAnswer => ({ question: '请解释', userAnswer, critique: '已点评' })),
} }] })
assert.equal(buildLearningReport(conv(users)).referenceScore, null)
assert.equal(buildLearningReport(conv([...users, scored(80), scored(90)])).referenceScore, 90)
assert.equal(buildLearningReport(conv([...users.slice(0, 2), scored(80)])).referenceScore, null)
for (const score of [-1, 101, NaN, '80', true, 80.5]) {
  assert.equal(buildLearningReport(conv([...users, scored(score)])).referenceScore, null)
}
assert.equal(buildLearningReport(conv([...users, { ...scored(80), responseMode: 'mock' }])).referenceScore, null)
assert.ok(reportText(buildLearningReport(conv([...users, scored(80)]))).includes('80 / 100'))
console.log('Passed: score eligibility, range, provenance, replacement and export')
