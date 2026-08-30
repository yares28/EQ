"use client";

import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "eq-company-shortlist";
const EMPTY_SHORTLIST = "[]";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_KEY, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_KEY, onStoreChange);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SHORTLIST;
  } catch {
    // Safari private mode, a sandboxed iframe, or storage disabled must not
    // crash the page — the shortlist just behaves as empty for this session.
    return EMPTY_SHORTLIST;
  }
}

function getServerSnapshot() {
  return EMPTY_SHORTLIST;
}

function parseShortlist(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function useShortlist() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `raw` is a primitive string, so it is only a new value (by ===) when the
  // underlying storage content actually changed. Memoizing on it means
  // `companies` keeps a stable Set reference across renders that don't touch
  // the shortlist, which lets everything downstream memoize on it too.
  const companies = useMemo(() => parseShortlist(raw), [raw]);

  function toggle(companySlug: string) {
    const next = parseShortlist(getSnapshot());
    if (next.has(companySlug)) next.delete(companySlug);
    else next.add(companySlug);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      window.dispatchEvent(new Event(STORAGE_KEY));
    } catch {
      // Storage may be blocked or full; the toggle just won't persist.
    }
  }

  function addMany(companySlugs: string[]) {
    const next = parseShortlist(getSnapshot());
    for (const companySlug of companySlugs) next.add(companySlug);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      window.dispatchEvent(new Event(STORAGE_KEY));
    } catch {
      // Storage may be blocked or full; the addition just won't persist.
    }
  }

  return { companies, toggle, addMany };
}
