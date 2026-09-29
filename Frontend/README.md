# MediCore — Frontend

React 19 + Vite single-page app for the MediCore Hospital Management System.
See the **root `README.md`** (one level up) for full project documentation:
setup for both Frontend and Backend, roles/permissions, trigger docs, and
demo credentials.

## Quick start

```bash
npm install
cp .env.example .env      # VITE_API_URL - defaults to http://localhost:5000/api
npm run dev                # http://localhost:5173
```

Requires the Backend API (see `../Backend/README.md` or the root README) to
be running.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm run lint` — run oxlint
