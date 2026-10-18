/**
 * 插件启用开关 —— 独立启用/禁用的落地实现。
 *
 * 默认启用；顶栏「插件」开关切换后写入 localStorage，禁用时页面渲染「已禁用」卡片。
 * 模块始终注册（index.ts 不再按开关返回 null），左栏入口保留，可随时一键启用。
 * 不碰壳的任何代码，开关完全属于本插件自己。
 */
const KEY = 'plugin.knowledgeBase.enabled'

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
    /* localStorage 不可用（隐私模式）时静默忽略 */
  }
}
