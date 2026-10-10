import type { Artifact, ArtifactType, FeatureModule } from '../lib/types'
import { isRegisteredArtifact, knownArtifactTypes } from '../lib/registry'
import { IconPanel } from './icons'

interface Props {
  /** 当前该渲染哪个功能。undefined 表示没有功能接管画布 */
  feature: FeatureModule | undefined
  artifact: Artifact | null
  /** 画布上是不是该功能自带的样例数据（而非 Agent 真实产出） */
  isPreview: boolean
  onClose: () => void
  onSendMessage: (text: string) => void
  onEmitArtifact: (type: ArtifactType, data: unknown) => void
}

/**
 * 右栏画布。
 * ★ 这个组件不认识任何具体功能 —— 它只按 artifactType 找到 owner，把 data 丢给它渲染。
 * 新增功能不需要改这里。
 */
export default function ArtifactPanel({
  feature,
  artifact,
  isPreview,
  onClose,
  onSendMessage,
  onEmitArtifact,
}: Props) {
  const title = feature ? feature.title : '画布'

  return (
    <aside className="artifact">
      <div className="artifact-head">
        <span className="artifact-title">{title}</span>
        {isPreview && (
          <span className="preview-badge" title="当前展示的是该功能自带的样例数据，不是 Agent 的真实产出">
            预览数据
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={onClose} title="收起画布">
          <IconPanel />
        </button>
      </div>

      <div className="artifact-body">
        {feature ? (
          <feature.Component
            artifact={artifact}
            onSendMessage={onSendMessage}
            onEmitArtifact={onEmitArtifact}
          />
        ) : artifact && !isRegisteredArtifact(artifact.artifactType) ? (
          // 后端推来了一个没人认领的类型 —— 通常是模块刚被删掉/改名，而后端还在发。
          // 这里明确报出来，比白屏强：模块换来换去的时候这条提示很有用。
          <div className="artifact-empty">
            <div style={{ color: 'var(--warn)', marginBottom: 6 }}>
              没有功能认领 artifactType「{artifact.artifactType}」
            </div>
            <div style={{ fontSize: 'var(--fs-xs)' }}>
              当前已认领的类型：{knownArtifactTypes().join('、') || '（无）'}
            </div>
          </div>
        ) : (
          <div className="artifact-empty">
            <div style={{ opacity: 0.5, marginBottom: 4 }}>
              <IconPanel size={22} />
            </div>
            <div>左栏选一个功能模块，或直接提问触发</div>
          </div>
        )}
      </div>
    </aside>
  )
}
