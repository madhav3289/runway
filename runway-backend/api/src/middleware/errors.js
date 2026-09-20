class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Express 4 does not catch rejected promises from async handlers; wrap them.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 2 MB)', code: 'FILE_TOO_LARGE' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body', code: 'BAD_JSON' });
  }
  if (err && err.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ error: 'Origin not allowed', code: 'CORS' });
  }
  // Never log request bodies: they can contain bank statements.
  console.error('Unhandled error:', err && err.message);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
};

module.exports = { HttpError, wrap, notFound, errorHandler };
