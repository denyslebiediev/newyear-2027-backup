// Hand-edited trip data. Imports nothing: tools/build-routes.ts imports this file directly.

export type LngLat = [number, number]

export type City = { name: string; country: string; lngLat: LngLat }

export type Leg = {
  id: number
  from: CityId
  to: CityId
  /** 'YYYY-MM-DD' once the schedule is known */
  date: string | null
  /** Forced route points. Keep them ON the through road, never on a city centre: centroids make OSRM do U-turns and spurs. */
  via: { name: string; lngLat: LngLat }[]
  /** lngLat is where the road name changes at the border; build-routes.ts checks the route passes within 1 km. */
  border: { name: string; from: string; to: string; lngLat: LngLat; external: boolean } | null
}

export const CITIES = {
  kyiv: { name: 'Kyiv', country: 'Ukraine', lngLat: [30.52406, 50.45024] },
  chernivtsi: { name: 'Chernivtsi', country: 'Ukraine', lngLat: [25.93765, 48.28647] },
  suceava: { name: 'Suceava', country: 'Romania', lngLat: [26.25226, 47.647] },
  budapest: { name: 'Budapest', country: 'Hungary', lngLat: [19.04024, 47.49788] },
  vienna: { name: 'Vienna', country: 'Austria', lngLat: [16.37204, 48.20846] },
  prague: { name: 'Prague', country: 'Czechia', lngLat: [14.42097, 50.08745] },
  karlovyVary: { name: 'Karlovy Vary', country: 'Czechia', lngLat: [12.87014, 50.23062] },
  wroclaw: { name: 'Wrocław', country: 'Poland', lngLat: [17.03068, 51.11005] },
} satisfies Record<string, City>

export type CityId = keyof typeof CITIES

const CLUJ_ORADEA = [
  { name: 'Cluj-Napoca, Romania', lngLat: [23.5728, 46.7632] }, // DN1, west side
  { name: 'Oradea, Romania', lngLat: [21.8929, 47.0481] }, // DN1Y towards the A3
] satisfies Leg['via']
const KRALOVEC: LngLat = [15.98346, 50.68654] // CZ 16 → PL Sudecka

const B = {
  porubne: { name: 'Porubne–Siret', lngLat: [26.0613, 47.9878], external: true },
  bors: { name: 'Borș II – Nagykereki', lngLat: [21.859, 47.197], external: false },
  hegyeshalom: { name: 'Hegyeshalom–Nickelsdorf', lngLat: [17.111, 47.9246], external: false },
  mikulov: { name: 'Mikulov–Drasenhofen', lngLat: [16.6385, 48.7858], external: false },
  kralovec: { name: 'Královec–Lubawka', lngLat: KRALOVEC, external: false },
} satisfies Record<string, Omit<NonNullable<Leg['border']>, 'from' | 'to'>>

export const LEGS: Leg[] = [
  { id: 1, from: 'kyiv', to: 'chernivtsi', date: null, via: [], border: null },
  { id: 2, from: 'chernivtsi', to: 'suceava', date: null, via: [], border: { ...B.porubne, from: 'UA', to: 'RO' } },
  { id: 3, from: 'suceava', to: 'budapest', date: null, via: CLUJ_ORADEA, border: { ...B.bors, from: 'RO', to: 'HU' } },
  { id: 4, from: 'budapest', to: 'vienna', date: null, via: [], border: { ...B.hegyeshalom, from: 'HU', to: 'AT' } },
  { id: 5, from: 'vienna', to: 'prague', date: null, via: [], border: { ...B.mikulov, from: 'AT', to: 'CZ' } },
  { id: 6, from: 'prague', to: 'karlovyVary', date: null, via: [], border: null },
  { id: 7, from: 'karlovyVary', to: 'wroclaw', date: null, via: [{ name: 'Královec, Czechia', lngLat: KRALOVEC }], border: { ...B.kralovec, from: 'CZ', to: 'PL' } },
  { id: 8, from: 'wroclaw', to: 'prague', date: null, via: [], border: { ...B.kralovec, from: 'PL', to: 'CZ' } },
  { id: 9, from: 'prague', to: 'vienna', date: null, via: [], border: { ...B.mikulov, from: 'CZ', to: 'AT' } },
  { id: 10, from: 'vienna', to: 'budapest', date: null, via: [], border: { ...B.hegyeshalom, from: 'AT', to: 'HU' } },
  { id: 11, from: 'budapest', to: 'suceava', date: null, via: [...CLUJ_ORADEA].reverse(), border: { ...B.bors, from: 'HU', to: 'RO' } },
  { id: 12, from: 'suceava', to: 'chernivtsi', date: null, via: [], border: { ...B.porubne, from: 'RO', to: 'UA' } },
  { id: 13, from: 'chernivtsi', to: 'kyiv', date: null, via: [], border: null },
]
