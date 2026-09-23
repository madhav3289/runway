import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { onWakingChange } from "@/lib/api";

export function WakingBanner() {
  const [waking, setWaking] = useState(false);

  useEffect(() => onWakingChange(setWaking), []);

  if (!waking) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Waking up the forecasting engine, retrying…
      </div>
    </div>
  );
}
