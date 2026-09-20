const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const config = require('../config');
const { z, validate } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { denyDemoWrites } = require('../middleware/auth');
const { importStatement } = require('../services/importService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

router.post('/', denyDemoWrites, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Attach a CSV file as multipart field 'file'", 'NO_FILE');
  if (!/\.csv$/i.test(req.file.originalname)) throw new HttpError(400, 'Only .csv files are supported', 'BAD_FILE_TYPE');
  const result = await importStatement(req.user.id, req.file.originalname, req.file.buffer);
  return res.status(201).json(result);
}));

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, filename, row_count, inserted_count, closing_balance_paise, closing_balance_date, created_at
       FROM imports WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id],
  );
  return res.json({ items: rows });
}));

const idParams = z.object({ id: z.coerce.number().int().positive() });

// Deleting an import removes the transactions it created (FK ON DELETE CASCADE)
router.delete('/:id', denyDemoWrites, validate(idParams, 'params'), wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM imports WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Import not found', 'NOT_FOUND');
  return res.status(204).end();
}));

module.exports = router;
