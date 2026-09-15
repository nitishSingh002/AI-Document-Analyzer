# AI Document Analyzer — Frontend

React + Vite + JavaScript frontend with React Router and Axios.

## Development

```sh
npm install
npm run dev
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Document analysis

After uploading a PDF, click **Analyze Document** to analyze its saved text. The Dashboard calls `POST /documents/:id/analyze` through the existing Axios instance and `VITE_API_BASE_URL`. It shows a loading state and errors, then AI Summary, Key Points, Document Type, and Important Entities alongside the extracted-text preview. File selection and upload are disabled during analysis to keep the result attached to the current document. The request timeout is 120 seconds.

Configure `GEMINI_API_KEY` only in the backend environment and restart the backend. No Gemini package or API key is used in the frontend. Analysis is persisted in MongoDB; this Dashboard currently displays documents uploaded in the current page session.

## Checks

```sh
npm run lint
npm run build
npm run preview
```

## Structure

- `src/components/Navbar.jsx`: shared navigation.
- `src/pages/Home.jsx`: landing page at `/`.
- `src/pages/Dashboard.jsx`: PDF selection, validation, Axios upload, loading/errors, and saved document preview at `/dashboard`.
- `src/services/api.js`: shared Axios instance with a 10-second timeout.
- `src/App.jsx`: application layout and routes, including a fallback page.
- `src/main.jsx`: React entry point and browser router.
- `src/index.css`: shared responsive styles.

Optionally copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` (for example, `http://localhost:5000/api`). It defaults to `/api`; the Vite development server proxies `/api` to `http://localhost:5000`. If the backend uses another port, set the base URL accordingly. Vite environment variables are public; do not put secrets in them.

Run the backend with MongoDB configured, open `/dashboard`, choose a PDF up to 10 MB, and click **Upload PDF**. The upload uses multipart field `file` and a 120-second request timeout. Success displays the original filename, local upload date, and the first 1,000 extracted characters. Scanned/image-only and password-protected PDFs are unsupported.

For production hosting, configure an SPA fallback to `index.html` so direct visits to `/dashboard` work. Proxy `/api` to the backend or build with an explicit `VITE_API_BASE_URL`; the development proxy is not included in the production build. Set backend `CLIENT_URL` to the frontend origin for cross-origin requests.
