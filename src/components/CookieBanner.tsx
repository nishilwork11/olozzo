"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "olozzo_cookie_consent";

// GDPR / ePrivacy consent. Only strictly necessary cookies (session, cart) are used until the
// visitor opts in; the stored choice can be read by analytics scripts before they load.
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!localStorage.getItem(KEY));
    } catch {
      setVisible(true);
    }
  }, []);

  function choose(value: "all" | "necessary") {
    try {
      localStorage.setItem(KEY, JSON.stringify({ value, at: new Date().toISOString() }));
    } catch {
      /* storage blocked — just hide */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-2xl sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink-600">
          We use strictly necessary cookies to keep you signed in and remember your cart. With your consent we
          also use analytics cookies to improve olozzo. Read our{" "}
          <Link href="/legal/cookies" className="font-medium text-ink-900 underline">
            cookie policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => choose("necessary")} className="btn btn-secondary">
            Necessary only
          </button>
          <button onClick={() => choose("all")} className="btn btn-dark">
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
