export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const candidate = error.status || error.statusCode
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ? candidate
    : 500

  if (status >= 500) console.error('Request failed:', error.message)

  const message = status >= 500 && !error.expose
    ? 'Internal server error'
    : error.type === 'entity.parse.failed'
      ? 'Invalid JSON request body'
      : error.message || 'Request failed'

  res.status(status).json({ status: 'error', message })
}
