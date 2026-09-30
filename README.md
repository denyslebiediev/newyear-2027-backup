# newyear-2027

Interactive map of a New Year 2027 road trip: Kyiv → Chernivtsi → Suceava → Budapest → Vienna → Prague → Karlovy Vary → Wrocław and back, in 13 legs.

**Site:** https://denyslebiediev.github.io/newyear-2027/

Built with Vite, React, MapLibre GL and OpenFreeMap tiles (no API keys). Routes are precomputed with the public OSRM router and committed in `src/data/routes.json`; the page makes no routing calls. Every push to `main` deploys to GitHub Pages.

Edit dates, via points and border crossings in `src/data/trip.ts`, then regenerate the routes:

```sh
node tools/build-routes.ts   # Node 22.18+ (runs TypeScript directly)
```
