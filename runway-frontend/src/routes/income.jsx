import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { rupees, prettyDate, todayIso } from "@/lib/format";

export const Route = createFileRoute("/income")({
  head: () => ({
    meta: [
      { title: "Income & bills — Runway" },
      { name: "description", content: "Tell Runway about the income and bills you already know are coming." },
      { property: "og:title", content: "Income & bills — Runway" },
      { property: "og:description", content: "Scheduled income and bills feed straight into your forecast." },
    ],
  }),
  component: IncomePage,
});

const EMPTY = { label: "", kind: "income", amount: "", next_date: todayIso(), recurrence: "monthly" };

function IncomePage() {
  const { isAuthed } = useRequireAuth();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .scheduledItems()
      .then((res) => setItems(res?.items ?? []))
      .catch((err) => {
        handleApiError(err);
        setItems([]);
      });

  useEffect(() => {
    if (isAuthed) load();
  }, [isAuthed]);

  const submit = async (e) => {
    e.preventDefault();
    const amount = Math.round(Math.abs(Number(form.amount)) * 100);
    if (!form.label.trim() || !amount) return;
    const payload = {
      label: form.label.trim(),
      kind: form.kind,
      amount_paise: amount,
      next_date: form.next_date,
      recurrence: form.recurrence,
    };
    setBusy(true);
    try {
      if (editingId) await api.updateScheduledItem(editingId, payload);
      else await api.createScheduledItem(payload);
      toast.success(editingId ? "Updated" : "Added");
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteScheduledItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Deleted");
    } catch (err) {
      handleApiError(err);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      label: item.label,
      kind: item.kind,
      amount: String(item.amount_paise / 100),
      next_date: item.next_date,
      recurrence: item.recurrence,
    });
  };

  if (!isAuthed) return null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Income & bills</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Known future money in and out. These are modelled exactly, not guessed from your history.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scheduled items</CardTitle>
          </CardHeader>
          <CardContent>
            {items === null ? (
              <div className="space-y-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing scheduled yet. Add your allowance, rent or EMI on the right.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {prettyDate(item.next_date)} · repeats {item.recurrence}
                      </p>
                    </div>
                    <Badge variant={item.kind === "income" ? "secondary" : "outline"}>{item.kind}</Badge>
                    <span
                      className={`w-28 text-right tabular-nums ${item.kind === "income" ? "text-success" : "text-destructive"}`}
                    >
                      {item.kind === "income" ? "+" : "−"}
                      {rupees(item.amount_paise)}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(item.id)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">{editingId ? "Edit item" : "Add item"}</CardTitle>
            {editingId ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel edit"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY);
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="si-label">Label</Label>
                <Input
                  id="si-label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Monthly allowance"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="bill">Bill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="si-amount">Amount (₹)</Label>
                  <Input
                    id="si-amount"
                    type="number"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="si-date">Next date</Label>
                  <Input
                    id="si-date"
                    type="date"
                    value={form.next_date}
                    onChange={(e) => setForm({ ...form, next_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Repeats</Label>
                  <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                <Plus className="size-4" /> {editingId ? "Save changes" : "Add item"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
