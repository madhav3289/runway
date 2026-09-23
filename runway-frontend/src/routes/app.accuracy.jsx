import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Gauge } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/auth";
import { compactRupees, longDate, pct, rupees } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/app/accuracy")({
  head: () => ({
    meta: [
      { title: "Model accuracy — Runway" },
      {
        name: "description",
        content: "Backtest Runway's forecasts against what actually happened in your past.",
      },
      { property: "og:title", content: "Model accuracy — Runway" },
      { property: "og:description", content: "How often reality landed inside the 80% band." },
    ],
  }),
  component: AccuracyPage,
});

function AccuracyPage() {
  const backtest = useMutation({
    mutationFn: () => api.backtest({}),
    onError: toastApiError,
  });

  const result = backtest.data;
  const lastWindow = result?.windows?.[result.windows.length - 1];

  const rows =
    lastWindow?.actual_change_paise?.map((actual, index) => ({
      day: index + 1,
      actual,
      p10: lastWindow.p10_change_paise[index],
      span: Math.max(0, lastWindow.p90_change_paise[index] - lastWindow.p10_change_paise[index]),
      p90: lastWindow.p90_change_paise[index],
    })) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Model accuracy</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            We replay the past: at several past dates, we forecast the next 30 days using only
            earlier data, then check how often reality landed inside the 80% band.
          </p>
        </div>
        <Button onClick={() => backtest.mutate()} disabled={backtest.isPending} className="shrink-0">
          {backtest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
          Run backtest
        </Button>
      </div>

      {backtest.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : !result ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Run a backtest to see how well the forecast has done on your own history.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Reality inside the band</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold tracking-tight text-primary">
                  {pct(result.day_coverage, 1)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target {pct(result.nominal_coverage)}
                </p>
              </CardContent>
            </Card>
            <StatCard label="Including one-off purchases" value={pct(result.day_coverage_with_outliers, 1)} />
            <StatCard label="Windows replayed" value={String(result.n_windows ?? "—")} />
            <StatCard
              label="Whole-path coverage"
              value={result.path_coverage !== undefined ? pct(result.path_coverage, 1) : "—"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most recent replay window</CardTitle>
              <CardDescription>
                {lastWindow
                  ? `Forecast made on ${longDate(lastWindow.cutoff)} for the following ${result.horizon_days} days. The band is the predicted change in balance; the line is what actually happened.`
                  : "No windows returned."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rows.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: "Days ahead", position: "insideBottom", offset: -2, fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={compactRupees}
                      width={62}
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) => `Day ${value}`}
                      formatter={(value, name) => [rupees(value), name]}
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area dataKey="p10" stackId="b" stroke="none" fill="transparent" name="p10" isAnimationActive={false} />
                    <Area
                      dataKey="span"
                      stackId="b"
                      stroke="none"
                      fill="var(--color-band)"
                      fillOpacity={0.18}
                      name="80% band"
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="actual"
                      stroke="var(--color-foreground)"
                      strokeWidth={2}
                      dot={false}
                      name="What actually happened"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
              {result.note ? (
                <p className="mt-4 text-xs text-muted-foreground">{result.note}</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
