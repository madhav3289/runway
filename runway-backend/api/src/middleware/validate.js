const { z } = require('zod');
const { HttpError } = require('./errors');
const { isValidDate } = require('../dates');

const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(new HttpError(400, 'Invalid request', 'VALIDATION', details));
  }
  req[source] = parsed.data;
  return next();
};

const dateString = z.string().refine(isValidDate, 'Must be a valid date in YYYY-MM-DD format');
const paise = z.number().int().safe();

module.exports = { validate, dateString, paise, z };
