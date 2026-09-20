const express = require('express');
const { query } = require('../db');
const { z, validate, dateString } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { denyDemoWrites } = require('../middleware/auth');

const router = express.Router();

// Mirrors sim/categorize.py so the UI can offer a dropdown without calling the sim service.
const STANDARD_CATEGORIES = [
  'bills', 'cash', 'emi', 'entertainment', 'food_delivery', 'groceries', 'income', 'refund',
  'rent', 'shopping', 'subscriptions', 'transport', 'uncategorised', 'upi_other',
];

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const listQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  category: z.string().max(40).optional(),
  is_transfer: bool.optional(),
  is_outlier: bool.optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get('/categories', wrap(async (req, res) => {
  const { rows } = await query('SELECT DISTINCT category FROM transactions WHERE user_id = $1', [req.user.id]);
  const all = new Set([...STANDARD_CATEGORIES, ...rows.map((r) => r.category)]);
  return res.json({ categories: [...all].sort() });
}));

router.get('/', validate(listQuery, 'query'), wrap(async (req, res) => {
  const f = req.query;
  const where = ['user_id = $1'];
  const params = [req.user.id];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };
  if (f.from) add('txn_date >= ?::date', f.from);
  if (f.to) add('txn_date <= ?::date', f.to);
  if (f.category) add('category = ?', f.category);
  if (f.is_transfer !== undefined) add('is_transfer = ?', f.is_transfer);
  if (f.is_outlier !== undefined) add('is_outlier = ?', f.is_outlier);
  if (f.q) add("description ILIKE ? ESCAPE '\\'", `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);

  const whereSql = where.join(' AND ');
  const total = await query(`SELECT COUNT(*)::int AS n FROM transactions WHERE ${whereSql}`, params);
  params.push(f.limit, (f.page - 1) * f.limit);
  const { rows } = await query(
    `SELECT id, txn_date, description, amount_paise, balance_paise, category, is_transfer, is_outlier, import_id
       FROM transactions WHERE ${whereSql}
      ORDER BY txn_date DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return res.json({ items: rows, page: f.page, limit: f.limit, total: total.rows[0].n });
}));

const idParams = z.object({ id: z.coerce.number().int().positive() });
const patchBody = z
  .object({
    category: z.string().trim().toLowerCase().regex(/^[a-z_]{1,40}$/, 'lowercase letters and underscores only').optional(),
    is_transfer: z.boolean().optional(),
    is_outlier: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

router.patch('/:id', denyDemoWrites, validate(idParams, 'params'), validate(patchBody), wrap(async (req, res) => {
  const { category, is_transfer: isTransfer, is_outlier: isOutlier } = req.body;
  const { rows } = await query(
    `UPDATE transactions SET
        category    = COALESCE($3, category),
        is_transfer = COALESCE($4, is_transfer),
        is_outlier  = COALESCE($5, is_outlier)
      WHERE id = $1 AND user_id = $2
      RETURNING id, txn_date, description, amount_paise, balance_paise, category, is_transfer, is_outlier`,
    [req.params.id, req.user.id, category ?? null, isTransfer ?? null, isOutlier ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'Transaction not found', 'NOT_FOUND');
  return res.json(rows[0]);
}));

module.exports = router;
