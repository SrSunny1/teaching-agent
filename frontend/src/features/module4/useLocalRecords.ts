import { useState } from 'react'

export function useLocalRecords(key: string) {
  const [error, setError] = useState('')
  const [records, setRecords] = useState<Record<string, string>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
      return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string'))
    } catch { return {} }
  })
  const update = (changes: Record<string, string>) => {
    const next = { ...records, ...changes }
    setRecords(next)
    try { localStorage.setItem(key, JSON.stringify(next)); setError('') }
    catch { setError('浏览器无法保存，本次记录仅在当前页面保留。') }
  }
  return { records, update, error }
}
