import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { pct } from "@/lib/format";

export const Route = createFileRoute("/accuracy")({
  head: () => ({
    meta: [
      { title: "Model accuracy — Runway" },
      {
        name: "description",
        content: "How well Runway's past forecasts matched what actually happened to your balance.",
      },
      { property: "og:title", content: "Model accuracy — Runway" },
      { property: "og:description", content: "Backtested calibration of your cash-flow forecasts." },
    ],
  }),
  component: AccuracyPage,
});

function AccuracyPage() {
  const { isAuthed } = useRequireAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthed) return;
    setLoading(true);
    api
      .backtest({})
      .then(setResult)
      .catch(handleApiError)
      .finally(() => setLoading(false));
  }, [isAuthed]);

  const calibration = useMemo(() => {
    const src = result?.calibration ?? result?.bins ?? [];
    return src.map((b) => ({
      predicted: Math.round((b.predicted ?? b.forecast ?? b.bin ?? 0) * 100),
      actual: Math.round((b.actual ?? b.observed ?? 0) * 100),
      n: b.n ?? b.count ?? 0,
    }));
  }, [result]);

  if (!isAuthed) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Model accuracy</h1>
          <p className="text-sm text-muted-foreground">
            We replayed your history: forecast from an earlier date, then checked what actually happened.
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-[320px] w-full" />
          </div>
        ) : !result ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              Not enough history yet to check accuracy. Upload more of your statement and come back.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Forecasts checked"
                value={(result.n_windows ?? result.n ?? calibration.reduce((a, b) => a + b.n, 0)).toLocaleString("en-IN")}
                hint="historical windows replayed"
              />
              <StatCard
                label="Coverage of 80% band"
                value={result.coverage_80 !== undefined ? pct(result.coverage_80) : "—"}
                hint="ideally close to 80%"
              />
              <StatCard
                label="Median absolute error"
                value={
                  result.mae_paise !== undefined
                    ? `₹${Math.round(result.mae_paise / 100).toLocaleString("en-IN")}`
                    : result.brier_score !== undefined
                      ? result.brier_score.toFixed(3)
                      : "—"
                }
                hint={result.mae_paise !== undefined ? "on end balance" : "Brier score (lower is better)"}
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Predicted vs actual risk</CardTitle>
                <p className="text-xs text-muted-foreground">
                  A well-calibrated model sits near the dashed line: when it says 30%, it happens about 30% of the time.
                </p>
              </CardHeader>
              <CardContent>
                {calibration.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No calibration data available yet.
                  </p>
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={calibration} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="predicted"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          unit="%"
                          label={{ value: "Predicted risk", position: "insideBottom", offset: -4, fontSize: 12 }}
                        />
                        <YAxis tickLine={false} axisLine={false} fontSize={12} unit="%" domain={[0, 100]} />
                        <RTooltip formatter={(v) => `${v}%`} />
                        <ReferenceLine
                          segment={[
                            { x: 0, y: 0 },
                            { x: 100, y: 100 },
                          ]}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                        />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Accuracy is measured on your own history only, so it changes as you upload more data.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
