import type { MistakeEntry } from './types'

/**
 * 本地错题记录的持久化 + 调试接口。
 *
 * 手动录入与对话解析的错题都会存进 localStorage（上限 100 条），
 * 关掉画布再打开不丢。后端题库数据不在这里 —— 题库的唯一真相源是
 * backend/app/tools/mistake_book/bank.py。
 */
import { accountStorage } from '../../lib/account'
const KEY = 'plugin.mistakeBook.records'
const MAX = 100

export function loadRecords(): MistakeEntry[] {
  try {
    const raw = accountStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveRecord(entry: MistakeEntry): void {
  try {
    const list = loadRecords().filter((e) => e.id !== entry.id)
    list.unshift(entry)
    accountStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* 存不下就存不下吧，画布当次会话仍然可见 */
  }
}

export function deleteRecord(id: string): void {
  try {
    accountStorage.setItem(KEY, JSON.stringify(loadRecords().filter((e) => e.id !== id)))
  } catch {
    /* 忽略 */
  }
}

export function clearRecords(): void {
  try {
    accountStorage.removeItem(KEY)
  } catch {
    /* 忽略 */
  }
}

/** 校验一条错题的五件套是否齐全，返回缺失项列表（调试面板用） */
export function validateEntry(e: MistakeEntry): string[] {
  const missing: string[] = []
  if (!e.question?.trim()) missing.push('题目原文')
  if (!e.studentAnswer?.trim()) missing.push('学生典型错误作答')
  if (!e.rootCause?.trim()) missing.push('错误根源')
  if (!e.correctAnswer?.trim()) missing.push('标准正确解答')
  if (!e.reminders?.length) missing.push('同类易错提醒')
  return missing
}

/**
 * ★ 预留调试接口：控制台里 window.__mistakeBookDebug
 *   dump()          —— 导出全部本地错题
 *   add(entry)      —— 直接塞一条错题进画布（跳过表单，测渲染用）
 *   clear()         —— 清空本地记录
 *   selfTest()      —— 存储/校验链路自检，返回逐项结果
 */
export function installDebugApi(getEntries: () => MistakeEntry[]) {
  const w = window as unknown as { __mistakeBookDebug?: Record<string, unknown> }
  w.__mistakeBookDebug = {
    dump: () => getEntries(),
    add: (entry: MistakeEntry) => {
      saveRecord(entry)
      window.dispatchEvent(new CustomEvent('mistakeBook:changed'))
    },
    clear: () => {
      clearRecords()
      window.dispatchEvent(new CustomEvent('mistakeBook:changed'))
    },
    selfTest: () => {
      const probe: MistakeEntry = {
        id: 'debug-probe',
        category: '调试',
        question: '探针题干',
        studentAnswer: '探针错误作答',
        rootCauseKind: '其他',
        rootCause: '探针根因',
        correctAnswer: '探针正解',
        reminders: ['探针提醒'],
      }
      const results: Record<string, unknown> = {}
      try {
        saveRecord(probe)
        results.storageWrite = true
        results.recordsAfterWrite = loadRecords().length
        results.validateOk = validateEntry(probe).length === 0
        deleteRecord('debug-probe')
        results.storageClean = loadRecords().every((e) => e.id !== 'debug-probe')
      } catch (exc) {
        results.error = String(exc)
      }
      return results
    },
  }
}
