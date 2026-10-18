import { useEffect, useRef, useState } from 'react'
import type { FeatureProps } from '../../lib/types'
import { isEnabled, setEnabled } from './enable'
import { clearRecords, deleteRecord, installDebugApi, loadRecords, saveRecord } from './records'
import { ROOT_CAUSE_KINDS, type MistakeBookArtifact, type MistakeEntry } from './types'

/* ─────────────── 主题 ─────────────── */

/**
 * 白底基调沿用壳的令牌（--bg/--text/--border…），模块只自持一个主题色变量
 * --mb-accent，可在调试面板里换（默认墨金）。隔离而不另起炉灶。
 */
const MB_STYLE = `
.mb-root { font-family: var(--font-sans); font-size: var(--fs-base); color: var(--text); line-height: 1.65; }
.mb-banner {
  background: color-mix(in srgb, var(--mb-accent) 8%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--mb-accent) 30%, var(--border));
  border-radius: var(--r-md); padding: 10px 14px; margin-bottom: 12px;
}
.mb-banner b { color: var(--mb-accent); }
.mb-banner .hint { font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px; }
.mb-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.mb-tab {
  appearance: none; border: none; background: transparent; cursor: pointer; font: inherit;
  font-size: var(--fs-base); color: var(--text-muted); padding: 7px 12px;
  border-bottom: 2px solid transparent;
}
.mb-tab:hover { color: var(--text); }
.mb-tab.on { color: var(--mb-accent); font-weight: 600; border-bottom-color: var(--mb-accent); }
.mb-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.mb-btn {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-sm); font-weight: 600;
  color: var(--mb-accent); background: color-mix(in srgb, var(--mb-accent) 10%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--mb-accent) 35%, var(--border));
  border-radius: var(--r-md); padding: 7px 14px;
}
.mb-btn:hover { background: color-mix(in srgb, var(--mb-accent) 16%, var(--bg-panel)); }
.mb-btn:disabled { opacity: 0.5; cursor: default; }
.mb-btn.plain { color: var(--text-dim); background: var(--bg-elevated); border-color: var(--border); }
.mb-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 12px; }
.mb-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.mb-cat { font-size: var(--fs-xs); color: var(--mb-accent); background: color-mix(in srgb, var(--mb-accent) 10%, transparent); border-radius: 999px; padding: 3px 10px; font-weight: 600; }
.mb-src { font-size: var(--fs-xs); color: var(--text-faint); }
.mb-del { appearance: none; border: none; background: transparent; cursor: pointer; color: var(--text-faint); font-size: var(--fs-xs); }
.mb-del:hover { color: var(--err); }
.mb-step { display: flex; gap: 10px; padding: 9px 0; border-top: 1px dashed var(--border-soft); }
.mb-step:first-of-type { border-top: none; }
.mb-no {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; margin-top: 1px;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--fs-xs); font-weight: 700; color: var(--mb-accent);
  background: color-mix(in srgb, var(--mb-accent) 12%, transparent);
}
.mb-step h4 { margin: 1px 0 4px; font-size: var(--fs-sm); color: var(--text-dim); font-weight: 600; }
.mb-step .body { white-space: pre-wrap; word-break: break-word; }
.mb-step .body.err { color: var(--err); background: var(--err-soft); border-radius: var(--r-sm); padding: 7px 10px; display: inline-block; }
.mb-step .body.right { color: var(--ok); background: var(--ok-soft); border-radius: var(--r-sm); padding: 7px 10px; display: inline-block; }
.mb-kind { display: inline-block; font-size: var(--fs-xs); color: var(--warn); background: var(--warn-soft); border-radius: 999px; padding: 2px 9px; margin-bottom: 4px; font-weight: 600; }
.mb-refs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.mb-refs span { font-size: var(--fs-xs); color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; }
.mb-tip { margin: 3px 0; padding-left: 10px; border-left: 2px solid color-mix(in srgb, var(--mb-accent) 45%, transparent); font-size: var(--fs-sm); }
.mb-cand { background: var(--bg-elevated); border: 1px solid var(--border-soft); border-radius: var(--r-sm); padding: 9px 11px; margin-bottom: 8px; font-size: var(--fs-sm); }
.mb-cand .meta { font-size: var(--fs-xs); color: var(--text-faint); margin-bottom: 3px; }
.mb-form label { display: block; font-size: var(--fs-sm); color: var(--text-dim); margin: 10px 0 4px; }
.mb-form label b { color: var(--err); font-weight: 400; }
.mb-form input, .mb-form textarea, .mb-form select {
  width: 100%; box-sizing: border-box; font: inherit; font-size: var(--fs-base); color: var(--text);
  background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--r-sm);
  padding: 8px 10px; outline: none; resize: vertical;
}
.mb-form input:focus, .mb-form textarea:focus, .mb-form select:focus { border-color: var(--mb-accent); }
.mb-form .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mb-pre { background: var(--bg-input); border: 1px solid var(--border); font-family: var(--font-mono); font-size: var(--fs-xs); border-radius: var(--r-md); padding: 12px; overflow: auto; max-height: 380px; line-height: 1.6; color: var(--text-dim); }
.mb-swatches { display: flex; gap: 8px; }
.mb-swatch { width: 26px; height: 26px; border-radius: 999px; cursor: pointer; border: 2px solid transparent; }
.mb-swatch.on { border-color: var(--text); }
.mb-cats { display: flex; flex-wrap: wrap; gap: 6px; }
.mb-catbtn {
  appearance: none; cursor: pointer; font: inherit; font-size: var(--fs-sm);
  color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 999px; padding: 4px 12px;
}
.mb-catbtn:hover { color: var(--mb-accent); border-color: var(--mb-accent); }
.mb-note { font-size: var(--fs-sm); color: var(--text-muted); margin: 8px 0 14px; }
`

/** 可选主题色（模块内部独立配置，不外溢） */
const ACCENTS = [
  { name: '墨金', v: '#a4761f' },
  { name: '青灰', v: '#5b7a8c' },
  { name: '朱砂', v: '#a84a3c' },
  { name: '松绿', v: '#4a7d55' },
]
const ACCENT_KEY = 'plugin.mistakeBook.accent'

/** 作业帮式六段拆解的段标题 */
const STEPS = ['原题展示', '学生错误答案', '错误根因分析', '知识点溯源', '正确解答', '避坑总结'] as const

const EMPTY_FORM = {
  category: '',
  question: '',
  studentAnswer: '',
  rootCauseKind: '概念混淆',
  rootCause: '',
  knowledgePoint: '',
  knowledgeRefs: '',
  correctAnswer: '',
  reminders: '',
}

function EntryCard({ e, onDelete }: { e: MistakeEntry; onDelete?: () => void }) {
  return (
    <div className="mb-card">
      <div className="mb-card-head">
        <span className="mb-cat">{e.category}</span>
        <span className="mb-src">
          {e.source ?? '内置题库'}
          {e.createdAt ? ` · ${e.createdAt}` : ''}
        </span>
        {onDelete && (
          <button className="mb-del" onClick={onDelete} title="删除本地记录">
            删除
          </button>
        )}
      </div>

      <div className="mb-step">
        <span className="mb-no">1</span>
        <div>
          <h4>{STEPS[0]}</h4>
          <div className="body">{e.question}</div>
        </div>
      </div>
      <div className="mb-step">
        <span className="mb-no">2</span>
        <div>
          <h4>{STEPS[1]}</h4>
          <div className="body err">{e.studentAnswer}</div>
        </div>
      </div>
      <div className="mb-step">
        <span className="mb-no">3</span>
        <div>
          <h4>{STEPS[2]}</h4>
          <span className="mb-kind">{e.rootCauseKind}</span>
          <div className="body">{e.rootCause || '（待补全）'}</div>
        </div>
      </div>
      <div className="mb-step">
        <span className="mb-no">4</span>
        <div>
          <h4>{STEPS[3]}</h4>
          <div className="body">{e.knowledgePoint || '（待补全）'}</div>
          {e.knowledgeRefs && e.knowledgeRefs.length > 0 && (
            <div className="mb-refs">
              {e.knowledgeRefs.map((r, i) => (
                <span key={i}>{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mb-step">
        <span className="mb-no">5</span>
        <div>
          <h4>{STEPS[4]}</h4>
          <div className="body right">{e.correctAnswer || '（待补全）'}</div>
        </div>
      </div>
      <div className="mb-step">
        <span className="mb-no">6</span>
        <div>
          <h4>{STEPS[5]}</h4>
          {e.reminders.length > 0 ? (
            e.reminders.map((r, i) => (
              <div className="mb-tip" key={i}>
                {r}
              </div>
            ))
          ) : (
            <div className="body" style={{ color: 'var(--text-faint)' }}>
              （待补全）
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 【材料科学错题集】画布 —— 与费曼学习法、3D 可视化同位阶的独立画布插件。
 *
 * 数据两条路：
 *  - Agent 通道：抽题/浏览/解析/知识库出题 → 后端 mistake_book 工具 → artifact 进画布；
 *  - 本地通道：手动录入表单 → onEmitArtifact 推画布 + localStorage 持久化。
 * 画布独立开合，不影响其他模块；window.__mistakeBookDebug 提供调试接口。
 */
export function Component({ artifact, onSendMessage, onEmitArtifact, busy }: FeatureProps) {
  const data = (artifact?.artifactType === 'mistakeBook' ? artifact.data : null) as MistakeBookArtifact | null

  const [tab, setTab] = useState<'entries' | 'form' | 'bank' | 'debug'>('entries')
  const [records, setRecords] = useState<MistakeEntry[]>(() => loadRecords())
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formErr, setFormErr] = useState('')
  const [selfTest, setSelfTest] = useState<string>('')
  const [accent, setAccent] = useState<string>(() => localStorage.getItem(ACCENT_KEY) || ACCENTS[0].v)
  const [topic, setTopic] = useState('')
  // 启用状态：禁用时画布渲染「已禁用」卡片，左栏入口保留
  const [enabled, setEnabledState] = useState(isEnabled)
  const recordsRef = useRef(records)
  recordsRef.current = records

  // 调试接口（挂一次）+ 本地记录跨组件同步
  useEffect(() => {
    installDebugApi(() => recordsRef.current)
    const onChanged = () => setRecords(loadRecords())
    window.addEventListener('mistakeBook:changed', onChanged)
    return () => window.removeEventListener('mistakeBook:changed', onChanged)
  }, [])

  // 画布展示的条目：artifact 在前（最新对话产物），本地记录在后，按 id 去重
  const artifactEntries = data?.entries ?? []
  const seen = new Set(artifactEntries.map((e) => e.id))
  const merged = [...artifactEntries, ...records.filter((e) => !seen.has(e.id))]

  const submit = () => {
    const entry: MistakeEntry = {
      id: `m-${Date.now()}`,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: '手动录入',
      category: form.category.trim() || '未分类',
      question: form.question.trim(),
      studentAnswer: form.studentAnswer.trim(),
      rootCauseKind: form.rootCauseKind,
      rootCause: form.rootCause.trim(),
      knowledgePoint: form.knowledgePoint.trim(),
      knowledgeRefs: form.knowledgeRefs
        .split(/[；;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      correctAnswer: form.correctAnswer.trim(),
      reminders: form.reminders
        .split(/[；;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }
    if (!entry.question || !entry.studentAnswer) {
      setFormErr('题目原文和学生错误作答是必填项，其余可以先留空后补全。')
      return
    }
    setFormErr('')
    saveRecord(entry)
    setRecords(loadRecords())
    onEmitArtifact('mistakeBook', { mode: 'record', entries: [entry], total: 1, note: '手动录入' })
    setForm({ ...EMPTY_FORM })
    setTab('entries')
  }

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    setEnabledState(next)
  }

  // 禁用视图放在所有 hooks 之后（保证 hooks 顺序一致），入口不丢，可一键启用
  if (!enabled) {
    return (
      <div className="mb-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{MB_STYLE}</style>
        <div style={{ textAlign: 'center', padding: '30px 34px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', maxWidth: 420 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 'var(--fs-lg)' }}>插件已禁用</h2>
          <p style={{ margin: '6px 0', color: 'var(--text-dim)', fontSize: 'var(--fs-sm)', lineHeight: 1.8 }}>
            「材料科学错题集」当前处于关闭状态，启用后即可继续错题诊断与订正练习。
          </p>
          <button
            style={{ appearance: 'none', cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 'var(--r-md)', padding: '7px 16px', marginTop: 8 }}
            onClick={toggleEnabled}
          >
            启用插件
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-root" style={{ ['--mb-accent' as string]: accent }}>
      <style>{MB_STYLE}</style>

      {/* 板块身份标识 */}
      <div className="mb-banner">
        <b>本模块为【材料科学错题集画布插件】</b>
        <div className="hint">用于学生错题诊断、错误溯源、订正指导 · 交互范式：原题 → 错误作答 → 根因 → 溯源 → 正解 → 避坑</div>
      </div>

      <div className="mb-tabs">
        <button className={`mb-tab ${tab === 'entries' ? 'on' : ''}`} onClick={() => setTab('entries')}>
          错题拆解{merged.length > 0 ? ` (${merged.length})` : ''}
        </button>
        <button className={`mb-tab ${tab === 'form' ? 'on' : ''}`} onClick={() => setTab('form')}>
          录入错题
        </button>
        <button className={`mb-tab ${tab === 'bank' ? 'on' : ''}`} onClick={() => setTab('bank')}>
          题库浏览
        </button>
        <button className={`mb-tab ${tab === 'debug' ? 'on' : ''}`} onClick={() => setTab('debug')}>
          调试
        </button>
      </div>

      {/* ── 错题拆解 ── */}
      {tab === 'entries' && (
        <>
          <div className="mb-toolbar">
            <button className="mb-btn" disabled={busy} onClick={() => onSendMessage('请从材料科学错题库中随机抽 1 条错题，完成五件套拆解后推送进错题集画布。')}>
              抽一道错题
            </button>
            <button className="mb-btn plain" disabled={busy} onClick={() => onSendMessage('请列出材料科学错题库的全部条目，推送进错题集画布。')}>
              浏览全部题库
            </button>
          </div>
          {data?.note && <div className="mb-note">{data.note}</div>}
          {merged.length === 0 ? (
            <div className="mb-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              画布还是空的。可以「抽一道错题」让 Agent 从题库拆一条，或在对话里贴出你的错题让 Agent 解析，
              也可以到「录入错题」手动添加。
            </div>
          ) : (
            merged.map((e) => (
              <EntryCard
                key={e.id}
                e={e}
                onDelete={e.id.startsWith('m-') ? () => { deleteRecord(e.id); setRecords(loadRecords()) } : undefined}
              />
            ))
          )}
          {data?.mode === 'extract' && data.candidates && data.candidates.length > 0 && (
            <div className="mb-card">
              <div className="mb-card-head">
                <span className="mb-cat">知识库出题素材</span>
              </div>
              {data.candidates.map((c, i) => (
                <div className="mb-cand" key={i}>
                  <div className="meta">
                    《{c.source}》{c.experiment} · {c.section} · 相关度 {c.score}
                  </div>
                  <div>{c.text.slice(0, 220)}{c.text.length > 220 ? '…' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── 录入错题 ── */}
      {tab === 'form' && (
        <div className="mb-card mb-form">
          <div className="row">
            <div>
              <label>分类</label>
              <input value={form.category} placeholder="如：热处理 / 晶体学 / 相图" onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label>错误根源类型</label>
              <select value={form.rootCauseKind} onChange={(e) => setForm({ ...form, rootCauseKind: e.target.value })}>
                {ROOT_CAUSE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label>
            题目原文 <b>*</b>
          </label>
          <textarea rows={3} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          <label>
            学生典型错误作答 <b>*</b>
          </label>
          <textarea rows={2} value={form.studentAnswer} onChange={(e) => setForm({ ...form, studentAnswer: e.target.value })} />
          <label>错误根源说明</label>
          <textarea rows={2} value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} />
          <div className="row">
            <div>
              <label>知识点</label>
              <input value={form.knowledgePoint} onChange={(e) => setForm({ ...form, knowledgePoint: e.target.value })} />
            </div>
            <div>
              <label>出处（分号分隔多条）</label>
              <input value={form.knowledgeRefs} placeholder="《教材》实验二十 · 金属材料的热处理" onChange={(e) => setForm({ ...form, knowledgeRefs: e.target.value })} />
            </div>
          </div>
          <label>标准正确解答</label>
          <textarea rows={3} value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })} />
          <label>同类易错提醒（每行一条）</label>
          <textarea rows={2} value={form.reminders} onChange={(e) => setForm({ ...form, reminders: e.target.value })} />
          {formErr && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-sm)', marginTop: 8 }}>{formErr}</div>}
          <div className="mb-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="mb-btn" onClick={submit}>
              存入错题集并推上画布
            </button>
            <button className="mb-btn plain" onClick={() => { setForm({ ...EMPTY_FORM }); setFormErr('') }}>
              清空
            </button>
          </div>
        </div>
      )}

      {/* ── 题库浏览 ── */}
      {tab === 'bank' && (
        <>
          <div className="mb-note">
            内置错题库 16 条（大纲预存方向 + 扩充高频易错点），存于后端 mistake_book/bank.py。
            点分类让 Agent 抽题；也可以直接给主题，从知识库原文出题。
          </div>
          <div className="mb-toolbar">
            <input
              value={topic}
              placeholder="主题，如：回火 / 马氏体 / 250目筛分"
              style={{
                flex: 1,
                minWidth: 200,
                font: 'inherit',
                fontSize: 'var(--fs-base)',
                color: 'var(--text)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '7px 12px',
                outline: 'none',
              }}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button
              className="mb-btn"
              disabled={busy || !topic.trim()}
              onClick={() => {
                const t = topic.trim()
                setTab('entries')
                onSendMessage(`请从知识库检索「${t}」相关原文作为出题素材，出 1 道材料科学错题，按五件套（题目、错误作答、根因、正解、避坑提醒）完成拆解并推送进错题集画布。`)
              }}
            >
              从知识库出题
            </button>
          </div>
          <div className="mb-cats">
            {['晶体学', '晶体缺陷', '扩散', '相图', '相变', '热处理', '凝固与结晶', '金属材料', '材料力学性能', '陶瓷材料', '高分子材料', '金相实验'].map((c) => (
              <button
                key={c}
                className="mb-catbtn"
                disabled={busy}
                onClick={() => {
                  setTab('entries')
                  onSendMessage(`请从错题库按分类「${c}」抽取 1 条错题，推送进错题集画布。`)
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── 调试 ── */}
      {tab === 'debug' && (
        <>
          <div className="mb-card">
            <div className="mb-card-head">
              <span className="mb-cat">调试接口</span>
            </div>
            <div className="mb-note" style={{ margin: '0 0 8px' }}>
              控制台 <code>window.__mistakeBookDebug</code>：dump() 导出全部本地错题 · add(entry) 直接塞条目测渲染 ·
              clear() 清空 · selfTest() 存储与校验链路自检。
            </div>
            <div className="mb-toolbar" style={{ marginBottom: 0 }}>
              <button className="mb-btn plain" onClick={() => setSelfTest(JSON.stringify((window as unknown as { __mistakeBookDebug: { selfTest: () => unknown } }).__mistakeBookDebug.selfTest(), null, 2))}>
                运行自检
              </button>
              <button
                className="mb-btn plain"
                disabled={busy}
                onClick={() => {
                  // 模拟一条解析输出，测画布渲染链路（不经后端）
                  onEmitArtifact('mistakeBook', {
                    mode: 'record',
                    total: 1,
                    note: '调试：模拟解析输出',
                    entries: [
                      {
                        id: `debug-${Date.now()}`,
                        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
                        source: '调试模拟',
                        category: '晶体学',
                        question: '面心立方结构的致密度是多少？',
                        studentAnswer: '0.68，每个晶胞 2 个原子。',
                        rootCauseKind: '概念混淆',
                        rootCause: '把 BCC 的致密度与原子数搬到了 FCC 上。',
                        knowledgePoint: 'FCC 与 BCC 的晶胞参数',
                        knowledgeRefs: ['《教材》实验一 · 晶体结构与晶体缺陷'],
                        correctAnswer: 'FCC 致密度 0.74、配位数 12、每晶胞 4 个原子；BCC 才是 0.68 / 8 / 2。',
                        reminders: ['FCC=0.74/12/4，BCC=0.68/8/2，成对记忆'],
                      },
                    ],
                  })
                  setTab('entries')
                }}
              >
                模拟一条解析输出
              </button>
              <button className="mb-btn plain" onClick={() => { clearRecords(); setRecords(loadRecords()) }}>
                清空本地记录
              </button>
            </div>
            {selfTest && <pre className="mb-pre" style={{ marginTop: 10 }}>{selfTest}</pre>}
          </div>

          <div className="mb-card">
            <div className="mb-card-head">
              <span className="mb-cat">模块主题色</span>
            </div>
            <div className="mb-swatches">
              {ACCENTS.map((a) => (
                <span
                  key={a.v}
                  className={`mb-swatch ${accent === a.v ? 'on' : ''}`}
                  style={{ background: a.v }}
                  title={a.name}
                  onClick={() => {
                    setAccent(a.v)
                    try {
                      localStorage.setItem(ACCENT_KEY, a.v)
                    } catch { /* 忽略 */ }
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mb-card">
            <div className="mb-card-head">
              <span className="mb-cat">插件开关</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--fs-sm)', color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={toggleEnabled}
              />
              启用「材料科学错题集」插件（关闭后画布显示禁用提示，左栏入口保留，随时可再启用）
            </label>
          </div>

          <div className="mb-card">
            <div className="mb-card-head">
              <span className="mb-cat">最近一次产物原始数据</span>
            </div>
            <pre className="mb-pre">{data ? JSON.stringify(data, null, 2) : '（暂无产物；预览数据在左栏点击模块时可看到）'}</pre>
          </div>
        </>
      )}
    </div>
  )
}
