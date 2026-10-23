let token = ''
export let studentId = ''
let data: Record<string, string> = {}
let revision = 0
let queue: Promise<void> = Promise.resolve()
let failure = ''
let generation = 0
const SESSION_KEY = 'mse-agent.session'

export const authHeaders = (): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {}
export async function accountRequest(path: string, body?: unknown, method = 'POST') {
  const res = await fetch(`/api/auth/${path}`, { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '请求失败，请检查输入或后端服务')
  return result
}
export async function signIn(id: string, password: string) {
  const result = await accountRequest('login', { studentId: id, password })
  token = result.token
  try {
    const record = await accountRequest('records', undefined, 'GET')
    studentId = result.studentId; data = record.data; revision = record.revision; failure = ''; generation++
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token, studentId })) } catch { /* ignore */ }
  } catch (err) { token = ''; throw err }
}
export async function restoreSession(): Promise<string> {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return ''
    const saved = JSON.parse(raw) as { token?: string; studentId?: string }
    if (!saved?.token || !saved?.studentId) return ''
    token = saved.token
    const record = await accountRequest('records', undefined, 'GET')
    studentId = saved.studentId; data = record.data; revision = record.revision; failure = ''; generation++
    return studentId
  } catch {
    token = ''
    try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
    return ''
  }
}
export function resetAccount() {
  generation++; token = ''; studentId = ''; data = {}; revision = 0; failure = ''; queue = Promise.resolve()
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
  delete (window as unknown as Record<string, unknown>).__mistakeBookDebug
}
export async function flushAccount() { await queue; if (failure) throw new Error(failure) }
export function exportAccount() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = `learning-${studentId}.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
// Account records never enter shared browser storage. Legacy keys remain untouched.
export const accountStorage = {
  getItem: (key: string) => data[key] ?? null,
  setItem(key: string, value: string) {
    if (!token || data[key] === value) return
    data[key] = value
    const snapshot = { ...data }, current = generation
    window.dispatchEvent(new CustomEvent('account:sync', { detail: '正在保存' }))
    queue = queue.then(async () => {
      if (current !== generation || failure) return
      try {
        const result = await accountRequest('records', { data: snapshot, revision }, 'PUT')
        if (current !== generation) return
        revision = result.revision
        window.dispatchEvent(new CustomEvent('account:sync', { detail: '已保存' }))
      } catch (err) {
        if (current !== generation) return
        failure = err instanceof Error ? err.message : '保存失败'
        window.dispatchEvent(new CustomEvent('account:sync', { detail: failure }))
      }
    })
  },
  removeItem(key: string) { this.setItem(key, '') },
}
