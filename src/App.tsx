import { useEffect, useState } from 'react'
import TripMap from './components/TripMap'
import { LegCard, Ribbon } from './components/Itinerary'
import { Sheet, Sidebar } from './components/TripPanel'
import { LEGS, TOTALS, fmtKm, legLabel } from './lib/legs'

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export default function App() {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // "still" = no snow. Starts from the OS reduced-motion setting; the Snow button flips it.
  const [still, setStill] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [sheet, setSheet] = useState(false)
  // lg up: the trip panel is a sidebar and the selected leg's details expand in it. Below: a bottom sheet, and the selected leg gets a card.
  const desktop = useMedia('(min-width: 1024px)')
  if (desktop && sheet) setSheet(false) // the <dialog> unmounts without a close event when the sidebar takes over
  const leg = LEGS.find(l => l.id === selectedId)

  // Deselecting unmounts the card (below lg) or makes the sidebar row's details inert (lg up); if focus was inside, park it on the control that opened them.
  function close() {
    const a = document.activeElement
    if (document.getElementById('card')?.contains(a)) document.querySelector<HTMLElement>('#ribbon [aria-expanded="true"]')?.focus()
    else a?.closest('li[id^="row-"]')?.querySelector('button')?.focus()
    setSelectedId(null)
  }

  useEffect(() => {
    // An open sheet owns Escape (the <dialog> closes itself).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const panel = { hoveredId, selectedId, onHover: setHoveredId, still, onToggleStill: () => setStill(s => !s) }

  return (
    <main className="fixed inset-0 overflow-hidden bg-navy">
      <TripMap hoveredId={hoveredId} selectedId={selectedId} onHover={setHoveredId} onSelect={id => (id === null ? close() : setSelectedId(id))} />
      {!still && (
        <div aria-hidden="true">
          <span className="snow snow-a" />
          <span className="snow snow-b" />
          <span className="snow snow-c" />
        </div>
      )}
      {desktop ? (
        <Sidebar {...panel} onSelect={setSelectedId} />
      ) : (
        <>
          <header className="pointer-events-none fixed top-4 left-4 z-10 max-w-[calc(100%-2rem)] [text-shadow:0_0_2px_var(--color-navy),0_2px_16px_var(--color-navy)]">
            <h1 className="font-display text-[28px] leading-none font-semibold tracking-tight md:text-[32px]">New Year 2027</h1>
            <p className="mt-1.5 text-sm text-muted tabular-nums">
              {/* The totals line is the button that opens the sheet: 44 px hit area (py-3) without adding height (-my-3). */}
              <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="pointer-events-auto -my-3 flex cursor-pointer items-center gap-1 py-3 hover:text-light">
                {fmtKm(TOTALS.km)} · {TOTALS.cities} cities · {TOTALS.countries} countries · ≈{Math.round(TOTALS.min / 60)} h
                <span aria-hidden="true" className="text-base leading-none">›</span>
                <span className="sr-only">, all legs</span>
              </button>
            </p>
            {TOTALS.datesPending && <p className="hidden text-sm text-muted md:block">Dates to be confirmed</p>}
          </header>
          <Sheet open={sheet} onClose={() => setSheet(false)} {...panel} onSelect={id => { setSheet(false); setSelectedId(id) }} />
        </>
      )}
      {/* DOM order ribbon → card; flex-col-reverse puts the card above. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col-reverse *:pointer-events-auto">
        <Ribbon hoveredId={hoveredId} selectedId={selectedId} onHover={setHoveredId} onSelect={setSelectedId} />
        {leg && !desktop && <LegCard leg={leg} onSelect={setSelectedId} onClose={close} />}
      </div>
      <p role="status" className="sr-only">
        {leg ? `${legLabel(leg)}${leg.border?.external ? '. EU external border, expect a queue' : ''}` : ''}
      </p>
    </main>
  )
}
