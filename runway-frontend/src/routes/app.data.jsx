import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UploadCloud, Search, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/auth";
import { compactRupees, longDate, prettyCategory, rupees } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/app/data")({
  head: () => ({
    meta: [
      { title: "Your data — Runway" },
      {
        name: "description",
        content: "Upload a bank statement CSV and tidy up the transactions Runway learns from.",
      },
      { property: "og:title", content: "Your data — Runway" },
      { property: "og:description", content: "Statements, transactions and spending by category." },
    ],
  }),
  component: DataPage,
});

const PAGE_SIZE = 25;

function DataPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const summaryQuery = useQuery({ queryKey: ["summary", 90], queryFn: () => api.summary(90) });
  const categoriesQuery = useQuery({
    queryKey: ["transaction-categories"],
    queryFn: () => api.transactionCategories(),
  });
  const txnQuery = useQuery({
    queryKey: ["transactions", page, query],
    queryFn: () => api.transactions({ page, limit: PAGE_SIZE, q: query }),
    placeholderData: (previous) => previous,
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => api.uploadStatement(file),
    onSuccess: (data) => {
      setUploadResult(data);
      toast.success(`${data.inserted} transactions added`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary", 90] });
      queryClient.invalidateQueries({ queryKey: ["simulate"] });
    },
    onError: toastApiError,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }) => api.updateTransaction(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["simulate"] });
    },
    onError: toastApiError,
  });

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file.");
      return;
    }
    uploadMutation.mutate(file);
  };

  const byCategory = summaryQuery.data?.by_category ?? [];
  const variable = useMemo(
    () =>
      byCategory
        .filter((row) => !row.fixed)
        .map((row) => ({ ...row, name: prettyCategory(row.category) }))
        .sort((a, b) => b.total_paise - a.total_paise),
    [byCategory],
  );
  const fixed = byCategory.filter((row) => row.fixed);

  const items = txnQuery.data?.items ?? [];
  const total = txnQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = categoriesQuery.data?.categories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The statement you upload is what the forecast learns from.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a statement</CardTitle>
          <CardDescription>
            HDFC-style CSVs and simple Date / Description / Amount CSVs are supported, up to 2 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging ? "border-primary bg-accent/40" : "border-border hover:bg-muted/50"
            }`}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <UploadCloud className="h-6 w-6 text-primary" />
            )}
            <p className="text-sm font-medium">
              {uploadMutation.isPending ? "Uploading…" : "Drop your CSV here, or click to choose"}
            </p>
            <p className="text-xs text-muted-foreground">Nothing is shared — it stays in your own account.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </div>

          {uploadMutation.isPending ? <Progress value={70} className="h-1.5" /> : null}

          {uploadResult ? (
            <div className="rounded-xl border border-border p-4 text-sm">
              <p className="font-medium">
                {uploadResult.inserted} added · {uploadResult.duplicates_skipped} duplicates skipped ·{" "}
                {uploadResult.skipped_rows} rows skipped
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {longDate(uploadResult.date_from)} – {longDate(uploadResult.date_to)} · closing balance{" "}
                {rupees(uploadResult.closing_balance_paise)} on {longDate(uploadResult.closing_balance_date)}
              </p>
              {uploadResult.warnings?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-warn">
                  {uploadResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Statements never leave your own account.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spending by category</CardTitle>
          <CardDescription>Last {summaryQuery.data?.days_covered ?? 90} days of variable spending.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summaryQuery.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : variable.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Upload a statement to see where your money goes.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={variable} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  height={50}
                  textAnchor="end"
                />
                <YAxis
                  tickFormatter={compactRupees}
                  width={62}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [rupees(value), "Total"]}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="total_paise"
                  fill="var(--color-primary)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={56}
                  isAnimationActive={false}
                />

              </BarChart>
            </ResponsiveContainer>
          )}

          {fixed.length ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Fixed flows (scheduled, not learned)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {fixed.map((row) => (
                  <Badge key={row.category} variant="secondary">
                    {prettyCategory(row.category)} · {rupees(row.total_paise)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Transactions</CardTitle>
            <CardDescription>{total} rows</CardDescription>
          </div>
          <form
            className="flex shrink-0 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search);
            }}
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-44 pl-8 sm:w-60"
                placeholder="Search description"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {txnQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No transactions yet. Upload a statement to get your first forecast.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">One-off</TableHead>
                    <TableHead className="text-center">Transfer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {longDate(txn.txn_date)}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <span className="block truncate text-sm">{txn.description}</span>
                        <span className="mt-1 flex gap-1">
                          {txn.is_outlier ? (
                            <Badge variant="outline" className="text-[10px]">
                              one-off
                            </Badge>
                          ) : null}
                          {txn.is_transfer ? (
                            <Badge variant="outline" className="text-[10px]">
                              transfer
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap text-right text-sm ${
                          txn.amount_paise >= 0 ? "text-safe" : "text-foreground"
                        }`}
                      >
                        {rupees(txn.amount_paise)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={txn.category ?? undefined}
                          onValueChange={(category) =>
                            patchMutation.mutate({ id: txn.id, patch: { category } })
                          }
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="Uncategorised" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {prettyCategory(category)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={Boolean(txn.is_outlier)}
                          onCheckedChange={(is_outlier) =>
                            patchMutation.mutate({ id: txn.id, patch: { is_outlier } })
                          }
                          aria-label="One-off purchase"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={Boolean(txn.is_transfer)}
                          onCheckedChange={(is_transfer) =>
                            patchMutation.mutate({ id: txn.id, patch: { is_transfer } })
                          }
                          aria-label="Own-account transfer"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {items.length ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
