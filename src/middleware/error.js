export function notFound(req, res) {
  console.warn(`[http 404] Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = err.status || (err.name === "ZodError" ? 422 : 500);

  if (err.name === "ZodError") {
    console.error(`[validation error] ${req.method} ${req.originalUrl}:`, JSON.stringify(err.errors, null, 2));
  } else {
    console.error(`[error ${status}] ${req.method} ${req.originalUrl}:`, err.stack || err.message || err);
  }

  res.status(status).json({
    error: err.name === "ZodError" ? "Validation failed" : err.message || "Server error",
    details: err.name === "ZodError" ? err.errors : undefined,
  });
}

/** Wraps async route handlers so rejections reach errorHandler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

