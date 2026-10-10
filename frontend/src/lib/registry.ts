/**
 * ★ 自动注册表 —— 消灭「注册表冲突」的关键。
 *
 * 这里用 import.meta.glob 扫描 features/ 下的所有文件夹。
 * 你只要新建 features/<你的功能>/index.ts 并默认导出 FeatureModule，
 * 功能就自动出现在左栏 —— 不需要改这个文件，也不需要改任何公共文件。
 *
 * 详见 协作流程.md 的「三、协作规则」
 */
import type { ArtifactType, FeatureModule } from './types'

const modules = import.meta.glob<{ default: FeatureModule }>('../features/*/index.ts', {
  eager: true,
})

export const features: FeatureModule[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order)

/** artifactType → 负责渲染它的功能组件 */
const byArtifact = new Map<ArtifactType, FeatureModule>()
for (const f of features) {
  for (const t of f.artifactTypes) {
    if (byArtifact.has(t)) {
      console.warn(
        `[registry] artifactType "${t}" 被 "${byArtifact.get(t)!.id}" 和 "${f.id}" 同时注册。` +
          `每个类型只能有一个 owner，见 README.md 的「三、契约」`,
      )
    }
    byArtifact.set(t, f)
  }
}

export function featureByArtifact(type: ArtifactType): FeatureModule | undefined {
  return byArtifact.get(type)
}

export function featureById(id: string): FeatureModule | undefined {
  return features.find((f) => f.id === id)
}

// 开发期自检：把注册结果打到控制台，方便确认自己的功能挂上了
if (import.meta.env.DEV) {
  console.info(
    '[registry] 已注册功能:',
    features.map((f) => `${f.id}(${f.artifactTypes.join(',') || '无画布'})`).join('  '),
  )
}
