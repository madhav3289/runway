import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/auth";
import { longDate, pct, riskTone, rupees } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ForecastChart } from "@/components/ForecastChart";

export const Route = createFileRoute("/app/scenarios")({
  head: () => ({
    meta: [
      { title: "Saved scenarios — Runway" },
      { name: "description", content: "Revisit the what-if forecasts you saved in Runway." },
      { property: "og:title", content: "Saved scenarios — Runway" },
      { property: "og:description", content: "Your saved cash-flow what-ifs." },
    ],
  }),
  component: ScenariosPage,
});

const toneClass = {
  safe: "text-safe",
  warn: "text-warn",
  danger: "text-danger",
};

function ScenariosPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);

  const listQuery = useQuery({ queryKey: ["scenarios"], queryFn: () => api.scenarios() });
  const detailQuery = useQuery({
    queryKey: ["scenario", selectedId],
    queryFn: () => api.scenario(selectedId),
    enabled: selectedId !== null,
  });

  const removeMutation = useMutation({
    mutationFn: (id) => api.deleteScenario(id),
    onSuccess: (_data, id) => {
      toast.success("Scenario deleted");
      if (id === selectedId) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: toastApiError,
  });

  const items = listQuery.data?.items ?? [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saved scenarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every what-if you saved, with the risk it produced at the time.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {listQuery.isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No saved scenarios yet. Adjust the sliders on the dashboard and hit "Save scenario".
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3 transition-colors ${
                    selectedId === item.id ? "border-primary bg-accent/40" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={toneClass[riskTone(item.prob_zero)]}>
                        {pct(item.prob_zero)} risk
                      </span>{" "}
                      · saved {longDate(item.created_at)}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete scenario"
                    onClick={() => removeMutation.mutate(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {detail ? detail.name : "Pick a scenario"}
            </CardTitle>
            <CardDescription>
              {detail
                ? `Forecast to ${longDate(detail.result?.end_date)} · ${pct(detail.result?.prob_zero)} chance of running out`
                : "Its saved forecast appears here."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detailQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : detail?.result ? (
              <div className="space-y-4">
                <ForecastChart result={detail.result} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Median end balance" value={rupees(detail.result.end_balance_paise?.p50)} />
                  <Stat label="Pessimistic end (p10)" value={rupees(detail.result.end_balance_paise?.p10)} />
                  <Stat
                    label="Most likely zero date"
                    value={
                      detail.result.median_zero_date ? longDate(detail.result.median_zero_date) : "Never"
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Select a scenario from the list.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
