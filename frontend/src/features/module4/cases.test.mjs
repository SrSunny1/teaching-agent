import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8')
    .replace("import.meta.glob('./assets/*.{jpg,png}', { eager: true, query: '?url', import: 'default' })", '{}')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  cache.set(name, exports)
  new Function('require', 'exports', compiled)(id => load(id.replace('./', '')), exports)
  return exports
}

const { cases } = load('cases')
const { additionalCases } = load('additionalCases')
const { forCase, references } = load('knowledge')
const { comparisonDetails, pairFocus } = load('comparisonDetails')
assert.equal(additionalCases.length, 10)
assert.equal(cases.length, 21)
assert.equal(new Set(cases.map(item => item.id)).size, cases.length)
const hashes = new Set()
for (const item of cases) {
  const path = new URL(`./assets/${item.id}.${item.extension ?? 'jpg'}`, import.meta.url)
  assert.ok(existsSync(path), `Missing image: ${item.id}`)
  const bytes = readFileSync(path)
  const signature = bytes.subarray(0, 3).toString('hex')
  assert.ok(['ffd8ff', '89504e'].includes(signature), `Invalid image: ${item.id}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  assert.ok(!hashes.has(hash), `Duplicate image: ${item.id}`)
  hashes.add(hash)
  assert.ok(item.author && item.license && item.conditions && item.question)
  const entries = forCase(item.id)
  assert.ok(entries.length, `Missing knowledge: ${item.id}`)
  for (const entry of entries) for (const id of entry.sourceIds) assert.ok(references[id]?.url, `Missing reference: ${id}`)
  for (const key of ['morphology', 'distribution', 'inspect', 'missing']) assert.ok(comparisonDetails[item.id]?.[key], `Missing ${key}: ${item.id}`)
}
assert.match(pairFocus('bainite', 'martensitic-420'), /TEM/)
assert.equal(pairFocus('duplex', 'austenite'), pairFocus('austenite', 'duplex'))
console.log('Passed: 21 unique image cases, 10 additions, signatures, knowledge, attribution, comparison details')
