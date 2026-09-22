import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { rupees, prettyDate, rupeeNumber } from "@/lib/format";

function BandTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-2 font-medium text-popover-foreground">{prettyDate(label)}</p>
      <p className="text-muted-foreground">
        Optimistic (p90): <span className="font-medium text-foreground">{rupees(row.p90 * 100)}</span>
      </p>
      <p className="text-muted-foreground">
        Middle (p50): <span className="font-medium text-foreground">{rupees(row.p50 * 100)}</span>
      </p>
      <p className="text-muted-foreground">
        Pessimistic (p10): <span className="font-medium text-foreground">{rupees(row.p10 * 100)}</span>
      </p>
    </div>
  );
}

export function ForecastChart({ sim }) {
  const bands = sim?.bands;
  if (!bands?.dates?.length) return null;
  const data = bands.dates.map((date, i) => ({
    date,
    p10: rupeeNumber(bands.p10[i]),
    p50: rupeeNumber(bands.p50[i]),
    p90: rupeeNumber(bands.p90[i]),
    span: rupeeNumber(bands.p90[i] - bands.p10[i]),
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={prettyDate}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            minTickGap={28}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => rupees(v * 100)}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            width={72}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<BandTooltip />} />
          <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area
            dataKey="span"
            stackId="band"
            stroke="none"
            fill="var(--color-primary)"
            fillOpacity={0.16}
            isAnimationActive={false}
          />
          <Line
            dataKey="p50"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={0} stroke="var(--color-destructive)" strokeDasharray="6 4" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskOverTimeChart({ sim }) {
  const cum = sim?.cumulative_prob_zero;
  const dates = sim?.bands?.dates;
  if (!cum?.length || !dates?.length) return null;
  const data = cum.map((p, i) => ({ date: dates[i] ?? String(i), risk: Math.round(p * 1000) / 10 }));
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={prettyDate}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            minTickGap={28}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v) => [`${v}%`, "Chance already below ₹0"]}
            labelFormatter={prettyDate}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Bar dataKey="risk" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
