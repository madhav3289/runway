import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/auth";
import { rupees, longDate, todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/bills")({
  head: () => ({
    meta: [
      { title: "Income & bills — Runway" },
      {
        name: "description",
        content: "Tell Runway about the income and bills you already know are coming.",
      },
      { property: "og:title", content: "Income & bills — Runway" },
      { property: "og:description", content: "Scheduled income and bills used by the forecast." },
    ],
  }),
  component: BillsPage,
});

const EMPTY = {
  label: "",
  kind: "bill",
  amount_rupees: "",
  next_date: todayIso(),
  recurrence: "monthly",
};

function BillsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const itemsQuery = useQuery({
    queryKey: ["scheduled-items"],
    queryFn: () => api.scheduledItems(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["scheduled-items"] });
    queryClient.invalidateQueries({ queryKey: ["simulate"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing ? api.updateScheduledItem(editing.id, payload) : api.createScheduledItem(payload),
    onSuccess: () => {
      toast.success(editing ? "Updated" : "Added");
      setOpen(false);
      invalidate();
    },
    onError: toastApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteScheduledItem(id),
    onSuccess: () => {
      toast.success("Removed");
      invalidate();
    },
    onError: toastApiError,
  });

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      label: item.label,
      kind: item.kind,
      amount_rupees: String(Math.round(item.amount_paise / 100)),
      next_date: item.next_date,
      recurrence: item.recurrence,
    });
    setOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const amount = Number(form.amount_rupees);
    if (!form.label.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Add a label and a positive amount.");
      return;
    }
    saveMutation.mutate({
      label: form.label.trim(),
      kind: form.kind,
      amount_paise: Math.round(amount * 100),
      next_date: form.next_date,
      recurrence: form.recurrence,
    });
  };

  const items = itemsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Income & bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Known future money in and out. The forecast schedules these instead of guessing them.
          </p>
        </div>
        <Button onClick={startCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled items</CardTitle>
          <CardDescription>Monthly items repeat on the same day each month.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {itemsQuery.isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing scheduled yet. Add your stipend, rent or EMI so the forecast knows about it.
              </p>
              <Button className="mt-4" onClick={startCreate}>
                Add your first item
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      item.kind === "income" ? "bg-safe/15 text-safe" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.kind === "income" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {longDate(item.next_date)} · {item.recurrence}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      item.kind === "income" ? "text-safe" : "text-foreground"
                    }`}
                  >
                    {item.kind === "income" ? "+" : "−"}
                    {rupees(item.amount_paise)}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(item)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add income or bill"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Hostel rent"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="bill">Bill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  value={form.amount_rupees}
                  onChange={(event) => setForm({ ...form, amount_rupees: event.target.value })}
                  placeholder="8000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next-date">Next date</Label>
                <Input
                  id="next-date"
                  type="date"
                  value={form.next_date}
                  onChange={(event) => setForm({ ...form, next_date: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Repeats</Label>
                <Select
                  value={form.recurrence}
                  onValueChange={(recurrence) => setForm({ ...form, recurrence })}
                >
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
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {editing ? "Save changes" : "Add item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {itemsQuery.isError ? (
        <Badge variant="destructive">{itemsQuery.error?.message}</Badge>
      ) : null}
    </div>
  );
}
