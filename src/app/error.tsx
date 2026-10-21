"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-ink-500">
        {error.message.startsWith("Forbidden") ? "You do not have permission to do that." : "An unexpected error occurred. Please try again."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-400">Ref: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn btn-dark">Try again</button>
        <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
      </div>
    </div>
  );
}
