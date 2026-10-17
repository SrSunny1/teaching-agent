import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { imageUrl, licenseUrl, sourceUrl, type Micrograph } from './cases'
import { forCase } from './knowledge'
import { comparisonDetails } from './comparisonDetails'
import InteractiveImage from './InteractiveImage'

export default function CaseDialog({ item, ids, onSelect, onClose, children }: {
  item: Micrograph; ids: string[]; onSelect: (id: string) => void; onClose: () => void; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const index = ids.indexOf(item.id)
  const detail = comparisonDetails[item.id]
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); opener?.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<div className="m4" style={{ padding: 0 }}><dialog ref={dialog} className="m4-case-dialog" aria-label="组织图文详情" onCancel={e => { e.preventDefault(); onClose() }}>
    <header className="m4-case-toolbar"><div><span className="sub">{item.group} · {index + 1} / {ids.length}</span><h3 aria-live="polite">{item.title}</h3></div><div className="m4-viewer-tools">
      <button type="button" title="上一个案例" aria-label="上一个案例" disabled={index <= 0} onClick={() => onSelect(ids[index - 1])}>←</button>
      <button type="button" title="下一个案例" aria-label="下一个案例" disabled={index >= ids.length - 1} onClick={() => onSelect(ids[index + 1])}>→</button>
      <button type="button" title="关闭详情" aria-label="关闭详情" onClick={onClose}>×</button>
    </div></header>
    <div className="m4-case-body">
      <figure className="m4-case-image" key={`image-${item.id}`}><InteractiveImage src={imageUrl(item)} title={item.title} /><figcaption>外部补充案例 · 待教师审核 · 显示缩放不代表真实倍率</figcaption></figure>
      <section className="m4-case-copy" key={item.id} aria-label="组织说明">
        <h4>组织介绍</h4>{forCase(item.id).map(entry => <p key={entry.id}>{entry.fact}</p>)}
        <h4>观察特征</h4><p>{detail?.morphology}</p><p>{detail?.distribution}</p>
        <h4>辨析重点</h4><p>{detail?.inspect}</p>
        <h4>课堂追问</h4><p>{item.question}</p>
        <details className="m4-reading"><summary>来源与判断限制</summary><p>{item.conditions}</p><p>{detail?.missing}</p><p>{item.author} · <a href={licenseUrl(item)} target="_blank" rel="noreferrer">{item.license}</a></p><a href={sourceUrl(item)} target="_blank" rel="noreferrer">图片原始说明</a></details>
        {children}
      </section>
    </div>
  </dialog></div>, document.body)
}
