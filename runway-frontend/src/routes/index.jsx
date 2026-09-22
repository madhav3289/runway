import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, LineChart, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/useApiError";
import { WakeBanner } from "@/components/WakeBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Runway — will your money last until your next income?" },
      {
        name: "description",
        content:
          "Runway reads your bank statement and tells you the chance you run out of money before your next income, and when.",
      },
      { property: "og:title", content: "Runway — will your money last until your next income?" },
      {
        property: "og:description",
        content: "A cash-flow risk forecaster for students. Upload a statement, get a forecast in seconds.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { isAuthed, ready, login, register, demo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && isAuthed) navigate({ to: "/dashboard" });
  }, [ready, isAuthed, navigate]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      navigate({ to: "/dashboard" });
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WakeBanner />
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">
            <LineChart className="size-3.5" /> Cash-flow risk forecaster
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Will your money last until your next income?
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Runway learns how you actually spend from your bank statement, simulates thousands of possible futures, and
            tells you the chance you hit zero — and roughly when.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <Wallet className="size-4 text-primary" /> Upload a CSV statement, get a forecast in seconds.
            </li>
            <li className="flex items-center gap-3">
              <LineChart className="size-4 text-primary" /> Drag sliders to see what cutting a category does.
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-primary" /> Statements never leave your own account.
            </li>
          </ul>
        </div>

        <Card className="w-full">
          <CardContent className="p-6">
            <Button className="w-full" size="lg" disabled={busy} onClick={() => run(demo)}>
              Try the demo
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              A seeded, read-only account — no sign up needed.
            </p>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or use your account <span className="h-px flex-1 bg-border" />
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              {["signin", "register"].map((mode) => (
                <TabsContent key={mode} value={mode} className="pt-4">
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => (mode === "signin" ? login(email, password) : register(email, password)));
                    }}
                  >
                    <div>
                      <Label htmlFor={`${mode}-email`}>Email</Label>
                      <Input
                        id={`${mode}-email`}
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@college.edu"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${mode}-password`}>Password</Label>
                      <Input
                        id={`${mode}-password`}
                        type="password"
                        required
                        minLength={8}
                        maxLength={72}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                      />
                    </div>
                    <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
                      {mode === "signin" ? "Sign in" : "Create account"}
                    </Button>
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t border-border/70 py-6">
        <p className="mx-auto max-w-6xl px-5 text-xs text-muted-foreground">
          Forecasts are statistical estimates based on your past spending, not financial advice.
        </p>
      </footer>
    </div>
  );
}
