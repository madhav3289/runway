import { useState } from "react";
import { Plus, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prettyCategory, rupees, shortDate, todayIso } from "@/lib/format";

export function WhatIfPanel({
  categories = [],
  multipliers,
  onMultiplierChange,
  extraEvents,
  onAddEvent,
  onRemoveEvent,
  onSave,
  onReset,
  saving = false,
  delta = null,
  dirty = false,
}) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("expense");

  const addEvent = (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!label.trim() || !Number.isFinite(value) || value <= 0) return;
    onAddEvent({
      label: label.trim(),
      date,
      amount_paise: Math.round(value * 100) * (kind === "income" ? 1 : -1),
    });
    setLabel("");
    setAmount("");
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">What if…</CardTitle>
        <CardDescription>
          Change your habits and see the risk move. Everything here is a simulation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {delta !== null && dirty ? (
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              delta < 0 ? "bg-safe/15 text-safe" : delta > 0 ? "bg-danger/15 text-danger" : "bg-muted"
            }`}
          >
            {delta === 0
              ? "No change vs baseline"
              : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)} pts risk vs baseline`}
          </div>
        ) : null}

        <div className="space-y-5">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No spending categories learned yet — upload a statement first.
            </p>
          ) : (
            categories.map((category) => {
              const value = multipliers[category] ?? 1;
              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="truncate text-sm">{prettyCategory(category)}</Label>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(value * 100)}% of usual
                    </span>
                  </div>
                  <Slider
                    value={[value]}
                    min={0}
                    max={1.5}
                    step={0.05}
                    onValueChange={([next]) => onMultiplierChange(category, next)}
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">Add one-off income or expense</p>
          {extraEvents.length > 0 ? (
            <ul className="space-y-1">
              {extraEvents.map((event, index) => (
                <li
                  key={`${event.label}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate">
                    {event.label} · {shortDate(event.date)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={event.amount_paise >= 0 ? "text-safe" : "text-foreground"}>
                      {event.amount_paise >= 0 ? "+" : ""}
                      {rupees(event.amount_paise)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveEvent(index)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="space-y-3" onSubmit={addEvent}>
            <Input
              placeholder="Concert ticket"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <Input
                type="number"
                min="1"
                placeholder="Amount ₹"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" variant="secondary">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </form>
        </div>

        <div className="flex gap-2 border-t border-border pt-5">
          <Button className="flex-1" onClick={onSave} disabled={saving || !dirty}>
            <Save className="h-4 w-4" /> Save scenario
          </Button>
          <Button variant="ghost" onClick={onReset} disabled={!dirty}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
