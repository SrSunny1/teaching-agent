import type { Artifact, ArtifactType, FeatureModule } from '../lib/types'
import { isRegisteredArtifact, knownArtifactTypes } from '../lib/registry'
import { IconCollapse, IconExpand, IconPanel } from './icons'

interface Props {
  /** 当前该渲染哪个功能。undefined 表示没有功能接管画布 */
  feature: FeatureModule | undefined
  artifact: Artifact | null
  /** 画布上是不是该功能自带的样例数据（而非 Agent 真实产出） */
  isPreview: boolean
  onClose: () => void
  onSendMessage: (text: string) => void
  onEmitArtifact: (type: ArtifactType, data: unknown) => void
  /** 手动加载当前模块的样例数据（画布空态里的按钮） */
  onLoadPreview: () => void
  /** 画布是否处于全屏（对话栏收起） */
  canvasFull: boolean
  onToggleFullscreen: () => void
}

/**
 * 右栏画布。
 * ★ 这个组件不认识任何具体功能 —— 它只按 artifactType 找到 owner，把 data 丢给它渲染。
 * 新增功能不需要改这里。
 *
 * 画布默认是空的：可视化由对话触发，而不是点进模块就自动加载。
 * 想看模块的样例数据，空态里有个按钮。
 */
export default function ArtifactPanel({
  feature,
  artifact,
  isPreview,
  onClose,
  onSendMessage,
  onEmitArtifact,
  onLoadPreview,
  canvasFull,
  onToggleFullscreen,
}: Props) {
  const title = feature ? feature.title : '画布'
  const hasPreview = Boolean(feature && feature.preview !== undefined && feature.artifactTypes.length > 0)

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
        <button
          className="icon-btn"
          onClick={onToggleFullscreen}
          title={canvasFull ? '退出全屏（Esc）' : '画布全屏 —— 把对话栏收起来，画布占满'}
          style={{ color: canvasFull ? 'var(--accent)' : undefined }}
        >
          {canvasFull ? <IconCollapse /> : <IconExpand />}
        </button>
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
            <div>
              {feature
                ? '在左侧对话里提问，Agent 调到你的工具后，结果会显示在这里'
                : '左栏选一个模块，或直接提问触发'}
            </div>
            {hasPreview && (
              <button
                className="chip"
                style={{ marginTop: 12 }}
                onClick={onLoadPreview}
                title="加载这个模块自带的样例数据，方便看组件效果"
              >
                查看样例数据
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
