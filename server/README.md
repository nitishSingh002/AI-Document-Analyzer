# AI Document Analyzer API

## Authentication and document ownership

Set `JWT_SECRET` in `server/.env` to a randomly generated secret of at least 32 characters. Keep it private; `.env.example` intentionally contains only an empty placeholder. `JWT_EXPIRES_IN` defaults to `7d`. Set `CLIENT_URL=http://localhost:5173` for local development and use that same hostname in your browser. In production, set `NODE_ENV=production`, use HTTPS, and configure `CLIENT_URL` to the frontend origin. The frontend and API must use the same site for the SameSite=Lax cookie (a same-origin reverse proxy is suitable).

- `POST /api/auth/register`: `{ "name": "...", "email": "...", "password": "..." }`.
- `POST /api/auth/login`: `{ "email": "...", "password": "..." }`.
- `POST /api/auth/logout`: clears the session cookie.
- `GET /api/auth/me`: returns `{ "user": { "id", "name", "email", "createdAt" } }`, or 401.

Registration and login return the same public user shape and set an HTTP-only session cookie. JWTs are never returned in JSON or stored in browser storage. Passwords require at least 8 characters, at most 72 UTF-8 bytes, and are hashed with bcrypt at cost 12. Emails are normalized and have a unique MongoDB index. Ensure the User email index is created if automatic index creation is disabled in a deployment.

All document routes require this cookie. Database reads and writes filter by authenticated owner; another user's document and an ownerless document both return 404. Existing development documents are **not assigned automatically**: reupload them after registering. No old documents are deleted by this change. Credentialed CORS uses the configured frontend origin, and mutation requests with a different Origin are rejected.

Cookie options follow the [Express cookie API](https://expressjs.com/en/4x/api/response/#res.cookie). For command-line requests, log in with a cookie jar (`curl -c cookies.txt ...`) and send it with `curl -b cookies.txt ...` on document requests. Do not commit cookie jars.

## Document management

`DELETE /api/documents/:id` deletes the authenticated owner's complete document, including embedded analysis and chat history, and returns 204. `PATCH /api/documents/:id` accepts only `{ "name": "New display name" }` and returns `{ "id", "originalName", "displayName" }`. Names are trimmed and must contain 1–200 characters. Rename changes only `displayName`; original filename, extracted text, analysis, and chat remain unchanged. List and detail responses include `displayName` when set.

Both operations return 400 for invalid IDs (or invalid rename bodies), 401 without authentication, 404 for missing, ownerless, or another user's documents, and 503 for database failures. Delete uses one owner-filtered database operation; there are no separate chat or analysis records to clean up.

The Dashboard uses history/main/chat columns on large screens, a collapsible history panel above main/chat on tablets, and history/main/chat stacking on mobile. History offers Rename and Delete, with confirmation before deletion. Deleting the selected document clears its analysis and chat panels.

## Chat with a document

`POST /api/documents/:id/ask` accepts `{ "question": "What was annual revenue?" }` and returns `{ "answer": "...", "sources": [{ "chunkIndex": 0, "preview": "..." }] }`. Questions must be non-empty strings of at most 2,000 characters. Chunk indexes are zero-based; previews contain at most 300 characters.

Uploads extract text and split it into 220-word chunks with 40-word overlap. Each chunk is embedded separately with `gemini-embedding-2` at 768 dimensions, using at most four concurrent requests, and stored in MongoDB alongside its text and index. `GEMINI_EMBEDDING_MODEL` defaults to `gemini-embedding-2`; an explicitly blank value is rejected. Answer generation still uses `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL`.

Each question generates one query embedding. Node.js computes cosine similarity against stored chunk vectors and passes only the top four chunk texts to Gemini. Sources preview those same chunks; they are retrieved context, not verified per-sentence citations. Gemini must state when the context does not support an answer. Responses retain the existing `{ answer, sources }` shape.

Legacy documents lazily generate and save embeddings from `extractedText` before their first answer. Stored vectors are reused on later questions. Invalid or incomplete vectors, or a changed recorded embedding model, trigger regeneration. The embedding service validates vector dimensions and finite, nonzero values. Transient 429/5xx failures use the existing bounded backoff; permanent 400/401/403 failures are not retried. Embeddings never fall back to an answer-generation model. Embedding or persistence failures return safe errors and do not append chat history. New uploads are saved only after all embeddings succeed.

Errors use the existing error envelope: 400 for invalid IDs/questions, 401 for missing/expired authentication, 404 for missing or inaccessible documents, 422 for missing extracted text, 503 for database/configuration failures, and 502 for Gemini failures or malformed/incomplete answers. Chat never logs provider errors, question text, or document context. `GEMINI_API_KEY` stays on the server. Successful question/answer pairs and source previews are appended atomically to the document's chat history; failed answers are not saved. `GET /api/documents/:id/chat` returns the owner's saved conversation.

The Dashboard shows document history on the left, analysis in the middle, and a scrollable chat panel on the right on large screens. Reopening a document restores its analysis and saved conversation. Existing upload and analysis features remain available. Tests cover authenticated endpoints, ownership isolation, validation, retrieval, provider failures, persistence, and safe error handling with mocked MongoDB and Gemini.

## AI document analysis

Set `GEMINI_API_KEY` in `server/.env` and restart the backend. The key is read only on the server; never use a `VITE_` variable for it. Optional `GEMINI_MODEL` defaults to `gemini-3.6-flash`; `GEMINI_FALLBACK_MODEL` defaults to `gemini-3.5-flash-lite`. Overrides must support generateContent and structured JSON output. PDF uploads and chat require a Gemini key because they generate embeddings.

Analysis and chat share `requestGemini()` in `services/aiService.js`. It retries HTTP 429 and 500-599 failures up to three times after the initial primary request, with exponential delays of 1, 2, and 4 seconds plus/minus 20% random jitter. After transient failures exhaust the primary attempts, it makes one request to the fallback model. There are at most five requests overall; a fallback identical to the primary is skipped. Permanent errors (including 400, 401, and 403), errors without a recognized transient status, and malformed responses are not retried and do not trigger fallback. SDK retries are disabled to prevent multiplying attempts. Both paths retain their existing generic frontend errors if requests fail.

Each completed attempt logs only the model, retry number (0 for the initial attempt on each model), HTTP status (or null if unknown), and fallback flag. Provider messages, request bodies, keys, and complete document contents are never logged by the helper. Reliability tests mock the provider and sleep function, so no live API calls or backoff delays are needed. The existing 90-second per-attempt SDK timeout and 120-second browser timeout remain; unusually slow repeated failures can outlast the browser timeout.

`POST /api/documents/:id/analyze` requires no request body. It reads the existing document text, calls Gemini, and saves the validated analysis to MongoDB. It never uploads the PDF again. HTTP 200 returns `{ "id": "...", "analysis": { "summary": "...", "keyPoints": ["..."], "documentType": "report", "entities": ["..."], "analyzedAt": "..." } }`.

Flow: `documentRoutes` → `documentController` → `documentService` → `aiService` → Gemini → MongoDB update. `services/aiService.js` uses the official `@google/genai` SDK's `models.generateContent()` with `responseMimeType: application/json` and `responseJsonSchema` generated using Zod 4's `z.toJSONSchema()` to request exactly four fields, including 5–8 key points. The server supplies `analyzedAt` after successful analysis. See [Gemini Structured Outputs documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

The complete extracted text is sent as document data with instructions to ignore embedded commands. Each attempt uses a 90-second SDK timeout and at most 8,192 output tokens, including any thinking tokens. The schema-constrained JSON response is decoded with `JSON.parse` and validated with the existing strict Zod schema. No markdown stripping or arbitrary-text recovery is used. Blocked, missing, and incomplete candidates are rejected before saving. Text is not silently truncated: context-limit errors return 422. This version does not split long documents into multiple requests. Reanalysis replaces saved analysis only after a complete valid response; a failed attempt leaves previous analysis intact.

Errors return the existing JSON error envelope: 400 for invalid IDs, 404 for missing/deleted documents, 422 for empty text or context limits, 503 for missing server configuration or database errors, and 502 for Gemini failures, refusals, incomplete responses, or invalid output. Provider details and credentials are not returned to the browser.

`tests/documentAnalysis.test.js` covers endpoint success, request schema, Gemini schema configuration and Zod validation, and the error paths using mocked Gemini calls and database operations. `npm test` does not incur Gemini charges or write to MongoDB. A live smoke test requires configured Gemini and MongoDB credentials: upload a text-based PDF and click **Analyze Document** on the Dashboard.

Node.js and Express backend using JavaScript ES modules and Mongoose.

## Run locally

```sh
npm install
```

Copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB connection string when available. Defaults are port `5000` and frontend origin `http://localhost:5173`.

```sh
npm run dev
```

Use `npm start` for production and `npm run check` for JavaScript syntax checks. There is no compilation/build step. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

An empty `MONGODB_URI` allows the API to start without MongoDB and prints a warning. A configured URI must connect successfully before the HTTP server starts; a failed connection exits with an error. Configure a real URI for deployments that need a database.

## Structure and request flow

- `server.js`: connects to MongoDB, starts HTTP, and handles shutdown.
- `app.js`: configures Express, CORS, JSON parsing, routes, and error middleware.
- `config/env.js`: loads the server-local `.env` and validates the port.
- `config/db.js`: Mongoose connection setup.
- `routes/healthRoutes.js`: maps `GET /api/health` to its controller.
- `controllers/healthController.js`: returns API health and database connection state.
- `middleware/notFound.js`: forwards unmatched requests as 404 errors.
- `middleware/errorHandler.js`: returns consistent JSON errors and hides internal error details.
- `routes/documentRoutes.js`: maps uploads through Multer to the controller.
- `middleware/uploadPdf.js`: validates one PDF, its MIME type, extension, and 10 MB limit using memory storage.
- `controllers/documentController.js`: returns saved metadata and a preview, and releases the upload buffer.
- `services/documentService.js`: extracts PDF text, destroys parser resources, rejects empty text, and saves through Mongoose.
- `models/Document.js`: stores originalName, fileName, mimeType, size, extractedText, and createdAt.
- `utils/HttpError.js`: intentional HTTP errors with safe client-facing messages.
- `scripts/check.js`: checks all backend JavaScript syntax, excluding dependencies.
- `tests/documentUpload.test.js`: HTTP upload tests with actual PDF parsing and mocked database writes.

Requests pass through CORS and JSON parsing, then the matching route and controller. Unmatched routes reach the 404 middleware. Parsing errors and forwarded errors reach the final error handler.

`GET /api/health` returns HTTP 200 when the API is running:

```json
{
  "status": "ok",
  "message": "AI Document Analyzer API is running",
  "database": "disconnected"
}
```

This endpoint reports API liveness, not database readiness. `database` changes to `connected` after a successful MongoDB connection.

CORS allows the browser origin in `CLIENT_URL`; it is not authentication. The frontend's `VITE_API_BASE_URL` can be set to `http://localhost:5000/api`.

## PDF upload

Use Node.js 22.13+ (or a newer compatible supported release) and configure MongoDB in `MONGODB_URI`. Uploading without an available database returns 503 without buffering the write.

`POST /api/documents/upload` accepts `multipart/form-data` with exactly one file in the `file` field. Both the `.pdf` extension (case-insensitive) and `application/pdf` MIME type are required. Maximum size is 10 × 1024 × 1024 bytes.

```sh
curl -b cookies.txt -F "file=@document.pdf;type=application/pdf" http://localhost:5000/api/documents/upload
```

HTTP 201 response:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "originalName": "document.pdf",
  "size": 2048,
  "extractedTextPreview": "The first 1,000 characters of extracted text...",
  "createdAt": "2026-09-15T10:00:00.000Z"
}
```

Multer keeps the upload in memory and pdf-parse reads its buffer. No PDF is written to disk, so no temporary files need removal. Parser resources are destroyed after extraction. `fileName` is a generated UUID-based metadata name; it does not refer to a retained file. MongoDB stores the full extracted text.

Errors use `{ "status": "error", "message": "..." }`: 400 for missing files or invalid multipart fields, 415 for invalid MIME type/extension, 413 for files exceeding 10 MB, 422 for unreadable/password-protected PDFs or empty text, and 503 for database write failures. Image-only/scanned PDFs require OCR, which this feature does not implement.

Run `npm run check` and `npm test`. Tests exercise actual HTTP multipart uploads and PDF extraction, plus schema validation and simulated database success/failure. They do not write to a live MongoDB database.
