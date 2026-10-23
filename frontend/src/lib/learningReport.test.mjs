import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const exports = {}
new Function('exports', ts.transpileModule(readFileSync(new URL('./learningReport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
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
