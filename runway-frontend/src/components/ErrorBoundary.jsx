import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Inline error state with a retry button — used for failed requests.
export function PageError({ title = "Couldn't load this", message, onRetry }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <AlertTriangle className="size-6 text-destructive" />
        <div>
          <p className="font-medium">{title}</p>
          {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
        </div>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" /> Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Keeps one broken screen from taking down the whole app.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Page error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <PageError
          title="This screen hit a problem"
          message={this.state.error?.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
