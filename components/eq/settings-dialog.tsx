"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import {
  ArrowsClockwise,
  Check,
  Database,
  Plus,
  SlidersHorizontal,
  Trash,
  Wallet,
} from "@/components/eq/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import {
  personalMonthlyCostEur,
  type PersonalCityCost,
} from "@/lib/city-reference-costs";
import { formatEuro } from "@/lib/salary-analytics";
import {
  DECISION_LOCATION_SELECT,
  type DecisionLocation,
} from "@/lib/salary-decision-context";
import { sourceRegistrySummary } from "@/lib/source-registry";
import { cn } from "@/lib/utils";

type SettingsSection = "living-costs" | "updates" | "sources" | "about";

const SECTIONS: { id: SettingsSection; label: string; description: string; icon: typeof Wallet }[] = [
  {
    id: "living-costs",
    label: "Living costs",
    description: "Your own monthly spending, per city",
    icon: Wallet,
  },
  {
    id: "updates",
    label: "Updates",
    description: "Which companies refresh next, and when they last did",
    icon: ArrowsClockwise,
  },
  {
    id: "sources",
    label: "Sources",
    description: "Where every figure comes from, and whether it is healthy",
    icon: Database,
  },
  {
    id: "about",
    label: "Evidence rules",
    description: "What EQ will and will not infer",
    icon: SlidersHorizontal,
  },
];

const COST_FIELDS: { key: keyof Omit<PersonalCityCost, "location" | "updatedAt">; label: string }[] = [
  { key: "rentEur", label: "Rent" },
  { key: "groceriesEur", label: "Groceries" },
  { key: "transportEur", label: "Transport" },
  { key: "utilitiesEur", label: "Utilities" },
  { key: "otherEur", label: "Other" },
];

const EMPTY_DRAFT = {
  rentEur: 0,
  groceriesEur: 0,
  transportEur: 0,
  utilitiesEur: 0,
  otherEur: 0,
};

const ALL_LOCATIONS: DecisionLocation[] = DECISION_LOCATION_SELECT.flatMap((group) =>
  group.options.map((option) => option.value),
);

function CostEditor({
  location,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  location: DecisionLocation;
  draft: typeof EMPTY_DRAFT;
  onChange: (next: typeof EMPTY_DRAFT) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const total = personalMonthlyCostEur({ location, ...draft });
  return (
    <div className="border border-foreground/10 bg-foreground/[0.02] p-3">
      <p className="text-xs font-semibold text-foreground">{location}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {COST_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{field.label}</span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">€</span>
              <input
                type="number"
                min={0}
                step={10}
                inputMode="numeric"
                value={draft[field.key] === 0 ? "" : draft[field.key]}
                placeholder="0"
                onChange={(event) =>
                  onChange({
                    ...draft,
                    [field.key]: Math.max(0, Number(event.target.value) || 0),
                  })
                }
                className="w-24 border-b border-foreground/20 bg-transparent px-1 py-1 text-right tabular text-foreground outline-none focus:border-primary"
              />
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/10 pt-3">
        <p className="text-xs text-muted-foreground">
          Monthly total{" "}
          <span className="font-semibold tabular text-foreground">{formatEuro(total)}</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving || total <= 0}>
            <Check className="size-3.5" /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function LivingCostsPanel() {
  const settings = useQuery(api.settings.get);
  const savePersonal = useMutation(api.settings.savePersonalCityCost);
  const removePersonal = useMutation(api.settings.removePersonalCityCost);
  const [editing, setEditing] = useState<DecisionLocation | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const costs = (settings?.personalCityCosts ?? []) as PersonalCityCost[];
  const used = new Set(costs.map((cost) => cost.location));
  const available = ALL_LOCATIONS.filter((item) => !used.has(item) || item === editing);

  function startAdd(location: DecisionLocation) {
    const existing = costs.find((cost) => cost.location === location);
    setDraft(
      existing
        ? {
            rentEur: existing.rentEur,
            groceriesEur: existing.groceriesEur,
            transportEur: existing.transportEur,
            utilitiesEur: existing.utilitiesEur,
            otherEur: existing.otherEur,
          }
        : EMPTY_DRAFT,
    );
    setEditing(location);
  }

  async function save() {
    if (editing === null) return;
    setSaving(true);
    try {
      await savePersonal({ location: editing, ...draft });
      setEditing(null);
      setDraft(EMPTY_DRAFT);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Your living costs</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Entered per city and applied only to that city. Selecting{" "}
          <span className="font-medium text-foreground">Personal</span> on the Salary page
          subtracts these from estimated net cash. They are yours alone — EQ never
          publishes them as researched city data or mixes them with official figures.
        </p>
      </div>

      {costs.length > 0 && (
        <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
          {costs.map((cost) => (
            <div key={cost.location} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{cost.location}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Rent {formatEuro(cost.rentEur, true)} · groceries{" "}
                  {formatEuro(cost.groceriesEur, true)} · transport{" "}
                  {formatEuro(cost.transportEur, true)} · utilities{" "}
                  {formatEuro(cost.utilitiesEur, true)} · other{" "}
                  {formatEuro(cost.otherEur, true)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-sm font-semibold tabular text-foreground">
                  {formatEuro(personalMonthlyCostEur(cost))}
                  <span className="text-[10px] font-medium text-muted-foreground">/mo</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${cost.location} costs`}
                  onClick={() => startAdd(cost.location as DecisionLocation)}
                >
                  <SlidersHorizontal className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${cost.location} costs`}
                  onClick={() => removePersonal({ location: cost.location })}
                >
                  <Trash className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null ? (
        <CostEditor
          location={editing}
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Select
            value=""
            onValueChange={(next) => startAdd(next as DecisionLocation)}
          >
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Add a location">
              <span className="flex items-center gap-1.5 text-left text-xs">
                <Plus className="size-3.5" /> Add a location
              </span>
            </SelectTrigger>
            <SelectContent align="start" sideOffset={6}>
              {available.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {costs.length === 0 && editing === null && (
        <p className="text-[10px] leading-4 text-muted-foreground">
          Nothing saved yet. Add a city above, then switch Living costs to Personal on the
          Salary page.
        </p>
      )}
    </div>
  );
}

function relativeTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return "never";
  const hours = Math.floor((Date.now() - timestamp) / 36e5);
  if (hours < 1) return "under 1h ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const REFRESH_TONE: Record<string, string> = {
  current: "text-success",
  overdue: "text-warning",
  never: "text-warning",
};

/** The refresh queue in the order the scheduled sweep will work through it. */
function UpdatesPanel() {
  const queue = useQuery(api.companyResearch.refreshQueue);
  const overview = useQuery(api.jobMonitoring.getOverview);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Refresh queue</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          EQ re-reads each monitored company&apos;s career page on a rolling schedule —
          several times a day, without you asking. The company at the top is next.
          Anything marked overdue has not completed a sync in over 24 hours.
        </p>
      </div>

      {overview !== undefined && (
        <div className="grid grid-cols-3 border-y border-foreground/10 py-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Roles tracked</p>
            <p className="mt-1 text-sm font-semibold tabular">{overview.activeRoles}</p>
          </div>
          <div className="border-l border-foreground/10">
            <p className="text-[10px] text-muted-foreground">Changed in 7 days</p>
            <p className="mt-1 text-sm font-semibold tabular">{overview.changedLastSevenDays}</p>
          </div>
          <div className="border-l border-foreground/10">
            <p className="text-[10px] text-muted-foreground">Open alerts</p>
            <p className="mt-1 text-sm font-semibold tabular">{overview.unresolvedAlerts}</p>
          </div>
        </div>
      )}

      {queue === undefined ? (
        <p className="text-xs text-muted-foreground">Loading refresh queue…</p>
      ) : queue.length === 0 ? (
        <p className="text-xs text-muted-foreground">No companies are being monitored yet.</p>
      ) : (
        <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
          {queue.map((company, index) => (
            <div key={company.slug} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 text-[10px] tabular text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {company.canonicalName}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Synced {relativeTime(company.lastCareerSyncAt)}
                  </p>
                </div>
              </div>
              <p className={`shrink-0 text-[10px] font-semibold ${REFRESH_TONE[company.refreshState]}`}>
                {company.refreshState === "overdue"
                  ? "Overdue"
                  : company.refreshState === "never"
                    ? "Never synced"
                    : company.dueNow
                      ? "Due now"
                      : "Up to date"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A summary of the source registry; the per-source detail lives in the code. */
function SourcesPanel() {
  const health = useQuery(api.sourceMaintenance.operatorHealthSummary);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Where the data comes from</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Every source is free and needs no account or API key. A figure still has to pass
          a successful run, a stored snapshot, and its quality checks before it reaches a
          decision.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-y-3 border-y border-foreground/10 py-3 sm:grid-cols-4">
        {[
          { label: "Sources", value: sourceRegistrySummary.total },
          { label: "Official", value: sourceRegistrySummary.official },
          { label: "Automated", value: sourceRegistrySummary.automated },
          { label: "Career feeds", value: sourceRegistrySummary.jobFeeds },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-semibold tabular text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {health === undefined ? (
        <p className="text-xs text-muted-foreground">Checking source health…</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">Live health</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                health.releaseReady
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {health.releaseReady ? "All clear" : "Needs attention"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-4">
            {[
              { label: "Current", value: health.current },
              { label: "Aging", value: health.aging },
              { label: "Stale", value: health.stale },
              { label: "Never run", value: health.neverSucceeded },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-semibold tabular text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
          {health.blockingKeys.length > 0 && (
            <div className="border-t border-foreground/10 pt-2">
              <p className="text-[10px] font-semibold text-warning">Blocking sources</p>
              <ul className="mt-1 space-y-1">
                {health.blockingKeys.map((key) => (
                  <li key={key} className="text-[10px] leading-4 text-muted-foreground">
                    {key}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="border-t border-foreground/10 pt-2 text-[10px] leading-4 text-muted-foreground">
            {health.headline}
          </p>
        </div>
      )}
    </div>
  );
}

function EvidenceRulesPanel() {
  return (
    <div className="space-y-4 text-xs leading-5 text-muted-foreground">
      <div>
        <h3 className="text-sm font-semibold text-foreground">What EQ will not infer</h3>
        <p className="mt-1">
          These rules are enforced in code, not by convention. They are why a cell
          sometimes shows a dash instead of a number.
        </p>
      </div>
      <ul className="space-y-2">
        {[
          "A salary posted at one level is never shown as pay for another level.",
          "A figure for one city never fills in for a different city; only an employer's Spain-wide posting applies to every city.",
          "Employer-posted base pay is never compared against a crowdsourced total. Switch the Rank by control to compare like with like.",
          "A missing bonus or stock figure is shown as unknown, never counted as zero.",
          "Your personal living costs are applied only to the city you entered them for.",
        ].map((rule) => (
          <li key={rule} className="border-l border-foreground/15 pl-3">
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsDialog() {
  const [section, setSection] = useState<SettingsSection>("living-costs");
  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Settings"
            title="Settings"
            className="size-9 rounded-full"
          />
        }
      >
        <SlidersHorizontal size={16} weight="regular" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>{active.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
          <nav
            aria-label="Settings sections"
            className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible sm:border-r sm:border-foreground/10 sm:pr-3"
          >
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const selected = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-left text-xs font-medium transition-colors sm:rounded-md",
                    selected
                      ? "bg-foreground text-primary-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="max-h-[60vh] min-w-0 overflow-y-auto pr-1">
            {section === "living-costs" ? (
              <LivingCostsPanel />
            ) : section === "updates" ? (
              <UpdatesPanel />
            ) : section === "sources" ? (
              <SourcesPanel />
            ) : (
              <EvidenceRulesPanel />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
