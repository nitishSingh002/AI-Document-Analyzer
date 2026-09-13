# AI Document Analyzer — Frontend

React + Vite + JavaScript frontend with React Router and Axios.

## Development

```sh
npm install
npm run dev
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Checks

```sh
npm run lint
npm run build
npm run preview
```

## Structure

- `src/components/Navbar.jsx`: shared navigation.
- `src/pages/Home.jsx`: landing page at `/`.
- `src/pages/Dashboard.jsx`: placeholder workspace at `/dashboard`.
- `src/services/api.js`: shared Axios instance with a 10-second timeout.
- `src/App.jsx`: application layout and routes, including a fallback page.
- `src/main.jsx`: React entry point and browser router.
- `src/index.css`: shared responsive styles.

Optionally copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` for a future API. It defaults to `/api`. Vite environment variables are public; do not put secrets in them. No API requests are made by the current pages.

For production hosting, configure an SPA fallback to `index.html` so direct visits to `/dashboard` work.
