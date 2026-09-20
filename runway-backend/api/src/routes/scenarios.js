const express = require('express');
const { query } = require('../db');
const { z, validate } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { denyDemoWrites } = require('../middleware/auth');

const router = express.Router();
const idParams = z.object({ id: z.coerce.number().int().positive() });

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, created_at,
            (result->>'prob_zero')::float AS prob_zero,
            result->>'median_zero_date'   AS median_zero_date,
            result->>'end_date'           AS end_date
       FROM scenarios WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.id],
  );
  return res.json({ items: rows });
}));

router.get('/:id', validate(idParams, 'params'), wrap(async (req, res) => {
  const { rows } = await query('SELECT id, name, params, result, created_at FROM scenarios WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Scenario not found', 'NOT_FOUND');
  return res.json(rows[0]);
}));

router.delete('/:id', denyDemoWrites, validate(idParams, 'params'), wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM scenarios WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Scenario not found', 'NOT_FOUND');
  return res.status(204).end();
}));

module.exports = router;
