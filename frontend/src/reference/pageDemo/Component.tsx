import type { FeatureProps } from '../../lib/types'

/**
 * 画布模式组件。
 *
 * 整页模块其实用不到它（画布不会渲染），但 FeatureModule 要求必须有。
 * 留着它是为了：万一将来这个模块不用整页了，把 index.ts 里的 `page: Page` 删掉，
 * 它就退化成普通的「对话 + 画布」模块，这里是画布上显示的东西。
 */
export default function Component({ artifact }: FeatureProps) {
  return (
    <div className="feat">
      <h3>示例 · 整页模式</h3>
      <div className="sub">这个模块用的是整页模式，请看主区（画布不渲染）</div>
      <div className="box">
        如果你想让它退回画布模式，把 <code>index.ts</code> 里的 <code>page: Page</code> 删掉即可。
      </div>
      {artifact ? <pre className="raw">{JSON.stringify(artifact.data, null, 2)}</pre> : null}
    </div>
  )
}
