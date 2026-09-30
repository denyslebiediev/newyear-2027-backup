import type { FeatureCollection, LineString } from 'geojson'
import { CITIES, LEGS as RAW, type City, type Leg } from '../data/trip'
import routesJson from '../data/routes.json'

type RouteProps = { id: number; km: number; min: number }
export const ROUTES = routesJson as FeatureCollection<LineString, RouteProps>

// OKLCH-stepped ice → aurora → coral → gold; same-road pairs (1/13, 4/10, 5/9…) stay far apart.
export const LEG_COLORS = ['#7dd3fc', '#7bc9ff', '#7ebfff', '#85b3ff', '#90a6ff', '#9b99ff', '#a78bfa', '#d586e7', '#f986c7', '#ff8ea0', '#ff9f76', '#ffb753', '#fcd34d']

export type TripLeg = Leg & {
  fromCity: City
  toCity: City
  km: number
  min: number
  color: string
  coords: [number, number][]
  bbox: [[number, number], [number, number]]
}

function bbox(coords: [number, number][]): TripLeg['bbox'] {
  let [w, s, e, n] = [180, 90, -180, -90]
  for (const [x, y] of coords) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
  }
  return [[w, s], [e, n]]
}

export const LEGS: TripLeg[] = RAW.map((leg, i) => {
  const route = ROUTES.features.find(f => f.properties.id === leg.id)!
  const coords = route.geometry.coordinates as [number, number][]
  return {
    ...leg,
    fromCity: CITIES[leg.from],
    toCity: CITIES[leg.to],
    km: route.properties.km,
    min: route.properties.min,
    color: LEG_COLORS[i],
    coords,
    bbox: bbox(coords),
  }
})

export const TRIP_BBOX = bbox(LEGS.flatMap(l => l.coords))

/** All legs in travel order as one line, for the intro draw-in. */
export const TRIP_LINE: [number, number][] = LEGS.flatMap((l, i) => (i ? l.coords.slice(1) : l.coords))

// Cities visited twice (the loop passes back through them).
const visits = new Map<string, number>()
for (const l of LEGS) visits.set(l.to, (visits.get(l.to) ?? 0) + 1)
export const STOPS = Object.entries(CITIES).map(([id, c]) => ({ id, ...c, twice: (visits.get(id) ?? 0) > 1 && id !== 'kyiv' }))

export const TOTALS = {
  km: LEGS.reduce((s, l) => s + l.km, 0),
  min: LEGS.reduce((s, l) => s + l.min, 0),
  countries: new Set(Object.values(CITIES).map(c => c.country)).size,
  cities: STOPS.length,
  datesPending: LEGS.some(l => !l.date),
}

export const fmtKm = (km: number) => `${km.toLocaleString('en-GB')} km`

export function fmtDuration(min: number) {
  const m = Math.round(min / 5) * 5 // ponytail: OSRM is an estimate, 5-min precision is honest enough
  const h = Math.floor(m / 60)
  return `≈${h ? `${h} h` : ''}${h && m % 60 ? ' ' : ''}${m % 60 ? `${m % 60} min` : ''}`
}

// timeZone UTC: 'YYYY-MM-DD' parses as UTC midnight; a local zone west of UTC would show the previous day.
const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
export const fmtDate = (date: string | null) => (date ? DATE.format(new Date(date)) : null)

export const legNo = (id: number) => String(id).padStart(2, '0')

export function gmapsUrl(leg: TripLeg) {
  const q = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    origin: `${leg.fromCity.name}, ${leg.fromCity.country}`,
    destination: `${leg.toCity.name}, ${leg.toCity.country}`,
  })
  if (leg.via.length) q.set('waypoints', leg.via.map(v => v.name).join('|'))
  return `https://www.google.com/maps/dir/?${q}`
}

/**
 * Outbound and return legs share roads, so one pointer position can hit several legs.
 * Keeps `keep` if it is still under the pointer; with `cycle` (the selected leg) under the pointer, moves to the next one,
 * so clicking a shared road again toggles outbound ↔ return.
 */
export function pickLegId(ids: number[], keep: number | null, cycle: number | null = null) {
  if (!ids.length) return null
  if (cycle !== null && ids.includes(cycle)) return ids[(ids.indexOf(cycle) + 1) % ids.length]
  if (keep !== null && ids.includes(keep)) return keep
  return ids[0]
}

/** Next (d = 1) or previous (d = -1) leg id, wrapping 13 → 1 and 1 → 13. */
export const stepLeg = (id: number, d: number) => LEGS[(id - 1 + d + LEGS.length) % LEGS.length].id

/** Accessible name of a leg: "Leg 04 of 13, Budapest to Vienna, 244 km, about 2 h 40 min". */
export const legLabel = (l: TripLeg) => `Leg ${legNo(l.id)} of ${LEGS.length}, ${l.fromCity.name} to ${l.toCity.name}, ${fmtKm(l.km)}, about ${fmtDuration(l.min).slice(1)}`

/** Day number of a leg: from the dates once known, else the leg number (one leg per day). */
export const dayOf = (l: TripLeg) => (l.date && LEGS[0].date ? Math.round((Date.parse(l.date) - Date.parse(LEGS[0].date)) / 864e5) + 1 : l.id)

/** Cumulative km after each leg, by leg index. */
export const KM_SO_FAR = LEGS.map((_, i) => LEGS.slice(0, i + 1).reduce((s, l) => s + l.km, 0))

/** Index of the first leg that arrives somewhere already visited: legs before it go out, from it on they come back. */
export const BACK = LEGS.findIndex((l, i) => LEGS.slice(0, i).some(p => p.from === l.to || p.to === l.to))
