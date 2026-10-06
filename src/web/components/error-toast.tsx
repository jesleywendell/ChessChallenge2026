import { useEffect, useState } from "react";
import type { ConnectionState } from "../game-connection";

const TOAST_DURATION_MS = 5_000;

export function ErrorToast({ error }: { error: ConnectionState["error"] }) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setDismissedId(error.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (!error || error.id === dismissedId) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-xl border border-red-500 bg-red-950 px-4 py-3 text-red-100 shadow-xl"
    >
      {error.message}
    </div>
  );
}
