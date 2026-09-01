"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  readViewPreferences,
  updateViewPreferences,
} from "@/components/eq/use-view-preferences";
import { normalizeRoute } from "@/lib/view-preferences";

/** Marks that this browser session already resumed, so it happens at most once. */
const RESUME_FLAG = "eq-session-resumed";

function alreadyResumed(): boolean {
  try {
    return window.sessionStorage.getItem(RESUME_FLAG) === "1";
  } catch {
    // Without session storage, resuming repeatedly would trap the user away
    // from Overview, so treat it as already resumed.
    return true;
  }
}

function markResumed() {
  try {
    window.sessionStorage.setItem(RESUME_FLAG, "1");
  } catch {
    // Nothing to do — the guard above already fails closed.
  }
}

/**
 * Remembers the last page and returns to it when the app is reopened.
 *
 * The resume only fires once per browser session and only from the root, so
 * clicking Overview during a session still goes to Overview rather than
 * bouncing back to the remembered page.
 */
export function RouteMemory() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/") {
      markResumed();
      updateViewPreferences({ lastRoute: normalizeRoute(pathname) });
      return;
    }

    if (alreadyResumed()) {
      updateViewPreferences({ lastRoute: "/" });
      return;
    }

    markResumed();
    const { lastRoute } = readViewPreferences();
    if (lastRoute !== "/") {
      router.replace(lastRoute);
      return;
    }
    updateViewPreferences({ lastRoute: "/" });
  }, [pathname, router]);

  return null;
}
