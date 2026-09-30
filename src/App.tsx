import { useEffect, useState } from 'react'
import TripMap from './components/TripMap'
import { LegCard, Ribbon } from './components/Itinerary'
import { LEGS, TOTALS, fmtKm, legLabel } from './lib/legs'

export default function App() {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const leg = LEGS.find(l => l.id === selectedId)

  // The card unmounts with the selection; if focus was inside it, park it on the connector that opened it.
  function close() {
    if (document.getElementById('card')?.contains(document.activeElement)) document.querySelector<HTMLElement>('#ribbon [aria-expanded="true"]')?.focus()
    setSelectedId(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="fixed inset-0 overflow-hidden bg-navy">
      <TripMap hoveredId={hoveredId} selectedId={selectedId} onHover={setHoveredId} onSelect={id => (id === null ? close() : setSelectedId(id))} />
      <div aria-hidden="true" className="motion-reduce:hidden">
        <span className="snow snow-a" />
        <span className="snow snow-b" />
        <span className="snow snow-c" />
      </div>
      <header className="pointer-events-none fixed left-4 top-4 z-10 max-w-[calc(100%-2rem)] [text-shadow:0_0_2px_var(--color-navy),0_2px_16px_var(--color-navy)]">
        <h1 className="font-display text-[28px] leading-none font-semibold tracking-tight md:text-[32px]">New Year 2027</h1>
        <p className="mt-1.5 text-sm text-muted tabular-nums">
          {fmtKm(TOTALS.km)} · {TOTALS.cities} cities · {TOTALS.countries} countries · ≈{Math.round(TOTALS.min / 60)} h
        </p>
        {TOTALS.datesPending && <p className="hidden text-sm text-muted md:block">Dates to be confirmed</p>}
      </header>
      {/* DOM order ribbon → card (the card is the ribbon's aria-controls target); flex-col-reverse puts the card above. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col-reverse *:pointer-events-auto">
        <Ribbon hoveredId={hoveredId} selectedId={selectedId} onHover={setHoveredId} onSelect={setSelectedId} />
        {leg && <LegCard leg={leg} onSelect={setSelectedId} onClose={close} />}
      </div>
      <p role="status" className="sr-only">
        {leg ? `${legLabel(leg)}${leg.border?.external ? '. EU external border, expect a queue' : ''}` : ''}
      </p>
    </main>
  )
}
