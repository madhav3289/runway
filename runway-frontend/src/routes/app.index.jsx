import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { toastApiError } from "@/lib/auth";
import { longDate, pct, riskTone, rupees, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ForecastChart, RiskOverTimeChart } from "@/components/ForecastChart";
import { WhatIfPanel } from "@/components/WhatIfPanel";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Forecast — Runway" },
      {
        name: "description",
        content: "Your chance of running out of money before your next income, and when.",
      },
      { property: "og:title", content: "Forecast — Runway" },
      { property: "og:description", content: "Cash-flow risk forecast from your own spending." },
    ],
  }),
  component: Dashboard,
});


const toneClass = {
  safe: "text-safe",
  warn: "text-warn",
  danger: "text-danger",
};

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [multipliers, setMultipliers] = useState({});
  const [extraEvents, setExtraEvents] = useState([]);
  const [debounced, setDebounced] = useState({ multipliers: {}, extraEvents: [] });

  const summaryQuery = useQuery({ queryKey: ["summary", 90], queryFn: () => api.summary(90) });

  const baselineQuery = useQuery({
    queryKey: ["simulate", "baseline"],
    queryFn: () => api.simulate({}),
    retry: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({ multipliers, extraEvents });
    }, 300);
    return () => clearTimeout(timer);
  }, [multipliers, extraEvents]);

  const activeMultipliers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(debounced.multipliers).filter(([, value]) => Math.abs(value - 1) > 0.001),
      ),
    [debounced.multipliers],
  );

  const dirty = Object.keys(activeMultipliers).length > 0 || debounced.extraEvents.length > 0;

  const whatIfQuery = useQuery({
    queryKey: ["simulate", "whatif", activeMultipliers, debounced.extraEvents],
    queryFn: () =>
      api.simulate({ multipliers: activeMultipliers, extra_events: debounced.extraEvents }),
    enabled: dirty && Boolean(baselineQuery.data),
    placeholderData: (previous) => previous,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (name) =>
      api.simulate({
        multipliers: activeMultipliers,
        extra_events: debounced.extraEvents,
        save_as: name,
      }),
    onSuccess: () => {
      toast.success("Scenario saved");
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: toastApiError,
  });

  const error = baselineQuery.error;

  useEffect(() => {
    if (error instanceof ApiError && error.code === "NO_DATA") {
      navigate({ to: "/app/data" });
    } else if (error) {
      toastApiError(error);
    }
  }, [error, navigate]);

  const whatIfError = whatIfQuery.error;
  useEffect(() => {
    if (whatIfError) toastApiError(whatIfError);
  }, [whatIfError]);

  const baseline = baselineQuery.data;
  const result = dirty && whatIfQuery.data ? whatIfQuery.data : baseline;
  const recalculating = whatIfQuery.isFetching;

  const delta =
    dirty && whatIfQuery.data && baseline
      ? (whatIfQuery.data.prob_zero - baseline.prob_zero) * 100
      : null;

  const categories = baseline?.history?.categories ?? [];
  const avgDailySpend = useMemo(() => {
    const map = result?.history?.avg_daily_spend_paise ?? {};
    return Object.values(map).reduce((total, value) => total + (value ?? 0), 0);
  }, [result]);

  if (baselineQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!baseline) {
    return (
      <Card>
        <CardContent className="py-20 text-center">
          <h2 className="text-lg font-semibold">Upload a statement to get your first forecast</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Runway needs a few weeks of transactions before it can simulate your future balance.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/app/data">Go to Data</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tone = riskTone(result?.prob_zero);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-8">
          {result?.prob_zero ? (
            <p className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
              <span className={toneClass[tone]}>{pct(result.prob_zero)} chance</span> you run out of
              money before {shortDate(result.end_date)}
              {result.median_zero_date
                ? `, most likely around ${shortDate(result.median_zero_date)}`
                : ""}
              .
            </p>
          ) : (
            <p className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
              <span className="text-safe">Looking safe:</span> you ran out of money in none of the{" "}
              {result?.n_runs?.toLocaleString("en-IN")} simulated futures.
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            Based on {result?.history?.days_used} days of spending, forecast to{" "}
            {longDate(result?.end_date)}.
          </p>
        </CardContent>
      </Card>

      {result?.low_confidence ? (
        <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <div className="min-w-0 text-sm text-foreground">
            <p className="font-medium">Low confidence forecast</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {(result.warnings?.length ? result.warnings : ["Not much history to learn from yet."]).map(
                (warning) => (
                  <li key={warning}>{warning}</li>
                ),
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Current balance"
          value={
            summaryQuery.data?.has_data
              ? rupees(summaryQuery.data.balance?.paise)
              : rupees(result?.starting_balance_paise)
          }
          hint={
            summaryQuery.data?.has_data ? `as of ${shortDate(summaryQuery.data.balance?.date)}` : null
          }
        />
        <StatCard
          label="Median end balance"
          value={rupees(result?.end_balance_paise?.p50)}
          hint={`on ${shortDate(result?.end_date)}`}
        />
        <StatCard
          label="Average daily spend"
          value={rupees(avgDailySpend)}
          hint="learned from your history"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Balance forecast</CardTitle>
                <CardDescription>Daily balance from {shortDate(result?.start_date)}</CardDescription>
              </div>
              {recalculating ? (
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recalculating
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              <ForecastChart result={result} loading={recalculating} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk builds up over time</CardTitle>
              <CardDescription>
                Chance you have already dipped below zero by each day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RiskOverTimeChart result={result} />
            </CardContent>
          </Card>
        </div>

        <WhatIfPanel
          categories={categories}
          multipliers={multipliers}
          onMultiplierChange={(category, value) =>
            setMultipliers((current) => ({ ...current, [category]: value }))
          }
          extraEvents={extraEvents}
          onAddEvent={(event) => setExtraEvents((current) => [...current, event])}
          onRemoveEvent={(index) =>
            setExtraEvents((current) => current.filter((_, i) => i !== index))
          }
          onSave={() => {
            const name = window.prompt("Name this scenario", "Cut delivery by 20%");
            if (name) saveMutation.mutate(name);
          }}
          onReset={() => {
            setMultipliers({});
            setExtraEvents([]);
          }}
          saving={saveMutation.isPending}
          delta={delta}
          dirty={dirty}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
