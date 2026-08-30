"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_SALARY_DECISION_CONTEXT,
  SALARY_DECISION_CONTEXT_STORAGE_KEY,
  normalizeDecisionLocation,
  parseSalaryDecisionContext,
  serializeSalaryDecisionContext,
  type DecisionLocation,
  type DecisionTargetLevel,
  type CostMode,
  type PayBasis,
  type SalaryDecisionContext,
} from "@/lib/salary-decision-context";

const DEFAULT_SNAPSHOT = serializeSalaryDecisionContext(DEFAULT_SALARY_DECISION_CONTEXT);
let volatileSnapshot = DEFAULT_SNAPSHOT;
let useVolatileSnapshot = false;

function subscribe(onStoreChange: () => void) {
  const onStorageChange = () => {
    useVolatileSnapshot = false;
    onStoreChange();
  };

  window.addEventListener("storage", onStorageChange);
  window.addEventListener(SALARY_DECISION_CONTEXT_STORAGE_KEY, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStorageChange);
    window.removeEventListener(SALARY_DECISION_CONTEXT_STORAGE_KEY, onStoreChange);
  };
}

function getSnapshot() {
  if (useVolatileSnapshot) return volatileSnapshot;

  try {
    const snapshot =
      window.localStorage.getItem(SALARY_DECISION_CONTEXT_STORAGE_KEY) ?? DEFAULT_SNAPSHOT;
    const migrated = serializeSalaryDecisionContext(parseSalaryDecisionContext(snapshot));
    if (migrated !== snapshot) {
      window.localStorage.setItem(SALARY_DECISION_CONTEXT_STORAGE_KEY, migrated);
    }
    volatileSnapshot = migrated;
    return migrated;
  } catch {
    useVolatileSnapshot = true;
    return volatileSnapshot;
  }
}

function getServerSnapshot() {
  return DEFAULT_SNAPSHOT;
}

function writeContext(context: SalaryDecisionContext) {
  volatileSnapshot = serializeSalaryDecisionContext(context);

  try {
    window.localStorage.setItem(
      SALARY_DECISION_CONTEXT_STORAGE_KEY,
      volatileSnapshot,
    );
    useVolatileSnapshot = false;
  } catch {
    // Keep the controls usable for this session when browser storage is unavailable.
    useVolatileSnapshot = true;
  }

  window.dispatchEvent(new Event(SALARY_DECISION_CONTEXT_STORAGE_KEY));
}

export function useSalaryDecisionContext() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const context = parseSalaryDecisionContext(raw);

  function update(patch: Partial<SalaryDecisionContext>) {
    writeContext({ ...parseSalaryDecisionContext(getSnapshot()), ...patch });
  }

  function setTargetLevel(targetLevel: DecisionTargetLevel) {
    update({ targetLevel });
  }

  function setLocation(location: DecisionLocation) {
    update({ location: normalizeDecisionLocation(location) });
  }

  function setPayBasis(payBasis: PayBasis) {
    update({ payBasis });
  }

  function setCostMode(costMode: CostMode) {
    update({ costMode });
  }

  return { ...context, setTargetLevel, setLocation, setPayBasis, setCostMode };
}
