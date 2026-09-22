import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ForecastChart, RiskOverTimeChart } from "@/components/ForecastChart";
import { WhatIfPanel } from "@/components/WhatIfPanel";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { rupees, prettyDate, riskTone, pct } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Forecast — Runway" },
      { name: "description", content: "Your chance of running out of money before your next income, day by day." },
      { property: "og:title", content: "Forecast — Runway" },
      { property: "og:description", content: "Your chance of running out of money before your next income." },
    ],
  }),
  component: Dashboard,
});

const toneClass = { safe: "text-success", warn: "text-chart-4", danger: "text-destructive" };

function Dashboard() {
  const { isAuthed } = useRequireAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [sim, setSim] = useState(null);
  const [baselineProb, setBaselineProb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [multipliers, setMultipliers] = useState({});
  const [extraEvents, setExtraEvents] = useState([]);
  const dirty = useRef(false);

  useEffect(() => {
    if (!isAuthed) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([api.summary(90).catch(() => null), api.simulate({})])
      .then(([sum, base]) => {
        if (!alive) return;
        setSummary(sum);
        setSim(base);
        setBaselineProb(base.prob_zero);
      })
      .catch((err) => {
        if (err?.code === "NO_DATA") {
          toast.message("Upload a statement to get your first forecast");
          navigate({ to: "/data" });
          return;
        }
        handleApiError(err);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isAuthed, navigate]);

  // Debounced what-if recalculation.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const controller = new AbortController();
    setRecalculating(true);
    const id = setTimeout(() => {
      api
        .simulate({ multipliers, extra_events: extraEvents }, controller.signal)
        .then((res) => setSim(res))
        .catch((err) => handleApiError(err))
        .finally(() => setRecalculating(false));
    }, 300);
    return () => {
      clearTimeout(id);
      controller.abort();
      setRecalculating(false);
    };
  }, [multipliers, extraEvents]);

  const setMultiplier = useCallback((cat, value) => {
    dirty.current = true;
    setMultipliers((prev) => ({ ...prev, [cat]: value }));
  }, []);

  const addEvent = useCallback((ev) => {
    dirty.current = true;
    setExtraEvents((prev) => [...prev, ev]);
  }, []);

  const removeEvent = useCallback((idx) => {
    dirty.current = true;
    setExtraEvents((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const reset = useCallback(() => {
    dirty.current = true;
    setMultipliers({});
    setExtraEvents([]);
  }, []);

  const saveScenario = async () => {
    const name = window.prompt("Name this scenario", "Cut delivery by 20%");
    if (!name) return;
    setSaving(true);
    try {
      await api.simulate({ multipliers, extra_events: extraEvents, save_as: name });
      toast.success(`Saved "${name}"`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const categories = sim?.history?.categories ?? [];
  const tone = riskTone(sim?.prob_zero);
  const deltaPoints = useMemo(() => {
    if (baselineProb === null || !sim) return null;
    return Math.round((sim.prob_zero - baselineProb) * 100);
  }, [baselineProb, sim]);

  const avgDaily = useMemo(() => {
    const map = sim?.history?.avg_daily_spend_paise;
    if (!map) return null;
    return Object.values(map).reduce((a, b) => a + b, 0);
  }, [sim]);

  if (!isAuthed) return null;

  return (
    <AppShell>
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-[320px] w-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : !sim ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <Headline sim={sim} tone={tone} />
                {sim.low_confidence ? (
                  <div className="mt-4 flex gap-3 rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-4" />
                    <div>
                      <p className="font-medium">Low confidence forecast</p>
                      {(sim.warnings?.length ? sim.warnings : ["Less than 30 days of history."]).map((w) => (
                        <p key={w} className="text-muted-foreground">
                          {w}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">Balance forecast</CardTitle>
                  <p className="text-xs text-muted-foreground">80% of simulated futures fall in this band</p>
                </div>
                {recalculating ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Recalculating
                  </span>
                ) : null}
              </CardHeader>
              <CardContent className={recalculating ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <ForecastChart sim={sim} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Chance of having hit ₹0 by each day</CardTitle>
              </CardHeader>
              <CardContent>
                <RiskOverTimeChart sim={sim} />
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Current balance"
                value={rupees(summary?.balance?.paise ?? sim.starting_balance_paise)}
                hint={summary?.balance?.date ? `as of ${prettyDate(summary.balance.date)}` : undefined}
              />
              <StatCard
                label="Median end balance"
                value={rupees(sim.end_balance_paise?.p50)}
                hint={`on ${prettyDate(sim.end_date)}`}
              />
              <StatCard
                label="Average daily spend"
                value={avgDaily === null ? "—" : rupees(avgDaily)}
                hint={`learned from ${sim.history?.days_used ?? 0} days`}
              />
            </div>
          </div>

          <WhatIfPanel
            categories={categories}
            multipliers={multipliers}
            onMultiplierChange={setMultiplier}
            extraEvents={extraEvents}
            onAddEvent={addEvent}
            onRemoveEvent={removeEvent}
            onReset={reset}
            onSave={saveScenario}
            saving={saving}
            deltaPoints={deltaPoints}
          />
        </div>
      )}
    </AppShell>
  );
}

function Headline({ sim, tone }) {
  if (!sim.prob_zero) {
    return (
      <p className="text-2xl font-semibold leading-snug sm:text-3xl">
        <span className="text-success">Looking safe:</span> you ran out of money in none of the{" "}
        {sim.n_runs?.toLocaleString("en-IN")} simulated futures.
      </p>
    );
  }
  return (
    <p className="text-2xl font-semibold leading-snug sm:text-3xl">
      <span className={toneClass[tone]}>{pct(sim.prob_zero)} chance</span> you run out of money before{" "}
      {prettyDate(sim.end_date)}
      {sim.median_zero_date ? (
        <>
          , most likely around <span className={toneClass[tone]}>{prettyDate(sim.median_zero_date)}</span>
        </>
      ) : null}
      .
    </p>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-14 text-center">
        <Upload className="size-8 text-muted-foreground" />
        <div>
          <p className="text-lg font-medium">Upload a statement to get your first forecast</p>
          <p className="text-sm text-muted-foreground">We only need a CSV of your recent transactions.</p>
        </div>
        <Button asChild>
          <Link to="/data">Go to Data</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
