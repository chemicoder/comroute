# RouteLive

Real-time bus and transit tracking for daily commuters. Live ETA, route history, shareable links, favorites, and offline-capable PWA.

Live: https://chemicoder.github.io/comroute/

## Stack (all free tier)

- **Frontend:** React 19 + Vite + TypeScript + Tailwind 4
- **Maps:** Leaflet + OpenStreetMap (light) / CARTO (dark)
- **Routing:** OSRM public demo
- **Auth + DB:** Firebase Auth (Google) + Firestore
- **Hosting:** GitHub Pages (served from `/comroute/`)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build   # outputs dist/
npm run preview # serves the production build
```

## Deploy to GitHub Pages

Pushes to `main` are auto-built and deployed by `.github/workflows/deploy.yml`.

One-time setup in the repo:

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions.
2. **Firebase Console → Authentication → Settings → Authorized domains:** add `chemicoder.github.io` (otherwise Google sign-in fails in production).

### Local preview of the production bundle

```bash
npm run build
npm run preview
```

The site is served from `/comroute/` to match the Pages URL.

## Features

- Live bus location broadcasting with geolocation
- OSRM-backed ETA with rush-hour traffic heuristic
- Route stops with drag-and-drop editing (undo/redo)
- Shareable live-view link per route (`/share/:id`)
- Institute admin panel for private routes + invites
- Favorites, dark mode, and browser push alerts when a favorite route is within 1.5 km
- Installable PWA with offline tile + route caching
- Web Share API with clipboard fallback

## Project structure

```
src/
  App.tsx                main app + share view + auth
  firebase.ts            Firebase init + error handler
  types.ts               shared types
  components/
    Map.tsx              Leaflet map + routes + stops
    Search.tsx           search input
    TrackingToggle.tsx   driver live-tracking controls
    InstitutePanel.tsx   institute admin + private routes
  lib/
    AppContext.tsx       theme, favorites, toast provider
    ErrorBoundary.tsx    top-level error boundary
    geo.ts               haversine + history cap helpers
    notifications.ts     Web Notifications + nearby alerts
public/
  icon.svg og-image.svg
  _headers _redirects    Cloudflare Pages config
firestore.rules          Firestore security rules
wrangler.toml            Cloudflare Pages config
```
