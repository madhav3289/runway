import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { onWaking } from "@/lib/api";

export function WakeBanner() {
  const [waking, setWaking] = useState(false);
  useEffect(() => onWaking(setWaking), []);
  if (!waking) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-primary/12 px-4 py-2 text-sm text-primary">
      <Loader2 className="size-4 animate-spin" />
      Waking up the forecasting engine, retrying…
    </div>
  );
}
