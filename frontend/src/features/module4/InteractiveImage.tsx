import { useEffect, useRef, useState } from 'react'

export default function InteractiveImage({ src, title }: { src: string; title: string }) {
  const stage = useRef<HTMLDivElement>(null)
  const transform = useRef({ zoom: 1, x: 0, y: 0 })
  const [view, setView] = useState(transform.current)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const update = (zoom: number, x: number, y: number) => {
    const bounds = stage.current?.getBoundingClientRect()
    zoom = Math.max(1, Math.min(6, zoom))
    const limitX = (bounds?.width ?? 0) * (zoom - 1) / 2
    const limitY = (bounds?.height ?? 0) * (zoom - 1) / 2
    transform.current = { zoom, x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) }
    setView(transform.current)
  }
  const scale = (factor: number, x = 0, y = 0) => {
    const old = transform.current
    const zoom = Math.max(1, Math.min(6, old.zoom * factor))
    const ratio = zoom / old.zoom
    update(zoom, x - (x - old.x) * ratio, y - (y - old.y) * ratio)
  }
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      scale(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .003), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    const resize = new ResizeObserver(() => { const v = transform.current; update(v.zoom, v.x, v.y) })
    resize.observe(element)
    return () => { element.removeEventListener('wheel', wheel); resize.disconnect() }
  }, [])
  return <div className="m4-interactive-image">
    <div className="m4-viewer-tools m4-image-controls">
      <button type="button" aria-label="缩小图片" title="缩小图片" disabled={view.zoom <= 1} onClick={() => scale(1 / 1.25)}>−</button>
      <output aria-live="polite">{Math.round(view.zoom * 100)}%</output>
      <button type="button" aria-label="放大图片" title="放大图片" disabled={view.zoom >= 6} onClick={() => scale(1.25)}>+</button>
      <button type="button" aria-label="复位图片" title="复位图片" onClick={() => update(1, 0, 0)}>↺</button>
    </div>
    <div ref={stage} className="m4-pan-stage" role="region" aria-label={`${title}可缩放图像`} tabIndex={0}
      style={{ cursor: view.zoom > 1 ? 'grab' : 'zoom-in' }}
      onDoubleClick={() => update(1, 0, 0)}
      onKeyDown={event => {
        const v = transform.current
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) event.preventDefault()
        if (event.key === '+' || event.key === '=') scale(1.25)
        if (event.key === '-') scale(1 / 1.25)
        if (event.key === '0') update(1, 0, 0)
        if (event.key.startsWith('Arrow')) update(v.zoom, v.x + (event.key === 'ArrowLeft' ? 30 : event.key === 'ArrowRight' ? -30 : 0), v.y + (event.key === 'ArrowUp' ? 30 : event.key === 'ArrowDown' ? -30 : 0))
      }}
      onPointerDown={event => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }) }}
      onPointerMove={event => {
        if (!pointers.current.has(event.pointerId)) return
        const before = [...pointers.current.values()]
        const previous = pointers.current.get(event.pointerId)!
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const after = [...pointers.current.values()]
        if (before.length === 2) {
          const distance = (p: typeof before) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
          const rect = event.currentTarget.getBoundingClientRect()
          const cx = (before[0].x + before[1].x) / 2
          const cy = (before[0].y + before[1].y) / 2
          if (distance(before) > 0) scale(distance(after) / distance(before), cx - rect.left - rect.width / 2, cy - rect.top - rect.height / 2)
          const v = transform.current
          update(v.zoom, v.x + (after[0].x + after[1].x) / 2 - cx, v.y + (after[0].y + after[1].y) / 2 - cy)
        } else if (before.length === 1) {
          const v = transform.current
          update(v.zoom, v.x + event.clientX - previous.x, v.y + event.clientY - previous.y)
        }
      }}
      onPointerUp={event => pointers.current.delete(event.pointerId)} onPointerCancel={event => pointers.current.delete(event.pointerId)} onLostPointerCapture={event => pointers.current.delete(event.pointerId)}>
      <img src={src} alt={title} draggable={false} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} />
    </div>
  </div>
}
