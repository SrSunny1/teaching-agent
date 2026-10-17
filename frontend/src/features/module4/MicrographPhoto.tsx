import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { imageUrl, licenseUrl, sourceUrl, type Micrograph } from './cases'
import { forCase } from './knowledge'

export default function MicrographPhoto({ item, blind = false }: { item: Micrograph; blind?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [failed, setFailed] = useState(false)
  const title = blind ? '待观察的金相照片' : item.title
  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }) }
  const scale = (value: number) => { const next = Math.max(1, Math.min(4, value)); setZoom(next); if (next === 1) setOffset({ x: 0, y: 0 }) }
  const close = () => dialog.current?.close()
  return <figure className="m4-photo">
    <button ref={opener} type="button" className="m4-image m4-photo-trigger" aria-label={`放大查看${title}`} disabled={failed} onClick={() => { reset(); dialog.current?.showModal() }}>
      {failed ? <span role="status">图片暂不可用</span> : <img src={imageUrl(item)} alt={title} onError={() => setFailed(true)} />}
    </button>
    <figcaption>{!blind && <strong>{item.title}</strong>}<details><summary>图片来源与授权</summary><span>{item.author} · <a href={licenseUrl(item)} target="_blank" rel="noreferrer">{item.license}</a> · 原图未修改</span>{!blind && <p><a href={sourceUrl(item)} target="_blank" rel="noreferrer">来源与原始说明</a></p>}</details></figcaption>
    {createPortal(<div className="m4" style={{ padding: 0 }}><dialog ref={dialog} className="m4-viewer" aria-label={title} onClose={() => { drag.current = null; opener.current?.focus() }}>
      <div className="m4-viewer-toolbar"><strong>{title}</strong><div className="m4-viewer-tools">
        <button type="button" aria-label="缩小" title="缩小" disabled={zoom <= 1} onClick={() => scale(zoom - .5)}>−</button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="放大" title="放大" disabled={zoom >= 4} onClick={() => scale(zoom + .5)}>+</button>
        <button type="button" aria-label="恢复完整图像" title="恢复完整图像" onClick={reset}>↺</button>
        <button type="button" aria-label="关闭大图" title="关闭大图" onClick={close}>×</button>
      </div></div>
      <div className="m4-viewer-stage" tabIndex={0} role="region" aria-label="图像观察区" onKeyDown={e => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && zoom > 1) { e.preventDefault(); setOffset(p => ({ x: p.x + (e.key === 'ArrowLeft' ? 30 : e.key === 'ArrowRight' ? -30 : 0), y: p.y + (e.key === 'ArrowUp' ? 30 : e.key === 'ArrowDown' ? -30 : 0) })) }
      }} onPointerDown={e => { if (zoom <= 1) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, left: offset.x, top: offset.y } }} onPointerMove={e => { if (drag.current) setOffset({ x: drag.current.left + e.clientX - drag.current.x, y: drag.current.top + e.clientY - drag.current.y }) }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <img src={imageUrl(item)} alt={title} draggable={false} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} />
      </div>
      <div className="m4-viewer-note">{!blind && <><strong>组织介绍</strong>{forCase(item.id).map(entry => <p key={entry.id}>{entry.fact}</p>)}<p>观察要点：{item.question}</p><p>判断边界：{item.conditions}</p></>}<p>显示缩放不代表真实倍率；无可靠标定时不可测量。</p></div>
    </dialog></div>, document.body)}
  </figure>
}
