# RouteLive

Real-time bus and transit tracking for daily commuters. Live ETA, route history, shareable links, favorites, and offline-capable PWA.

## Stack (all free tier)

- **Frontend:** React 19 + Vite + TypeScript + Tailwind 4
- **Maps:** Leaflet + OpenStreetMap (light) / CARTO (dark)
- **Routing:** OSRM public demo
- **Auth + DB:** Firebase Auth (Google) + Firestore
- **Hosting:** Cloudflare Pages (unlimited bandwidth)

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

## Deploy to Cloudflare Pages

One-time login:

```bash
npx wrangler login
```

Then:

```bash
npm run deploy
```

The first deploy auto-creates the `routelive` project. Subsequent deploys push to the same project.

### Before you publish

Add your deployed domain to **Firebase Console → Authentication → Settings → Authorized domains** (for example `routelive.pages.dev`). Google sign-in will otherwise fail on production.

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
