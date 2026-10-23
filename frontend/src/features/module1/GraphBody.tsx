import type { GraphNav } from './graphNav'
import KnowledgeGraph from './KnowledgeGraph'
import QuestionGraph from './QuestionGraph'

interface Props {
  nav: GraphNav
  onSend: (text: string) => void
}

/** 图谱视图体：根据当前 tab 渲染知识图谱或问题图谱（画布 / 整页两种外壳共用） */
export default function GraphBody({ nav, onSend }: Props) {
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%' }}>
      {nav.tab === 'knowledge' ? (
        <KnowledgeGraph
          focusId={nav.kFocus}
          onSelectQuestion={nav.jumpToQuestion}
          onSend={onSend}
        />
      ) : (
        <QuestionGraph
          focusId={nav.qFocus}
          onJumpKnowledge={nav.jumpToKnowledge}
          onSend={onSend}
        />
      )}
    </div>
  )
}
