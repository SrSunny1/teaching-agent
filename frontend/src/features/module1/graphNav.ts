import { useEffect, useState } from 'react'
import type { Artifact } from '../../lib/types'

export type GraphTab = 'knowledge' | 'question'

/** 后端 query_graph 推送的 artifact 形状：只带模式与聚焦目标，图谱数据在前端静态维护 */
interface GraphPayload {
  mode?: GraphTab
  focus?: string | null
}

export interface GraphNav {
  tab: GraphTab
  setTab: (t: GraphTab) => void
  kFocus: string | null
  qFocus: string | null
  /** 跳到知识图谱并聚焦某个知识点 */
  jumpToKnowledge: (id: string) => void
  /** 跳到问题图谱并聚焦某道问题 */
  jumpToQuestion: (id: string) => void
}

/**
 * 图谱双视图的导航状态：画布模式（Component）与整页模式（Page）共用，
 * 保证「Agent 调 query_graph → 切视图并聚焦」「问题 ↔ 知识点互跳」两处行为一致。
 */
export function useGraphNav(artifact: Artifact | null): GraphNav {
  const [tab, setTab] = useState<GraphTab>('knowledge')
  const [kFocus, setKFocus] = useState<string | null>(null)
  const [qFocus, setQFocus] = useState<string | null>(null)

  useEffect(() => {
    const data = artifact?.data as GraphPayload | undefined
    if (!data) return
    if (data.mode === 'question') {
      setTab('question')
      setQFocus(data.focus ?? null)
    } else if (data.mode === 'knowledge') {
      setTab('knowledge')
      setKFocus(data.focus ?? null)
    }
  }, [artifact])

  return {
    tab,
    setTab,
    kFocus,
    qFocus,
    jumpToKnowledge: (id) => {
      setTab('knowledge')
      setKFocus(id)
    },
    jumpToQuestion: (id) => {
      setTab('question')
      setQFocus(id)
    },
  }
}
