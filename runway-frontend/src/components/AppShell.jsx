import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Sun, LogOut, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WakeBanner } from "@/components/WakeBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/data", label: "Data" },
  { to: "/income", label: "Income & bills" },
  { to: "/accuracy", label: "Model accuracy" },
  { to: "/scenarios", label: "Scenarios" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("runway_theme");
    const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("runway_theme", next ? "dark" : "light");
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-5">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">
              <TrendingUp className="size-4" />
            </span>
            Runway
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "rounded-md px-3 py-2 text-sm bg-accent text-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user?.is_demo ? <Badge variant="secondary">Demo</Badge> : null}
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                logout();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border/70 px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground"
              activeProps={{ className: "whitespace-nowrap rounded-md px-3 py-1.5 text-sm bg-accent text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <WakeBanner />

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <footer className="border-t border-border/70 py-6">
        <p className="mx-auto max-w-7xl px-5 text-xs text-muted-foreground">
          Forecasts are statistical estimates based on your past spending, not financial advice.
        </p>
      </footer>
    </div>
  );
}
