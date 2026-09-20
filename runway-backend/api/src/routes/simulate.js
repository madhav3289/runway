const express = require('express');
const { query } = require('../db');
const { z, validate, dateString, paise } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { runSimulation, runBacktest } = require('../services/simulationService');

const router = express.Router();

const simulateBody = z.object({
  end_date: dateString.optional(),
  horizon_days: z.number().int().min(1).max(180).default(45),
  starting_balance_paise: paise.optional(),
  history_days: z.number().int().min(7).max(365).default(90),
  n_runs: z.number().int().min(100).max(10000).default(2000),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(42),
  multipliers: z.record(z.string().max(40), z.number().min(0).max(5)).default({}),
  extra_events: z
    .array(z.object({ label: z.string().max(60).optional(), date: dateString, amount_paise: paise.refine((n) => n !== 0) }))
    .max(20)
    .default([]),
  save_as: z.string().trim().min(1).max(80).optional(),
});

router.post('/simulate', validate(simulateBody), wrap(async (req, res) => {
  if (req.body.save_as && req.user.isDemo) {
    throw new HttpError(403, 'The demo account is read-only. Create an account to save scenarios.', 'DEMO_READ_ONLY');
  }
  const result = await runSimulation(req.user.id, req.body);
  if (req.body.save_as) {
    const { save_as: name, ...params } = req.body;
    const { rows } = await query(
      'INSERT INTO scenarios (user_id, name, params, result) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, name, params, result],
    );
    return res.json({ ...result, scenario_id: rows[0].id });
  }
  return res.json(result);
}));

const backtestBody = z.object({
  horizon_days: z.number().int().min(7).max(90).default(30),
  step_days: z.number().int().min(1).max(60).default(7),
  min_history_days: z.number().int().min(7).max(180).default(21),
  history_days: z.number().int().min(7).max(365).default(90),
  n_runs: z.number().int().min(100).max(5000).default(1000),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(42),
});

router.post('/backtest', validate(backtestBody), wrap(async (req, res) => {
  res.json(await runBacktest(req.user.id, req.body));
}));

module.exports = router;
