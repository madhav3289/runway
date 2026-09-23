/**
 * Single place where every Runway API call lives.
 * Money is always integer paise. Dates are plain YYYY-MM-DD strings.
 */

const RAW_BASE = import.meta.env.VITE_API_URL || "https://api-gamma-rosy-43.vercel.app/";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

const TOKEN_KEY = "runway_token";
const USER_KEY = "runway_user";

let memoryToken = null;
let memoryUser = null;

export function getToken() {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  memoryToken = window.localStorage.getItem(TOKEN_KEY);
  return memoryToken;
}

export function getStoredUser() {
  if (memoryUser) return memoryUser;
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    memoryUser = JSON.parse(raw);
  } catch {
    memoryUser = null;
  }
  return memoryUser;
}

export function setSession(token, user) {
  memoryToken = token;
  memoryUser = user ?? null;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, token);
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  memoryToken = null;
  memoryUser = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
}

export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message || "Something went wrong");
    this.name = "ApiError";
    this.code = code || "UNKNOWN";
    this.status = status;
    this.details = details;
  }
}

/* ---- "the forecasting engine is waking up" broadcast ---------------- */

let wakingCount = 0;
const wakingListeners = new Set();

export function onWakingChange(listener) {
  wakingListeners.add(listener);
  listener(wakingCount > 0);
  return () => wakingListeners.delete(listener);
}

function setWaking(delta) {
  wakingCount = Math.max(0, wakingCount + delta);
  wakingListeners.forEach((l) => l(wakingCount > 0));
}

export function isWaking() {
  return wakingCount > 0;
}

/* ---- core request --------------------------------------------------- */

const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function once(path, { method = "GET", body, formData, auth = true } = {}) {
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError("Can't reach the Runway service. Check your connection.", "NETWORK", 0);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // The stored token is gone or expired: drop it so the app returns to sign-in.
    if (response.status === 401 && auth && getToken()) {
      clearSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("runway:signed-out"));
      }
    }
    throw new ApiError(
      data?.error || response.statusText,
      data?.code || String(response.status),
      response.status,
      data?.details,
    );
  }
  return data;
}

export async function request(path, options = {}) {
  let attempt = 0;
  let counted = false;
  try {
    for (;;) {
      try {
        return await once(path, options);
      } catch (error) {
        const wakingUp = error instanceof ApiError && error.code === "SIM_UNAVAILABLE";
        if (!wakingUp || attempt >= MAX_RETRIES) throw error;
        if (!counted) {
          counted = true;
          setWaking(1);
        }
        attempt += 1;
        await sleep(RETRY_DELAY_MS);
      }
    }
  } finally {
    if (counted) setWaking(-1);
  }
}

function query(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/* ---- endpoints ------------------------------------------------------ */

export const api = {
  health: (deep = true) => request(`/api/health${deep ? "?deep=true" : ""}`, { auth: false }),

  register: (email, password) =>
    request("/api/auth/register", { method: "POST", body: { email, password }, auth: false }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  demo: () => request("/api/auth/demo", { method: "POST", auth: false }),
  me: () => request("/api/auth/me"),

  uploadStatement: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/api/imports", { method: "POST", formData: form });
  },
  listImports: () => request("/api/imports"),
  deleteImport: (id) => request(`/api/imports/${id}`, { method: "DELETE" }),

  transactions: (params) => request(`/api/transactions${query(params)}`),
  transactionCategories: () => request("/api/transactions/categories"),
  updateTransaction: (id, patch) =>
    request(`/api/transactions/${id}`, { method: "PATCH", body: patch }),

  summary: (days = 90) => request(`/api/summary${query({ days })}`),

  scheduledItems: () => request("/api/scheduled-items"),
  createScheduledItem: (item) => request("/api/scheduled-items", { method: "POST", body: item }),
  updateScheduledItem: (id, patch) =>
    request(`/api/scheduled-items/${id}`, { method: "PATCH", body: patch }),
  deleteScheduledItem: (id) => request(`/api/scheduled-items/${id}`, { method: "DELETE" }),

  simulate: (params = {}) => request("/api/simulate", { method: "POST", body: params }),
  backtest: (params = {}) => request("/api/backtest", { method: "POST", body: params }),

  scenarios: () => request("/api/scenarios"),
  scenario: (id) => request(`/api/scenarios/${id}`),
  deleteScenario: (id) => request(`/api/scenarios/${id}`, { method: "DELETE" }),
};
