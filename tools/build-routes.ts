// One-off route precompute: node tools/build-routes.ts
// Fetches every leg from the public OSRM demo (≤1 req/s), checks it, simplifies it, writes src/data/routes.json.
import { writeFile } from 'node:fs/promises'
import { CITIES, LEGS, type LngLat } from '../src/data/trip.ts'

const UA = 'newyear-2027 (+https://github.com/denyslebiediev/newyear-2027)'
const BORDER_KM = 1 // a crossing sits on the road, so a correct route passes within metres
const TURN_DEG = 150 // sharper than this near a via = spur / U-turn
const TURN_WINDOW_KM = 0.5
const EPS = 0.0002 // RDP tolerance in degrees (~20 m)

const rad = (d: number) => (d * Math.PI) / 180
function km([lon1, lat1]: LngLat, [lon2, lat2]: LngLat) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}
function bearing([lon1, lat1]: LngLat, [lon2, lat2]: LngLat) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1))
  return (Math.atan2(y, x) * 180) / Math.PI
}

function rdp(p: LngLat[], eps: number): LngLat[] {
  const keep = new Uint8Array(p.length)
  keep[0] = keep[p.length - 1] = 1
  const stack: [number, number][] = [[0, p.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    const [ax, ay] = p[i], dx = p[j][0] - ax, dy = p[j][1] - ay, L = dx * dx + dy * dy
    let max = -1, k = -1
    for (let n = i + 1; n < j; n++) {
      const t = L ? Math.max(0, Math.min(1, ((p[n][0] - ax) * dx + (p[n][1] - ay) * dy) / L)) : 0
      const ex = ax + t * dx - p[n][0], ey = ay + t * dy - p[n][1], d = ex * ex + ey * ey
      if (d > max) { max = d; k = n }
    }
    if (max > eps * eps) { keep[k] = 1; stack.push([i, k], [k, j]) }
  }
  return p.filter((_, i) => keep[i])
}

type Osrm = {
  code: string
  routes: { distance: number; duration: number; geometry: { coordinates: LngLat[] } }[]
  waypoints: { name: string; distance: number; location: LngLat }[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const errors: string[] = []
const features = []
let totalKm = 0, totalH = 0

for (const leg of LEGS) {
  const pts = [CITIES[leg.from].lngLat, ...leg.via.map(v => v.lngLat), CITIES[leg.to].lngLat]
  const url = `https://router.project-osrm.org/route/v1/driving/${pts.map(p => p.join(',')).join(';')}?overview=full&geometries=geojson&steps=false`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  const data = (await res.json()) as Osrm
  if (data.code !== 'Ok') throw new Error(`leg ${leg.id}: OSRM ${res.status} ${data.code}`)
  const route = data.routes[0], line = route.geometry.coordinates
  const name = `${leg.id} ${CITIES[leg.from].name} → ${CITIES[leg.to].name}`

  if (leg.border) {
    const d = Math.min(...line.map(p => km(p, leg.border!.lngLat)))
    if (d > BORDER_KM) errors.push(`leg ${name}: misses ${leg.border.name} by ${d.toFixed(2)} km`)
  }
  for (const wp of data.waypoints.slice(1, -1)) {
    for (let i = 1; i < line.length - 1; i++) {
      if (km(line[i], wp.location) > TURN_WINDOW_KM) continue
      if (km(line[i - 1], line[i]) < 0.001 || km(line[i], line[i + 1]) < 0.001) continue // duplicate vertex, no bearing
      const turn = Math.abs(((bearing(line[i], line[i + 1]) - bearing(line[i - 1], line[i]) + 540) % 360) - 180)
      if (turn > TURN_DEG) errors.push(`leg ${name}: ${turn.toFixed(0)}° turn near via "${wp.name}" at ${line[i].join(',')}`)
    }
  }

  const coords = rdp(line, EPS).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)] as LngLat)
  const legKm = route.distance / 1000, legMin = route.duration / 60
  totalKm += legKm; totalH += legMin / 60
  features.push({ type: 'Feature', id: leg.id, properties: { id: leg.id, km: Math.round(legKm), min: Math.round(legMin) }, geometry: { type: 'LineString', coordinates: coords } })
  const vias = data.waypoints.slice(1, -1).map(w => `${w.name || '(unnamed)'} @${w.distance.toFixed(0)}m`).join('; ')
  console.log(`${name.padEnd(30)} ${legKm.toFixed(1).padStart(6)} km ${(legMin / 60).toFixed(2).padStart(5)} h  ${String(coords.length).padStart(5)} pts  ${vias}`)
  await sleep(1100)
}

console.log(`TOTAL ${totalKm.toFixed(0)} km, ${totalH.toFixed(1)} h`)
if (totalKm < 4650 || totalKm > 4950) errors.push(`total ${totalKm.toFixed(0)} km outside 4650–4950`)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
await writeFile(new URL('../src/data/routes.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features }))
console.log('wrote src/data/routes.json')
