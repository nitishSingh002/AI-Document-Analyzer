# AI Document Analyzer API

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
- `models/`, `services/`, `utils/`: reserved for future schemas, business logic, and shared helpers.

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

CORS allows the browser origin in `CLIENT_URL`; it is not authentication. To connect the existing frontend later, its `VITE_API_BASE_URL` can be set to `http://localhost:5000/api`.
