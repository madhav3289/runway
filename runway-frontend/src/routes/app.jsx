import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Moon, Sun, LogOut, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/use-theme";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const NAV = [
  { to: "/app", label: "Dashboard", exact: true },
  { to: "/app/data", label: "Data" },
  { to: "/app/bills", label: "Income & bills" },
  { to: "/app/scenarios", label: "Scenarios" },
  { to: "/app/accuracy", label: "Model accuracy" },
];

function AppLayout() {
  const { ready, isAuthenticated, isDemo, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (ready && !isAuthenticated) navigate({ to: "/" });
  }, [ready, isAuthenticated, navigate]);

  if (!ready || !isAuthenticated) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/app" className="flex shrink-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <LineChart className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">Runway</span>
            </Link>
            {isDemo ? (
              <Badge variant="secondary" className="shrink-0">
                Demo · read-only
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden max-w-[16ch] truncate text-xs text-muted-foreground md:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 sm:px-4">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: Boolean(item.exact) }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
