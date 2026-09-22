import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, Trash2, FileSpreadsheet } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, asArray } from "@/lib/api";
import { PageError } from "@/components/ErrorBoundary";
import { useRequireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { rupees, prettyDate, labelCategory } from "@/lib/format";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "Your data — Runway" },
      {
        name: "description",
        content: "Upload a bank statement CSV and review the transactions Runway learns your spending from.",
      },
      { property: "og:title", content: "Your data — Runway" },
      { property: "og:description", content: "Upload a statement and review your transactions." },
    ],
  }),
  component: DataPage,
});

function DataPage() {
  const { isAuthed } = useRequireAuth();
  const fileRef = useRef(null);

  const [imports, setImports] = useState(null);
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [importsError, setImportsError] = useState(null);
  const [rowsError, setRowsError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState(null);
  const [lastImport, setLastImport] = useState(null);

  const loadAll = () => {
    setImportsError(null);
    setRowsError(null);
    api
      .listImports()
      .then(setImports)
      .catch((err) => {
        setImports(null);
        setImportsError(err?.message ?? "Request failed");
      });
    api
      .transactions({ limit: 200 })
      .then((res) => setRows(res.items))
      .catch((err) => {
        setRows(null);
        if (err?.code === "NO_DATA") setRows([]);
        else setRowsError(err?.message ?? "Request failed");
      });
    api.categories().then(setCategories).catch(() => setCategories([]));
    api.summary(90).then(setSummary).catch(() => setSummary(null));
  };

  useEffect(() => {
    if (!isAuthed) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProgress(0);
    try {
      const res = await api.uploadImport(file, setProgress);
      setLastImport({
        rows_added: res?.rows_added ?? res?.imported ?? 0,
        duplicates_skipped: res?.duplicates_skipped ?? 0,
        warnings: asArray(res?.warnings),
      });
      toast.success(`Imported ${res?.rows_added ?? res?.imported ?? 0} transactions`);
      loadAll();
    } catch (err) {
      handleApiError(err, "Couldn't read that file");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImport = async (id) => {
    try {
      await api.deleteImport(id);
      toast.success("Import removed");
      loadAll();
    } catch (err) {
      handleApiError(err);
    }
  };

  const recategorise = async (id, category) => {
    setRows((prev) => asArray(prev).map((r) => (r.id === id ? { ...r, category } : r)));
    try {
      await api.patchTransaction(id, { category });
    } catch (err) {
      handleApiError(err);
      loadAll();
    }
  };

  const toggleFlag = async (id, key, value) => {
    setRows((prev) => asArray(prev).map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    try {
      await api.patchTransaction(id, { [key]: value });
    } catch (err) {
      handleApiError(err);
      loadAll();
    }
  };

  const visible = useMemo(() => {
    const list = asArray(rows);
    const q = search.trim().toLowerCase();
    return list.filter(
      (r) =>
        (filter === "all" || r.category === filter) &&
        (!q || String(r.description ?? r.merchant ?? "").toLowerCase().includes(q)),
    );
  }, [rows, filter, search]);

  // /api/summary -> by_category: [{ category, total_paise, fixed }]
  const toBar = (c) => ({
    name: labelCategory(c?.category),
    value: Math.abs(c?.total_paise ?? c?.paise ?? 0) / 100,
  });
  const variableSpend = useMemo(
    () => asArray(summary?.by_category).filter((c) => !c?.fixed).map(toBar),
    [summary],
  );
  const fixedSpend = useMemo(
    () => asArray(summary?.by_category).filter((c) => c?.fixed).map(toBar),
    [summary],
  );

  if (!isAuthed) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your data</h1>
          <p className="text-sm text-muted-foreground">
            Upload a bank statement CSV. Runway learns your spending pattern from it.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload a statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              <Button onClick={() => fileRef.current?.click()} disabled={progress !== null}>
                <Upload className="mr-2 size-4" /> Choose CSV
              </Button>
              <span className="text-xs text-muted-foreground">
                Columns: date, description, amount (and optionally balance).
              </span>
            </div>
            {progress !== null ? <Progress value={progress} /> : null}

            <p className="text-xs text-muted-foreground">
              Only HDFC-style statements and simple Date/Description/Amount CSVs are supported. Your statement stays
              in your own account.
            </p>

            {importsError ? (
              <PageError title="Couldn't load your statements" message={importsError} onRetry={loadAll} />
            ) : imports === null ? (
              <Skeleton className="h-16 w-full" />
            ) : imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No statements uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {imports.map((imp) => (
                  <li key={imp.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <FileSpreadsheet className="size-4 text-muted-foreground" />
                    <span className="truncate font-medium">{imp.filename ?? imp.name ?? "Statement"}</span>
                    <Badge variant="secondary">{imp.row_count ?? imp.rows_added ?? 0} rows</Badge>
                    <span className="text-muted-foreground">{prettyDate(imp.created_at ?? imp.uploaded_at)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      aria-label="Delete import"
                      onClick={() => removeImport(imp.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spending by category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {variableSpend.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={variableSpend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={60} />
                    <RTooltip formatter={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                    <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {fixedSpend.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">Fixed costs</p>
                <ul className="flex flex-wrap gap-2 text-xs">
                  {fixedSpend.map((c) => (
                    <li key={c.name} className="rounded-full bg-accent px-2.5 py-1">
                      {c.name} · ₹{Math.round(c.value).toLocaleString("en-IN")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="text-base">Transactions</CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-48"
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {asArray(categories).map((c) => (
                    <SelectItem key={c} value={c}>
                      {labelCategory(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {rowsError ? (
              <PageError title="Couldn't load your transactions" message={rowsError} onRetry={loadAll} />
            ) : rows === null ? (
              <Skeleton className="h-64 w-full" />
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions to show.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-44">Category</TableHead>
                      <TableHead className="w-44">Flags</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">{prettyDate(r.date)}</TableCell>
                        <TableCell className="max-w-[320px] truncate">{r.description ?? r.merchant}</TableCell>
                        <TableCell>
                          <Select value={r.category ?? ""} onValueChange={(v) => recategorise(r.id, v)}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Uncategorised" />
                            </SelectTrigger>
                            <SelectContent>
                              {asArray(categories).map((c) => (
                                <SelectItem key={c} value={c}>
                                  {labelCategory(c)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => toggleFlag(r.id, "is_outlier", !r.is_outlier)}
                              className={`rounded-full border px-2 py-0.5 ${
                                r.is_outlier ? "border-chart-4 text-chart-4" : "border-border text-muted-foreground"
                              }`}
                            >
                              One-off
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFlag(r.id, "is_transfer", !r.is_transfer)}
                              className={`rounded-full border px-2 py-0.5 ${
                                r.is_transfer ? "border-primary text-primary" : "border-border text-muted-foreground"
                              }`}
                            >
                              Transfer
                            </button>
                          </div>
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            (r.amount_paise ?? 0) >= 0 ? "text-success" : ""
                          }`}
                        >
                          {rupees(r.amount_paise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
