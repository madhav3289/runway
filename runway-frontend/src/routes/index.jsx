import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, TrendingDown, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, toastApiError } from "@/lib/auth";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Runway — will your money last until your next income?" },
      {
        name: "description",
        content:
          "Upload a bank statement and Runway tells you the chance you run out of money before your next income, and when.",
      },
      { property: "og:title", content: "Runway — will your money last?" },
      {
        property: "og:description",
        content: "A calm cash-flow risk forecaster for students.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { isAuthenticated, ready, login, register, startDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (ready && isAuthenticated) navigate({ to: "/app" });
  }, [ready, isAuthenticated, navigate]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      await fn();
      navigate({ to: "/app" });
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Cash-flow risk, in plain English
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Will your money last until your next income?
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Runway reads your bank statement, learns how you actually spend, and simulates thousands
            of possible futures. You get one honest number: the chance you run out of money before
            the money comes in — and roughly when.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              See the likely path of your balance, with an 80% confidence band.
            </li>
            <li className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Drag a slider: "what if I cut food delivery by 20%?"
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Your statement stays inside your own account.
            </li>
          </ul>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Get your forecast</CardTitle>
            <CardDescription>Sign in, create an account, or look around with demo data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              disabled={Boolean(busy)}
              onClick={() => run("demo", startDemo)}
            >
              {busy === "demo" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Try the demo
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or use your account
              <span className="h-px flex-1 bg-border" />
            </div>

            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              {["login", "register"].map((mode) => (
                <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(mode, () =>
                        mode === "login" ? login(email, password) : register(email, password),
                      );
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-email`}>Email</Label>
                      <Input
                        id={`${mode}-email`}
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@college.edu"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-password`}>Password</Label>
                      <Input
                        id={`${mode}-password`}
                        type="password"
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="8–72 characters"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={Boolean(busy)}>
                      {busy === mode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {mode === "login" ? "Sign in" : "Create account"}
                    </Button>
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
