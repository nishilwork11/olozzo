"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SunsetLoader } from "@/components/SunsetLoader";
import { cn } from "@/lib/utils";

/** Fast page changes finish before this, so the loader never just flashes */
const SHOW_AFTER_MS = 150;
/** If a page change stalls (or never happens), the loader goes away by itself */
const GIVE_UP_AFTER_MS = 15_000;

/** True when the address is another page of this site (not the same page, a download or an API route). */
function isOtherPage(url: URL): boolean {
  const here = window.location;
  if (url.origin !== here.origin || url.pathname.startsWith("/api/")) return false;
  return url.pathname !== here.pathname || url.search !== here.search;
}

/**
 * Shows the Sunset loader while the next page loads: after a click on a link to another page of the site
 * or the submit of a search or filter form. The current page stays in place underneath and can still be used.
 */
export function RouteLoader() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  // The address changed, so the next page is on screen
  useEffect(() => setPending(false), [pathname, search]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const giveUp = setTimeout(() => setPending(false), GIVE_UP_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [pending]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab or window
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      if (isOtherPage(new URL(link.href))) setPending(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      // Only forms that load a page (search, filters, sorting); actions that save something show their own state
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return;
      const url = new URL(form.action || window.location.href);
      const fields = [...new FormData(form, e.submitter)].map(([name, value]) => [name, String(value)]);
      url.search = new URLSearchParams(fields).toString();
      if (isOtherPage(url)) setPending(true);
    };
    // Coming back to this page from the browser's back/forward cache
    const onPageShow = () => setPending(false);

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-cream/45 transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {visible && (
        <span className="grid place-items-center rounded-full bg-white p-4 shadow-lg ring-1 ring-ink-200/70">
          <SunsetLoader size={64} label="Loading page" />
        </span>
      )}
    </div>
  );
}
