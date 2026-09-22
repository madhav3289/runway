import { toast } from "sonner";

// Central error → toast translation using the API's own message.
export function handleApiError(err, fallback = "Something went wrong") {
  if (!err) return;
  if (err.name === "AbortError") return;
  if (err.code === "DEMO_READ_ONLY") {
    toast.error("Demo is read-only. Create an account to save changes.");
    return;
  }
  toast.error(err.message || fallback);
}
