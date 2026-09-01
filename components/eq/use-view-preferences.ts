"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_VIEW_PREFERENCES,
  VIEW_PREFERENCES_STORAGE_KEY,
  normalizeCompareSlugs,
  parseViewPreferences,
  serializeViewPreferences,
  type ViewPreferences,
} from "@/lib/view-preferences";

const DEFAULT_SNAPSHOT = serializeViewPreferences(DEFAULT_VIEW_PREFERENCES);
let volatileSnapshot = DEFAULT_SNAPSHOT;
let useVolatileSnapshot = false;

function subscribe(onStoreChange: () => void) {
  const onStorageChange = () => {
    useVolatileSnapshot = false;
    onStoreChange();
  };

  window.addEventListener("storage", onStorageChange);
  window.addEventListener(VIEW_PREFERENCES_STORAGE_KEY, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener(VIEW_PREFERENCES_STORAGE_KEY, onStoreChange);
  };
}

function getSnapshot() {
  if (useVolatileSnapshot) return volatileSnapshot;

  try {
    const snapshot =
      window.localStorage.getItem(VIEW_PREFERENCES_STORAGE_KEY) ?? DEFAULT_SNAPSHOT;
    const migrated = serializeViewPreferences(parseViewPreferences(snapshot));
    if (migrated !== snapshot) {
      window.localStorage.setItem(VIEW_PREFERENCES_STORAGE_KEY, migrated);
    }
    volatileSnapshot = migrated;
    return migrated;
  } catch {
    // Private browsing and blocked storage must not break the controls.
    useVolatileSnapshot = true;
    return volatileSnapshot;
  }
}

function getServerSnapshot() {
  return DEFAULT_SNAPSHOT;
}

function writePreferences(preferences: ViewPreferences) {
  volatileSnapshot = serializeViewPreferences(preferences);

  try {
    window.localStorage.setItem(VIEW_PREFERENCES_STORAGE_KEY, volatileSnapshot);
    useVolatileSnapshot = false;
  } catch {
    useVolatileSnapshot = true;
  }

  window.dispatchEvent(new Event(VIEW_PREFERENCES_STORAGE_KEY));
}

/** Reads the stored preferences without subscribing — for one-off checks. */
export function readViewPreferences(): ViewPreferences {
  return parseViewPreferences(getSnapshot());
}

export function updateViewPreferences(patch: Partial<ViewPreferences>) {
  writePreferences({ ...parseViewPreferences(getSnapshot()), ...patch });
}

export function useViewPreferences() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const preferences = parseViewPreferences(raw);

  return {
    ...preferences,
    setScope: (scope: ViewPreferences["scope"]) => updateViewPreferences({ scope }),
    setSortBy: (sortBy: ViewPreferences["sortBy"]) => updateViewPreferences({ sortBy }),
    setHideUnknown: (hideUnknown: boolean) => updateViewPreferences({ hideUnknown }),
    setPlanView: (planView: ViewPreferences["planView"]) =>
      updateViewPreferences({ planView }),
    setCompareSlugs: (compareSlugs: string[]) =>
      updateViewPreferences({ compareSlugs: normalizeCompareSlugs(compareSlugs) }),
    toggleCompareSlug: (slug: string) => {
      const current = readViewPreferences().compareSlugs;
      updateViewPreferences({
        compareSlugs: normalizeCompareSlugs(
          current.includes(slug)
            ? current.filter((item) => item !== slug)
            : [...current, slug],
        ),
      });
    },
  };
}
