import { useEffect, useMemo, useRef, useState } from 'react'
import { AttributionControl, Layer, Map, Marker, NavigationControl, Source, type MapLayerMouseEvent, type MapRef, type MapStyleDataEvent } from '@vis.gl/react-maplibre'
import type { ExpressionSpecification, Map as MLMap } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LEGS, ROUTES, STOPS, TRIP_BBOX, TRIP_LINE, pickLegId } from '../lib/legs'

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
const NAVY = '#0b1426'
const LIGHT = '#fff6e5'
const AMBER = '#ffb454'
const CLEAR = 'rgba(0,0,0,0)'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const landscape = () => matchMedia('(orientation: landscape)').matches
// ponytail: the chrome sizes are CSS constants: sidebar 400 px (lg up, TripPanel.tsx), header 70 px / 94 px from md up (App.tsx), ribbon 76 px.
// Only #card (Itinerary.tsx, below lg) varies, so only it is measured: portrait stacks it above the ribbon, landscape docks it bottom-right.
const card = (k: 'offsetHeight' | 'offsetWidth') => document.getElementById('card')?.[k] ?? 0
const mapPadding = () => {
  const lg = matchMedia('(min-width: 1024px)').matches
  return {
    top: lg ? 48 : matchMedia('(min-width: 768px)').matches ? 104 : 84, // lg: clears the attribution bar (the header lives in the sidebar)
    left: lg ? 24 + 400 + 16 : 24,
    bottom: 100 + (landscape() ? 0 : card('offsetHeight') + 8),
    right: Math.max(56, 24 + (landscape() ? card('offsetWidth') + 16 : 0)), // 56 clears the zoom buttons
  }
}

// Positive line-offset = right of travel direction, so outbound and return on the same road split into two lanes.
const LANE_OFFSET: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 4, 1.5, 9, 4]
const LEG_COLOR: ExpressionSpecification = ['match', ['get', 'id'], ...LEGS.flatMap(l => [l.id, l.color]), LIGHT] as unknown as ExpressionSpecification
const EN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const draw = (color: string, p: number): ExpressionSpecification => ['step', ['line-progress'], color, Math.min(p, 1) * 1.01, CLEAR]

// Winter-night recolour of OpenFreeMap "dark". Layer ids verified against the live style.
const PAINT: [string, Parameters<MLMap['setPaintProperty']>[1], string][] = [
  ['background', 'background-color', NAVY],
  ['water', 'fill-color', '#050d1c'],
  ['waterway', 'line-color', '#0a1830'],
  ['landcover_ice_shelf', 'fill-color', '#0d1830'],
  ['landcover_glacier', 'fill-color', '#0d1830'],
  ['landuse_residential', 'fill-color', '#0f1b33'],
  ['landuse_park', 'fill-color', '#0d1a2f'],
  ['building', 'fill-color', '#0c1628'],
  ['building', 'fill-outline-color', '#15233e'],
  ['highway_path', 'line-color', '#101c33'],
  ['highway_minor', 'line-color', '#111e36'],
  ['highway_major_subtle', 'line-color', '#16253f'],
  ['highway_major_casing', 'line-color', 'rgba(52,78,122,0.55)'],
  ['highway_major_inner', 'line-color', '#0e1a31'],
  ['highway_motorway_subtle', 'line-color', '#172742'],
  ['highway_motorway_casing', 'line-color', 'rgba(52,78,122,0.6)'],
  ['highway_motorway_inner', 'line-color', '#0e1a31'],
  ['railway', 'line-color', '#16233d'],
  ['boundary_state', 'line-color', '#1d3052'],
  ['boundary_country_z0-4', 'line-color', '#3a5a8c'],
  ['boundary_country_z5-', 'line-color', '#3a5a8c'],
  ['water_name', 'text-color', '#3d5a8a'],
  ['water_name', 'text-halo-color', '#050d1c'],
]

const OUR_CITIES: ExpressionSpecification = ['literal', STOPS.map(s => s.name)]
const restyled = new WeakSet<MLMap>()
function restyle(map: MLMap) {
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol' || l.source !== 'openmaptiles') continue
    if (JSON.stringify(l.layout?.['text-field'] ?? '').includes('name')) map.setLayoutProperty(l.id, 'text-field', EN_NAME)
    if (l.id.startsWith('highway_name') || l.id === 'place_state') map.setLayoutProperty(l.id, 'visibility', 'none') // keep the map quiet
    if (l.id.startsWith('place_')) {
      map.setPaintProperty(l.id, 'text-color', l.id.startsWith('place_country') ? '#5f79a6' : '#8ea3c7')
      map.setPaintProperty(l.id, 'text-halo-color', NAVY)
      // Our own city-labels layer names the trip cities; drop the basemap's copies so the two never fight for space.
      const notOurs: ExpressionSpecification = ['!', ['in', ['get', 'name:en'], OUR_CITIES]]
      const f = map.getFilter(l.id)
      map.setFilter(l.id, f ? ['all', f, notOurs] as ExpressionSpecification : notOurs)
    }
  }
  if (map.getLayer('landcover_wood')) map.setLayoutProperty('landcover_wood', 'visibility', 'none') // its pattern isn't in the sprite
  for (const [id, prop, value] of PAINT) if (map.getLayer(id)) map.setPaintProperty(id, prop, value)
}

const CITY_POINTS = {
  type: 'FeatureCollection' as const,
  features: STOPS.map(s => ({ type: 'Feature' as const, properties: { name: s.name, twice: s.twice }, geometry: { type: 'Point' as const, coordinates: s.lngLat } })),
}
const INTRO = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: TRIP_LINE } }
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/** Runs fn(progress 0→1) every frame for `ms`; returns a cancel function. */
function animate(ms: number, fn: (p: number) => void, done?: () => void) {
  let raf = 0
  const t0 = performance.now()
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / ms)
    fn(p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) // ease-in-out
    if (p < 1) raf = requestAnimationFrame(tick)
    else done?.()
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

const WEBGL2 = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2')

type Props = {
  hoveredId: number | null
  selectedId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}

export default function TripMap({ hoveredId, selectedId, onHover, onSelect }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [before, setBefore] = useState<string | undefined | null>(null) // null = basemap not restyled yet
  const [loaded, setLoaded] = useState(false)
  const [introDone, setIntroDone] = useState(reducedMotion)
  const first = useRef(true)
  // Any interaction ends the intro for good (latched during render, React's "adjust state on prop change" pattern).
  if (!introDone && (hoveredId !== null || selectedId !== null)) setIntroDone(true)
  const selected = LEGS.find(l => l.id === selectedId)
  const selData = useMemo(() => (selected ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: selected.coords } } : EMPTY), [selected])

  function onStyleData(e: MapStyleDataEvent) {
    const map = e.target
    if (restyled.has(map)) return
    restyled.add(map)
    restyle(map)
    // Routes go above roads/boundaries but under place names.
    setBefore(map.getStyle().layers.find(l => l.id.startsWith('place_'))?.id)
  }

  function ids(e: MapLayerMouseEvent) {
    return [...new Set((e.features ?? []).map(f => Number(f.properties.id)))].sort((a, b) => a - b)
  }

  // Hover highlight via feature-state: no worker relayout.
  useEffect(() => {
    const map = mapRef.current
    if (hoveredId === null || !map?.getSource('legs')) return
    map.setFeatureState({ source: 'legs', id: hoveredId }, { hover: true })
    return () => { if (map.getSource('legs')) map.setFeatureState({ source: 'legs', id: hoveredId }, { hover: false }) }
  }, [hoveredId, before])

  // Intro: the whole loop "drives" itself in, then hands over to the per-leg colours.
  // Ends on any interaction with the map itself (a ribbon swipe or a page keypress leaves it running).
  useEffect(() => {
    if (!loaded || introDone) return
    const map = mapRef.current!.getMap()
    const finish = () => setIntroDone(true)
    const ctrl = new AbortController()
    for (const ev of ['pointerdown', 'wheel', 'keydown']) map.getContainer().addEventListener(ev, finish, { capture: true, signal: ctrl.signal })
    const cancel = animate(3000, p => map.getLayer('intro-draw') && map.setPaintProperty('intro-draw', 'line-gradient', draw(LIGHT, p)), finish)
    return () => { ctrl.abort(); cancel() }
  }, [loaded, introDone])

  // Select: fly to the leg (or back to the whole trip) and draw the leg in.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return // maplibre is lazy-loaded; a pick made before that is applied once it is ready
    if (first.current) { first.current = false; if (selectedId === null) return }
    const duration = reducedMotion() ? 0 : 1400
    // maxZoom must be omitted, not undefined: MapLibre copies the undefined over its default and the camera becomes NaN.
    map.fitBounds(selected?.bbox ?? TRIP_BBOX, { padding: mapPadding(), duration, ...(selected && { maxZoom: 10 }) })
    if (!selected) return
    const m = map.getMap()
    return animate(duration ? 1200 : 1, p => {
      if (!m.getLayer('sel-draw')) return
      m.setPaintProperty('sel-draw', 'line-gradient', draw(selected.color, p))
      m.setPaintProperty('sel-glow', 'line-gradient', draw(selected.color, p))
    })
  }, [selected, selectedId, loaded])

  // Rotating a phone/tablet moves the card from above the ribbon to the right, and crossing lg swaps card ↔ sidebar: the padding changes, re-frame.
  useEffect(() => {
    const refit = () => {
      const m = mapRef.current
      if (!m) return
      m.resize() // the media query fires before MapLibre's own ResizeObserver
      m.fitBounds(selected?.bbox ?? TRIP_BBOX, { padding: mapPadding(), duration: 0, ...(selected && { maxZoom: 10 }) })
    }
    const mqs = ['(orientation: landscape)', '(min-width: 1024px)'].map(q => matchMedia(q))
    for (const mq of mqs) mq.addEventListener('change', refit)
    return () => { for (const mq of mqs) mq.removeEventListener('change', refit) }
  }, [selected])

  // An empty-map click deselects, but only if it wasn't the first half of a double-tap/double-click zoom.
  const pendingDeselect = useRef(0)
  function onMapClick(e: MapLayerMouseEvent) {
    clearTimeout(pendingDeselect.current)
    const id = pickLegId(ids(e), hoveredId, selectedId)
    if (id !== null) onSelect(id)
    else pendingDeselect.current = window.setTimeout(() => onSelect(null), 500) // ponytail: 500 ms = MapLibre's double-tap window
  }

  if (!WEBGL2) {
    return <div className="grid h-full place-items-center p-8 text-center text-muted">This browser can't draw the map (WebGL2 is off). The itinerary still works.</div>
  }

  const dim = hoveredId !== null || selectedId !== null
  const legsOpacity = introDone ? (dim ? 0.35 : 0.95) : 0
  const fade = { duration: 500, delay: 0 }

  return (
    <Map
      ref={mapRef}
      mapStyle={STYLE}
      workerUrl={workerUrl}
      initialViewState={{ bounds: TRIP_BBOX, fitBoundsOptions: { padding: mapPadding() } }}
      style={{ position: 'absolute', inset: 0 }}
      attributionControl={false}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      interactiveLayerIds={before === null ? [] : ['legs-hit']}
      cursor={hoveredId !== null ? 'pointer' : undefined}
      onStyleData={onStyleData}
      // MapLibre opens the compact attribution (maps ≤640 px wide) on add and again on every resize into ≤640 px, and only closes it on the first drag:
      // keep it collapsed so it never covers the title. Registered after the control's own resize listener, so it runs after MapLibre re-opens it.
      onLoad={e => {
        setLoaded(true)
        const collapse = () => { const d = e.target.getContainer().querySelector('.maplibregl-compact-show'); d?.classList.remove('maplibregl-compact-show'); d?.removeAttribute('open') }
        collapse()
        e.target.on('resize', collapse)
      }}
      onMouseMove={e => onHover(pickLegId(ids(e), hoveredId))}
      // Pointer boundary events fire before the canvas mouseout, so a fast move from the map straight onto a connector would have the map clobber the
      // connector's pointerenter: keep the leg under the pointer, clear for any other exit (ribbon padding, card, header, window).
      onMouseOut={e => onHover(Number((e.originalEvent.relatedTarget as Element | null)?.closest<HTMLElement>('[data-leg]')?.dataset.leg) || null)}
      onClick={onMapClick}
      onMoveStart={() => clearTimeout(pendingDeselect.current)}
    >
      <AttributionControl position="top-right" customAttribution="Routes: OSRM" />
      <NavigationControl position="top-right" showCompass={false} />

      {before !== null && (
        <>
          <Source id="legs" type="geojson" data={ROUTES} promoteId="id">
            <Layer id="legs-glow" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 12], 'line-blur': 6, 'line-offset': LANE_OFFSET, 'line-opacity': legsOpacity * 0.35, 'line-opacity-transition': fade }} />
            <Layer id="legs-core" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 3.5], 'line-offset': LANE_OFFSET, 'line-opacity': legsOpacity, 'line-opacity-transition': fade }} />
            <Layer id="legs-arrows" type="symbol" beforeId={before} minzoom={5}
              layout={{ 'symbol-placement': 'line', 'symbol-spacing': 220, 'text-field': '›', 'text-font': ['Noto Sans Bold'], 'text-size': 16, 'text-keep-upright': false, 'text-allow-overlap': true, 'text-offset': ['interpolate', ['linear'], ['zoom'], 5, ['literal', [0, 0.12]], 9, ['literal', [0, 0.25]]] }}
              paint={{ 'text-color': LEG_COLOR, 'text-halo-color': NAVY, 'text-halo-width': 1, 'text-opacity': introDone ? (dim ? 0.3 : 0.9) : 0 }} />
            <Layer id="legs-hover" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 6], 'line-offset': LANE_OFFSET, 'line-opacity': ['case', HOVER, 1, 0] }} />
            <Layer id="legs-hit" type="line" beforeId={before}
              paint={{ 'line-color': LIGHT, 'line-width': 16, 'line-offset': LANE_OFFSET, 'line-opacity': 0 }} />
          </Source>
          <Source id="sel" type="geojson" lineMetrics data={selData}>
            <Layer id="sel-glow" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(LIGHT, 0), 'line-width': 14, 'line-blur': 8, 'line-offset': LANE_OFFSET, 'line-opacity': 0.55 }} />
            <Layer id="sel-draw" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(LIGHT, 0), 'line-width': 5, 'line-offset': LANE_OFFSET }} />
          </Source>
          <Source id="intro" type="geojson" lineMetrics data={INTRO}>
            <Layer id="intro-draw" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(LIGHT, 0), 'line-width': 3, 'line-blur': 0.5, 'line-offset': LANE_OFFSET, 'line-opacity': introDone ? 0 : 1, 'line-opacity-transition': fade }} />
          </Source>
          {/* On top of everything (no beforeId): collision then hides the basemap's duplicate city names. */}
          <Source id="cities" type="geojson" data={CITY_POINTS}>
            <Layer id="city-labels" type="symbol"
              layout={{ 'text-field': ['case', ['get', 'twice'], ['format', ['get', 'name'], {}, ' ×2', { 'text-color': AMBER, 'font-scale': 0.8 }], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 9, 15], 'text-variable-anchor': ['left', 'top', 'bottom', 'right'], 'text-radial-offset': 0.9, 'text-letter-spacing': 0.02 }}
              paint={{ 'text-color': LIGHT, 'text-halo-color': NAVY, 'text-halo-width': 1.6 }} />
          </Source>
        </>
      )}

      {STOPS.map(s => (
        <Marker key={s.id} longitude={s.lngLat[0]} latitude={s.lngLat[1]} anchor="center" style={{ pointerEvents: 'none' }}>
          <span aria-hidden="true" className="block size-2.5 rounded-full bg-light shadow-[0_0_10px_3px_rgba(255,180,84,0.45)]" />
        </Marker>
      ))}
    </Map>
  )
}
