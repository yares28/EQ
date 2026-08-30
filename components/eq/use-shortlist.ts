"use client";

import { useSyncExternalStore } from "react";

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
  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SHORTLIST;
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
  const companies = parseShortlist(raw);

  function toggle(companySlug: string) {
    const next = parseShortlist(getSnapshot());
    if (next.has(companySlug)) next.delete(companySlug);
    else next.add(companySlug);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(STORAGE_KEY));
  }

  function addMany(companySlugs: string[]) {
    const next = parseShortlist(getSnapshot());
    for (const companySlug of companySlugs) next.add(companySlug);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(STORAGE_KEY));
  }

  return { companies, toggle, addMany };
}
