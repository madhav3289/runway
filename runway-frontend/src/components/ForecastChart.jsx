import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactRupees, rupees, shortDate } from "@/lib/format";

function buildRows(result) {
  const bands = result?.bands;
  if (!bands?.dates?.length) return [];
  return bands.dates.map((date, index) => {
    const p10 = bands.p10[index];
    const p90 = bands.p90[index];
    return {
      date,
      p10,
      p50: bands.p50[index],
      p90,
      band: [Math.min(p10, p90), Math.max(p10, p90)],
    };
  });
}

function BandTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{shortDate(label)}</p>
      <p className="text-muted-foreground">Optimistic (p90): {rupees(row.p90)}</p>
      <p className="text-popover-foreground">Middle (p50): {rupees(row.p50)}</p>
      <p className="text-muted-foreground">Pessimistic (p10): {rupees(row.p10)}</p>
    </div>
  );
}

export function ForecastChart({ result, loading = false }) {
  const rows = buildRows(result);
  if (!rows.length) return null;

  return (
    <div className={`transition-opacity ${loading ? "opacity-50" : "opacity-100"}`}>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={28}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => compactRupees(value)}
            width={62}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<BandTooltip />} />
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--color-band)"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <ReferenceLine y={0} stroke="var(--color-danger)" strokeDasharray="6 4" />
          <Line
            dataKey="p50"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        80% of simulated futures fall in this band. The dashed line is zero balance.
      </p>
    </div>
  );
}

export function RiskOverTimeChart({ result }) {
  const dates = result?.bands?.dates ?? [];
  const series = result?.cumulative_prob_zero ?? [];
  if (!dates.length || !series.length) return null;
  const rows = dates.map((date, index) => ({ date, risk: (series[index] ?? 0) * 100 }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          minTickGap={28}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value) => `${Math.round(value)}%`}
          width={44}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toFixed(1)}%`, "Risk by this day"]}
          labelFormatter={shortDate}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          dataKey="risk"
          stroke="var(--color-warn)"
          fill="var(--color-warn)"
          fillOpacity={0.18}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
