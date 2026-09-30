import { useEffect, useRef } from 'react'
import { BACK, KM_SO_FAR, LEGS, TOTALS, dayOf, fmtDate, fmtDuration, fmtKm, legNo, type TripLeg } from '../lib/legs'
import { MapsLink } from './Itinerary'

type Props = {
  hoveredId: number | null
  selectedId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
  still: boolean
  onToggleStill: () => void
}

const mouseOnly = (fn: () => void) => (e: React.PointerEvent) => { if (e.pointerType === 'mouse') fn() }
const GLASS = 'border border-white/10 bg-navy/75 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl'
const HOURS = Math.round(TOTALS.min / 60)

function TripHeader({ title: T = 'h1' }: { title?: 'h1' | 'h2' }) {
  return (
    <div className="px-6 pt-6 pb-4">
      <T className="font-display text-3xl leading-none font-semibold tracking-tight lg:text-[2.5rem]">New Year 2027</T>
      <p className="mt-2 text-[15px] text-muted">A winter road trip from Kyiv to Prague and Wrocław, and home again.</p>
      <p className="mt-4 font-display text-xl leading-snug">
        {fmtKm(TOTALS.km)} through {TOTALS.cities} cities in {TOTALS.countries} countries, about {HOURS} hours at the wheel, in {LEGS.length} legs.
      </p>
      {TOTALS.datesPending && <p className="mt-2 text-sm text-muted">Dates to be confirmed.</p>}
    </div>
  )
}

const To = () => (<><span aria-hidden="true">→</span><span className="sr-only">to</span></>)

type RowProps = { leg: TripLeg; lit: boolean; selected: boolean; expandable: boolean } & Pick<Props, 'onHover' | 'onSelect'>

function Row({ leg, lit, selected, expandable, onHover, onSelect }: RowProps) {
  const b = leg.border
  const date = fmtDate(leg.date)
  return (
    <li
      id={`row-${leg.id}`}
      data-leg={leg.id} // TripMap's mouseout keeps the hover when the pointer lands on a [data-leg]
      style={{ '--c': leg.color } as React.CSSProperties}
      onPointerEnter={mouseOnly(() => onHover(leg.id))}
      onPointerLeave={mouseOnly(() => onHover(null))}
      className={`rounded-xl transition-colors ${lit ? 'bg-white/[0.06]' : ''} ${!expandable && selected ? 'shadow-[inset_3px_0_0_var(--c)]' : ''}`}
    >
      <button
        type="button"
        aria-expanded={expandable ? selected : undefined}
        aria-current={!expandable && selected ? 'true' : undefined}
        onClick={() => onSelect(expandable && selected ? null : leg.id)} // only the sidebar's disclosure toggles; a sheet row always selects
        onFocus={e => { if (e.target.matches(':focus-visible')) onHover(leg.id) }}
        onBlur={() => onHover(null)}
        className="grid w-full cursor-pointer grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 rounded-xl px-2 py-3 text-left"
      >
        <span className="text-xs font-medium text-muted tabular-nums">{legNo(leg.id)}</span>
        <span className="min-w-0">
          <span className="flex items-start gap-2 font-medium">
            <span className="mt-2.5 h-1 w-4 shrink-0 rounded-full bg-(--c)" />
            <span>{leg.fromCity.name} <To /> {leg.toCity.name}</span>
          </span>
          <span className="mt-0.5 block pl-6 text-xs text-muted">
            Day {dayOf(leg)}{date && `, ${date}`} ·{' '}
            {b ? (<>{b.from} <To /> {b.to} at {b.name}{b.external && <span className="text-amber">, queue likely</span>}</>) : `${leg.fromCity.country} only`}
          </span>
        </span>
        <span className="text-right text-sm tabular-nums">
          {fmtKm(leg.km)}
          <span className="block text-xs text-muted">{fmtDuration(leg.min)}</span>
          <span className="block text-xs text-muted">{fmtKm(KM_SO_FAR[leg.id - 1])} so far</span>
        </span>
      </button>
      {expandable && (
        // Height-auto transition via the 0fr → 1fr grid trick; the content stays mounted but inert while collapsed.
        <div
          className={`grid transition-[grid-template-rows] duration-250 motion-reduce:transition-none ${selected ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          onTransitionEnd={e => { if (selected && e.target === e.currentTarget) e.currentTarget.parentElement?.scrollIntoView({ block: 'nearest' }) }} // the list scrolled before the details grew
        >
          <div inert={!selected} className="min-h-0 overflow-hidden">
            <div className="pr-2 pb-4 pl-9 text-sm">
              {b?.external && <p className="text-amber">EU external border, expect a queue.</p>}
              {leg.via.length > 0 && <p className="text-muted">Via {leg.via.map(v => v.name.split(',')[0]).join(', ')}</p>}
              <MapsLink leg={leg} className="mt-3" />
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

/** All legs, out then back. `expandable` (desktop sidebar): the selected row opens its details inline. */
function LegList({ hoveredId, selectedId, onHover, onSelect, expandable }: Pick<Props, 'hoveredId' | 'selectedId' | 'onHover' | 'onSelect'> & { expandable: boolean }) {
  // Keep the selected leg visible; only when the selection changes, so it never fights a manual scroll.
  useEffect(() => {
    if (selectedId !== null) document.getElementById(`row-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  // Follow hovers from the map or ribbon only: a row under the pointer was hovered in the list itself and must not scroll it.
  useEffect(() => {
    const el = hoveredId !== null ? document.getElementById(`row-${hoveredId}`) : null
    if (el && !el.matches(':hover')) el.scrollIntoView({ block: 'nearest' })
  }, [hoveredId])

  const group = (legs: TripLeg[], label: string, note?: string) => (
    <section aria-label={label}>
      <h2 className="flex items-center gap-3 px-2 pt-3 pb-1 text-[11px] tracking-[0.08em] text-muted uppercase">
        <span>{label}</span>
        {note && <span className="tracking-normal normal-case">{note}</span>}
        <span aria-hidden="true" className="h-px flex-1 bg-white/10" />
      </h2>
      <ol>
        {legs.map(leg => (
          <Row key={leg.id} leg={leg} lit={leg.id === hoveredId || leg.id === selectedId} selected={leg.id === selectedId} expandable={expandable} onHover={onHover} onSelect={onSelect} />
        ))}
      </ol>
    </section>
  )
  const turn = LEGS[BACK - 1]
  return (
    <>
      {group(LEGS.slice(0, BACK), 'Out')}
      {group(LEGS.slice(BACK), 'Back', `turnaround at ${turn.toCity.name}, ${fmtKm(KM_SO_FAR[BACK - 1])} out`)}
    </>
  )
}

function Footer({ still, onToggleStill }: Pick<Props, 'still' | 'onToggleStill'>) {
  return (
    <div className="flex items-end justify-between gap-4 text-xs text-muted">
      <p>Drive times are OpenStreetMap routing estimates and leave out border queues.</p>
      <button
        type="button"
        aria-pressed={!still}
        onClick={onToggleStill}
        className="shrink-0 cursor-pointer min-h-11 rounded-full border border-white/15 px-4 text-light aria-pressed:border-amber/60 aria-pressed:text-amber"
      >
        Snow
      </button>
    </div>
  )
}

/** Desktop (lg up): always-visible glass sidebar; the ribbon runs underneath it. */
export function Sidebar(props: Props) {
  return (
    <aside aria-label="Trip" className={`fixed top-4 bottom-[92px] left-4 z-10 flex w-[400px] flex-col overflow-hidden rounded-2xl ${GLASS}`}>
      <TripHeader />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 py-2">
        <LegList {...props} expandable />
      </div>
      <div className="border-t border-white/10 px-6 py-4">
        <Footer still={props.still} onToggleStill={props.onToggleStill} />
      </div>
    </aside>
  )
}

/** Below lg: the same list as a modal bottom sheet on the native <dialog> (focus trap, Escape and backdrop for free). */
export function Sheet({ open, onClose, ...props }: Props & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      d.showModal()
      // The list's own keep-visible effect ran while the closed dialog had no box.
      d.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' })
    } else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label="Trip details"
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose() }} // the backdrop reports the dialog itself as target
      className={`fixed inset-x-0 top-auto bottom-0 m-0 h-[calc(100dvh-3.5rem)] max-h-none w-full max-w-none flex-col overflow-hidden rounded-t-3xl p-0 text-light open:flex backdrop:bg-navy/60 ${GLASS}`}
    >
      {/* The header scrolls with the list so a landscape phone still shows rows; only ✕ and the footer stay pinned. */}
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 z-10 grid size-11 cursor-pointer place-items-center rounded-full bg-navy/80 text-muted backdrop-blur hover:text-light">
        ✕
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <TripHeader title="h2" />
        <div className="border-t border-white/10 px-3 py-2">
          <LegList {...props} expandable={false} />
        </div>
      </div>
      <div className="border-t border-white/10 px-6 py-4">
        <Footer still={props.still} onToggleStill={props.onToggleStill} />
      </div>
    </dialog>
  )
}
