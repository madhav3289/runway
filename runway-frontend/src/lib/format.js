const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rupees(paise) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const value = Math.round(paise / 100);
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${inr.format(Math.abs(value))}`;
}

export function rupeeNumber(paise) {
  if (paise === null || paise === undefined) return null;
  return Math.round(paise / 100);
}

export function prettyDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function prettyDateFull(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function pct(value, digits = 0) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function labelCategory(key) {
  if (!key) return "Uncategorised";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function riskTone(prob) {
  if (prob === null || prob === undefined) return "safe";
  if (prob < 0.1) return "safe";
  if (prob <= 0.4) return "warn";
  return "danger";
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
