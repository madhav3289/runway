const config = require('../config');
const { HttpError } = require('../middleware/errors');

async function callSim(path, { json, form, method = 'POST' } = {}) {
  const headers = {};
  if (config.simApiKey) headers['X-Sim-Key'] = config.simApiKey;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let res;
  try {
    res = await fetch(`${config.simUrl}${path}`, {
      method,
      headers,
      body,
      // Free-tier hosts sleep; the first request can take a while to wake the service.
      signal: AbortSignal.timeout(config.simTimeoutMs),
    });
  } catch {
    throw new HttpError(503, 'Simulation service is warming up or unavailable. Retry in a few seconds.', 'SIM_UNAVAILABLE');
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new HttpError(502, 'API and simulation service disagree on SIM_API_KEY', 'SIM_MISCONFIGURED');
  if (res.status >= 400 && res.status < 500) {
    throw new HttpError(422, data.error || 'The simulation service rejected the request', 'SIM_REJECTED');
  }
  if (res.status >= 500) throw new HttpError(502, 'Simulation service error', 'SIM_ERROR');
  return data;
}

const parseStatement = (buffer, filename) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  return callSim('/parse', { form });
};
const simulate = (payload) => callSim('/simulate', { json: payload });
const backtest = (payload) => callSim('/backtest', { json: payload });
const ping = () => callSim('/health', { method: 'GET' });

module.exports = { parseStatement, simulate, backtest, ping };
