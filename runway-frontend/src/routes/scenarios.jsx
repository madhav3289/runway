import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ForecastChart } from "@/components/ForecastChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { pct, prettyDate, prettyDateFull, rupees, riskTone, labelCategory } from "@/lib/format";

export const Route = createFileRoute("/scenarios")({
  head: () => ({
    meta: [
      { title: "Saved scenarios — Runway" },
      { name: "description", content: "Compare the what-if scenarios you saved against your baseline forecast." },
      { property: "og:title", content: "Saved scenarios — Runway" },
      { property: "og:description", content: "Your saved what-if forecasts, side by side." },
    ],
  }),
  component: ScenariosPage,
});

const toneClass = { safe: "text-success", warn: "text-chart-4", danger: "text-destructive" };

function ScenariosPage() {
  const { isAuthed } = useRequireAuth();
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () =>
    api
      .scenarios()
      .then((res) => setList(res?.scenarios ?? res ?? []))
      .catch((err) => {
        handleApiError(err);
        setList([]);
      });

  useEffect(() => {
    if (!isAuthed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const open = async (id) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      const res = await api.scenario(id);
      setDetail(res?.scenario ?? res);
    } catch (err) {
      handleApiError(err);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteScenario(id);
      if (openId === id) {
        setOpenId(null);
        setDetail(null);
      }
      toast.success("Scenario deleted");
      load();
    } catch (err) {
      handleApiError(err);
    }
  };

  if (!isAuthed) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved scenarios</h1>
          <p className="text-sm text-muted-foreground">
            Scenarios you saved from the what-if panel on your forecast.
          </p>
        </div>

        {list === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              No saved scenarios yet. Adjust the sliders on your forecast and hit “Save scenario”.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {list.map((s) => {
              const prob = s.prob_zero ?? s.result?.prob_zero;
              const tone = riskTone(prob);
              return (
                <Card key={s.id}>
                  <CardHeader className="gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                    <div>
                      <CardTitle className="text-base">{s.name ?? "Scenario"}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        saved {prettyDateFull(s.created_at ?? s.saved_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-semibold tabular-nums ${toneClass[tone]}`}>
                        {prob === undefined || prob === null ? "—" : pct(prob)}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => open(s.id)}>
                        {openId === s.id ? "Hide" : "View"}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete scenario" onClick={() => remove(s.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  {openId === s.id ? (
                    <CardContent className="space-y-4 border-t border-border pt-4">
                      {!detail ? (
                        <Skeleton className="h-[280px] w-full" />
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {Object.entries(detail.multipliers ?? detail.inputs?.multipliers ?? {}).map(([k, v]) => (
                              <span key={k} className="rounded-full bg-accent px-2.5 py-1">
                                {labelCategory(k)} at {Math.round(v * 100)}%
                              </span>
                            ))}
                            {(detail.extra_events ?? detail.inputs?.extra_events ?? []).map((ev, i) => (
                              <span key={i} className="rounded-full bg-accent px-2.5 py-1">
                                {ev.label} {rupees(ev.amount_paise)} on {prettyDate(ev.date)}
                              </span>
                            ))}
                          </div>
                          {(detail.result ?? detail)?.p50 || (detail.result ?? detail)?.paths || (detail.result ?? detail)?.days ? (
                            <ForecastChart sim={detail.result ?? detail} />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Median end balance {rupees((detail.result ?? detail).end_balance_paise?.p50)} on{" "}
                              {prettyDate((detail.result ?? detail).end_date)}.
                            </p>
                          )}
                        </>
                      )}
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
