import { Fragment, useEffect, useState } from 'react'
import { LEGS, fmtDate, fmtDuration, fmtKm, gmapsUrl, legLabel, legNo, stepLeg, type TripLeg } from '../lib/legs'

type Props = {
  hoveredId: number | null
  selectedId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}

const mouseOnly = (fn: () => void) => (e: React.PointerEvent) => { if (e.pointerType === 'mouse') fn() }

// Arrow keys only browse (focus → highlight); Enter/Space on the focused connector selects.
const KEYS: Record<string, (cur: number) => number> = {
  ArrowRight: c => stepLeg(c, 1),
  ArrowLeft: c => stepLeg(c, -1),
  Home: () => 1,
  End: () => LEGS.length,
}

/** A city "station" ring. Decorative: the cities are in the connectors' names. Labels alternate above/below. */
function Node({ name, i }: { name: string; i: number }) {
  return (
    <span aria-hidden="true" className="node pointer-events-none relative size-3 shrink-0 rounded-full border-2 border-light bg-navy">
      <span className={`absolute left-1/2 -translate-x-1/2 text-[11px] leading-4 tracking-[0.08em] whitespace-nowrap text-muted uppercase ${i % 2 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
        {name}
      </span>
    </span>
  )
}

export function Ribbon({ hoveredId, selectedId, onHover, onSelect }: Props) {
  // The toolbar's single tab stop: the last focused connector; a new selection (card Prev/Next, map click) moves it there.
  const [stop, setStop] = useState<number | null>(null)
  const [prevSelected, setPrevSelected] = useState(selectedId)
  if (selectedId !== prevSelected) { setPrevSelected(selectedId); if (selectedId !== null) setStop(selectedId) }
  useEffect(() => {
    if (selectedId !== null) document.getElementById(`leg-${selectedId}`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selectedId])

  function onKeyDown(e: React.KeyboardEvent) {
    const cur = Number((e.target as HTMLElement).dataset.leg)
    const to = KEYS[e.key]
    if (!cur || !to) return
    e.preventDefault()
    document.getElementById(`leg-${to(cur)}`)?.focus()
  }

  const dim = hoveredId !== null // hover only: a selection dims the map lanes, not the controls (they must stay ≥3:1)
  return (
    <div
      id="ribbon"
      role="toolbar"
      aria-label={`Itinerary: ${LEGS.length} legs, out and back on the same roads`}
      onKeyDown={onKeyDown}
      className="touch-pan-x overflow-x-auto overscroll-x-contain bg-linear-to-t from-navy via-navy/85 to-transparent px-4 pt-4 pb-4 motion-safe:scroll-smooth"
    >
      <div className="flex min-w-[62rem] items-center">
        <Node name={LEGS[0].fromCity.name} i={0} />
        {LEGS.map((leg, i) => {
          const selected = leg.id === selectedId
          const lit = selected || leg.id === hoveredId
          return (
            <Fragment key={leg.id}>
              <button
                id={`leg-${leg.id}`}
                data-leg={leg.id}
                type="button"
                aria-expanded={selected}
                aria-label={legLabel(leg)}
                tabIndex={leg.id === (stop ?? selectedId ?? 1) ? 0 : -1}
                data-lit={lit || undefined}
                data-dim={(dim && !lit) || undefined}
                style={{ flex: `${leg.km} 1 0px`, '--c': leg.color } as React.CSSProperties} // width ∝ km, floor 44 px (min-w-11)
                onPointerEnter={mouseOnly(() => onHover(leg.id))}
                onPointerLeave={mouseOnly(() => onHover(null))}
                onFocus={e => { setStop(leg.id); if (e.target.matches(':focus-visible')) onHover(leg.id) }}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(selected ? null : leg.id)}
                className="group flex h-11 min-w-11 cursor-pointer items-center px-0.5 transition-opacity duration-200 data-dim:opacity-30"
              >
                <span className="block h-1.5 w-full rounded-full bg-(--c) opacity-80 forced-color-adjust-none transition-[height,opacity,box-shadow] duration-200 group-data-lit:h-2 group-data-lit:opacity-100 group-data-lit:shadow-[0_0_12px_var(--c)] group-aria-expanded:h-2.5 group-aria-expanded:shadow-[0_0_0_2px_var(--color-navy),0_0_0_4px_var(--c),0_0_14px_var(--c)] motion-reduce:transition-none" />
              </button>
              <Node name={leg.toCity.name} i={i + 1} />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

export function MapsLink({ leg, className = '' }: { leg: TripLeg; className?: string }) {
  return (
    <a
      href={gmapsUrl(leg)}
      target="_blank"
      rel="noopener"
      className={`${className} inline-flex min-h-11 items-center gap-2 rounded-full bg-light px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-white`}
    >
      Open in Google Maps
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 3h7v7M13 3 4 12" />
      </svg>
    </a>
  )
}

const ROUND = 'grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 text-lg hover:border-white/40'

export function LegCard({ leg, onSelect, onClose }: { leg: TripLeg; onSelect: (id: number) => void; onClose: () => void }) {
  const date = fmtDate(leg.date)
  return (
    <section
      id="card"
      aria-label="Selected leg"
      style={{ '--c': leg.color } as React.CSSProperties}
      className="relative mx-4 mb-2 max-h-[calc(100dvh-6rem)] max-w-[480px] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 border-l-4 border-l-(--c) bg-navy/75 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[opacity,translate] duration-300 portrait:max-h-[42dvh] landscape:w-[min(360px,52vw)] landscape:self-end starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
    >
      <button type="button" onClick={onClose} aria-label="Close, show whole trip" className="absolute top-3 right-3 grid size-11 cursor-pointer place-items-center rounded-full text-muted hover:text-light">
        ✕
      </button>
      <p className="text-xs text-muted tabular-nums">Leg {legNo(leg.id)} of {LEGS.length}</p>
      <h2 className="pr-10 font-display text-xl leading-tight">
        {leg.fromCity.name} <span aria-hidden="true">→</span><span className="sr-only">to</span> {leg.toCity.name}
      </h2>
      <p className="mt-1 font-display text-3xl leading-tight tabular-nums">{fmtKm(leg.km)}</p>
      <p className="text-sm tabular-nums">
        {fmtDuration(leg.min)} of driving{leg.border?.external && <span className="text-muted"> + border wait</span>}
      </p>
      <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {date && (<><dt className="text-muted">Date</dt><dd>{date}</dd></>)}
        <dt className="text-muted">Border</dt>
        <dd>
          {leg.border ? (
            <>
              {leg.border.name}, {leg.border.from} → {leg.border.to}
              {leg.border.external && <span className="block text-amber">EU external border, expect a queue</span>}
            </>
          ) : (
            <span className="text-muted">None, {leg.fromCity.country} only</span>
          )}
        </dd>
        {leg.via.length > 0 && (<><dt className="text-muted">Via</dt><dd>{leg.via.map(v => v.name.split(',')[0]).join(', ')}</dd></>)}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onSelect(stepLeg(leg.id, -1))} aria-label="Previous leg" className={ROUND}>‹</button>
        <button type="button" onClick={() => onSelect(stepLeg(leg.id, 1))} aria-label="Next leg" className={ROUND}>›</button>
        <MapsLink leg={leg} />
      </div>
    </section>
  )
}
