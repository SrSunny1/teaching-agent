/**
 * 插件启用开关 —— 与 knowledgeBase 同一套机制，各自独立，互不影响。
 * localStorage 键：plugin.mistakeBook.enabled
 */
const KEY = 'plugin.mistakeBook.enabled'

export function isEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setEnabled(v: boolean): void {
  try {
    if (v) {
      window.localStorage.removeItem(KEY)
    } else {
      window.localStorage.setItem(KEY, '0')
    }
  } catch {
    /* 隐私模式下静默忽略 */
  }
}
