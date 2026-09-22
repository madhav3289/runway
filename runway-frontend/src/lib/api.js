// Single place for every network call to the Runway API.
const RAW_BASE = import.meta.env.VITE_API_URL || "https://api-gamma-rosy-43.vercel.app/";
export const API_BASE = String(RAW_BASE).replace(/\/+$/, "");

const TOKEN_KEY = "runway_token";
let memoryToken = null;

export function getToken() {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  memoryToken = window.localStorage.getItem(TOKEN_KEY);
  return memoryToken;
}

export function setToken(token) {
  memoryToken = token || null;
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message || "Something went wrong");
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/* ---- "service is waking up" broadcast ---------------------------------- */
const wakeListeners = new Set();
export function onWaking(fn) {
  wakeListeners.add(fn);
  return () => wakeListeners.delete(fn);
}
function emitWaking(state) {
  wakeListeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_WAKE_RETRIES = 10;
const WAKE_DELAY_MS = 4000;

async function once(path, { method = "GET", body, formData, auth = true, signal } = {}) {
  const headers = {};
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Can't reach the forecasting service. Check your connection.", "NETWORK", 0);
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      data?.error || `Request failed (${res.status})`,
      data?.code || "UNKNOWN",
      res.status,
      data?.details,
    );
  }
  return data;
}

export async function request(path, opts = {}) {
  const retryOnWake = opts.retryOnWake !== false;
  let attempt = 0;
  for (;;) {
    try {
      const out = await once(path, opts);
      if (attempt > 0) emitWaking(false);
      return out;
    } catch (err) {
      const wakeable = err instanceof ApiError && (err.code === "SIM_UNAVAILABLE" || err.status === 503);
      if (!retryOnWake || !wakeable || attempt >= MAX_WAKE_RETRIES) {
        if (attempt > 0) emitWaking(false);
        throw err;
      }
      attempt += 1;
      emitWaking(true);
      await sleep(WAKE_DELAY_MS);
    }
  }
}

/* ---- shape helpers ------------------------------------------------------ */
// The API never returns bare arrays: list endpoints wrap rows in an object.
export const asArray = (x) => (Array.isArray(x) ? x : []);
const items = (data) => asArray(data?.items);

/* ---- endpoints ---------------------------------------------------------- */
export const api = {
  health: (deep = true) => request(`/api/health${deep ? "?deep=true" : ""}`, { auth: false, retryOnWake: false }),

  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: { email, password }, auth: false }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  demo: () => request("/api/auth/demo", { method: "POST", auth: false }),
  me: () => request("/api/auth/me"),

  uploadImport: (file, onProgress) => uploadWithProgress("/api/imports", file, onProgress),
  listImports: () => request("/api/imports").then(items),
  deleteImport: (id) => request(`/api/imports/${id}`, { method: "DELETE" }),

  // -> { items: [], page, limit, total }
  transactions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    });
    const q = qs.toString();
    return request(`/api/transactions${q ? `?${q}` : ""}`).then((data) => ({
      items: items(data),
      page: data?.page ?? 1,
      limit: data?.limit ?? 50,
      total: data?.total ?? items(data).length,
    }));
  },
  categories: () => request("/api/transactions/categories").then((d) => asArray(d?.categories)),
  patchTransaction: (id, patch) => request(`/api/transactions/${id}`, { method: "PATCH", body: patch }),

  // -> { has_data, by_category: [], monthly: [] }
  summary: (days = 90) =>
    request(`/api/summary?days=${days}`).then((d) => ({
      ...(d && typeof d === "object" ? d : {}),
      has_data: Boolean(d?.has_data),
      by_category: asArray(d?.by_category),
      monthly: asArray(d?.monthly),
    })),

  scheduledItems: () => request("/api/scheduled-items").then(items),
  createScheduledItem: (item) => request("/api/scheduled-items", { method: "POST", body: item }),
  updateScheduledItem: (id, patch) => request(`/api/scheduled-items/${id}`, { method: "PATCH", body: patch }),
  deleteScheduledItem: (id) => request(`/api/scheduled-items/${id}`, { method: "DELETE" }),

  simulate: (body = {}, signal) => request("/api/simulate", { method: "POST", body, signal }),
  backtest: (body = {}) => request("/api/backtest", { method: "POST", body }),

  scenarios: () => request("/api/scenarios").then(items),
  scenario: (id) => request(`/api/scenarios/${id}`),
  deleteScenario: (id) => request(`/api/scenarios/${id}`, { method: "DELETE" }),
};

// XHR so we can report upload progress.
function uploadWithProgress(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    const t = getToken();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else
        reject(
          new ApiError(data?.error || `Upload failed (${xhr.status})`, data?.code || "UNKNOWN", xhr.status, data?.details),
        );
    };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection.", "NETWORK", 0));
    xhr.send(form);
  });
}
