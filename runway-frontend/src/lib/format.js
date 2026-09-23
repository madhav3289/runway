const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Paise -> "₹1,23,456" (Indian grouping, no decimals). */
export function rupees(paise) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const value = Math.round(paise / 100);
  const sign = value < 0 ? "−" : "";
  return `${sign}₹${inr.format(Math.abs(value))}`;
}

/** Plain number of rupees, useful for chart axes. */
export function toRupees(paise) {
  return Math.round((paise ?? 0) / 100);
}

export function compactRupees(paise) {
  const value = Math.round((paise ?? 0) / 100);
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs}`;
}

/** "2026-11-03" -> "3 Nov" */
export function shortDate(iso) {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "2026-11-03" -> "3 Nov 2026" */
export function longDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const CATEGORY_LABELS = {
  upi_other: "Other UPI",
  emi: "EMI",
  uncategorised: "Uncategorised",
};

/** "food_delivery" -> "Food delivery" */
export function prettyCategory(category) {
  if (!category) return "Uncategorised";
  const key = String(category).toLowerCase();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function pct(value, digits = 0) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function riskTone(probZero) {
  if (probZero === null || probZero === undefined) return "safe";
  if (probZero < 0.1) return "safe";
  if (probZero <= 0.4) return "warn";
  return "danger";
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
