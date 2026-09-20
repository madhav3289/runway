const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (s) =>
  typeof s === 'string' && DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const addDays = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

const diffDays = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);

module.exports = { isValidDate, addDays, diffDays };
