import { useState } from "react";
import { Plus, Trash2, RotateCcw, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { labelCategory, rupees, prettyDate, todayIso } from "@/lib/format";

export function WhatIfPanel({
  categories,
  multipliers,
  onMultiplierChange,
  extraEvents,
  onAddEvent,
  onRemoveEvent,
  onReset,
  onSave,
  saving,
  deltaPoints,
}) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [isIncome, setIsIncome] = useState(true);

  const submit = (e) => {
    e.preventDefault();
    const rupeeValue = Number(amount);
    if (!label.trim() || !date || !rupeeValue) return;
    const paise = Math.round(Math.abs(rupeeValue) * 100) * (isIncome ? 1 : -1);
    onAddEvent({ label: label.trim(), date, amount_paise: paise });
    setLabel("");
    setAmount("");
  };

  return (
    <Card className="lg:sticky lg:top-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">What if…</CardTitle>
        {deltaPoints !== null && deltaPoints !== undefined ? (
          <p className={`text-sm font-medium ${deltaPoints < 0 ? "text-success" : deltaPoints > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {deltaPoints > 0 ? "+" : deltaPoints < 0 ? "−" : ""}
            {Math.abs(deltaPoints)} pts risk vs baseline
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Drag a slider to see the effect on your risk.</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending categories learned yet.</p>
          ) : null}
          {categories.map((cat) => {
            const value = multipliers[cat] ?? 1;
            return (
              <div key={cat}>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span>{labelCategory(cat)}</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(value * 100)}% of usual</span>
                </div>
                <Slider
                  value={[value]}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onValueChange={(v) => onMultiplierChange(cat, v[0])}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">Add one-off income or expense</p>
          {extraEvents.length > 0 ? (
            <ul className="space-y-1.5">
              {extraEvents.map((ev, i) => (
                <li key={`${ev.label}-${i}`} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
                  <span className="truncate">
                    {ev.label} · {prettyDate(ev.date)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`tabular-nums ${ev.amount_paise >= 0 ? "text-success" : "text-destructive"}`}>
                      {rupees(ev.amount_paise)}
                    </span>
                    <button type="button" onClick={() => onRemoveEvent(i)} aria-label="Remove">
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ev-label" className="text-xs">
                  Label
                </Label>
                <Input id="ev-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Weekend shift" />
              </div>
              <div>
                <Label htmlFor="ev-date" className="text-xs">
                  Date
                </Label>
                <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="ev-amount" className="text-xs">
                  Amount (₹)
                </Label>
                <Input
                  id="ev-amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="3000"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="ev-kind" checked={isIncome} onCheckedChange={setIsIncome} />
                <Label htmlFor="ev-kind" className="text-xs">
                  {isIncome ? "Income" : "Expense"}
                </Label>
              </div>
            </div>
            <Button type="submit" variant="secondary" className="w-full">
              <Plus className="size-4" /> Add to forecast
            </Button>
          </form>
        </div>

        <div className="flex gap-2 border-t border-border pt-5">
          <Button onClick={onSave} disabled={saving} className="flex-1">
            <Save className="size-4" /> Save scenario
          </Button>
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
