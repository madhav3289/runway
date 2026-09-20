const express = require('express');
const { query } = require('../db');
const { z, validate, dateString, paise } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { denyDemoWrites } = require('../middleware/auth');

const router = express.Router();
const COLS = 'id, label, kind, amount_paise, next_date, recurrence';
const MAX_ITEMS = 50;

const body = z.object({
  label: z.string().trim().min(1).max(60),
  kind: z.enum(['income', 'bill']),
  amount_paise: paise.positive().max(1_000_000_000_00), // up to Rs 100 crore, far above any real value
  next_date: dateString,
  recurrence: z.enum(['once', 'weekly', 'monthly']),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(`SELECT ${COLS} FROM scheduled_items WHERE user_id = $1 ORDER BY next_date, id`, [req.user.id]);
  return res.json({ items: rows });
}));

router.post('/', denyDemoWrites, validate(body), wrap(async (req, res) => {
  const count = await query('SELECT COUNT(*)::int AS n FROM scheduled_items WHERE user_id = $1', [req.user.id]);
  if (count.rows[0].n >= MAX_ITEMS) throw new HttpError(422, `You can have at most ${MAX_ITEMS} scheduled items`, 'LIMIT');
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO scheduled_items (user_id, label, kind, amount_paise, next_date, recurrence)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLS}`,
    [req.user.id, b.label, b.kind, b.amount_paise, b.next_date, b.recurrence],
  );
  return res.status(201).json(rows[0]);
}));

router.patch('/:id', denyDemoWrites, validate(idParams, 'params'),
  validate(body.partial().strict().refine((v) => Object.keys(v).length > 0, 'Provide at least one field')),
  wrap(async (req, res) => {
    const b = req.body;
    const { rows } = await query(
      `UPDATE scheduled_items SET
          label        = COALESCE($3, label),
          kind         = COALESCE($4, kind),
          amount_paise = COALESCE($5, amount_paise),
          next_date    = COALESCE($6::date, next_date),
          recurrence   = COALESCE($7, recurrence)
        WHERE id = $1 AND user_id = $2 RETURNING ${COLS}`,
      [req.params.id, req.user.id, b.label ?? null, b.kind ?? null, b.amount_paise ?? null, b.next_date ?? null, b.recurrence ?? null],
    );
    if (!rows[0]) throw new HttpError(404, 'Scheduled item not found', 'NOT_FOUND');
    return res.json(rows[0]);
  }));

router.delete('/:id', denyDemoWrites, validate(idParams, 'params'), wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM scheduled_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Scheduled item not found', 'NOT_FOUND');
  return res.status(204).end();
}));

module.exports = router;
