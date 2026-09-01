"use client";

import { useMemo, useState } from "react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, Plus } from "@/components/eq/icon";
import type { SalaryCompany } from "@/lib/salary-data";

/**
 * Choose the companies to compare, several at a time.
 *
 * It used to add exactly one and close, so building a four-company comparison
 * meant opening the same popover four times and re-typing four searches. The
 * panel now stays open and each row toggles, which is what picking a set
 * actually is; the pills outside remain the way to drop one.
 *
 * Two things keep it bounded as the catalog grows: the list is filtered here
 * rather than rendered-then-hidden, and it renders at most `MAX_VISIBLE`
 * matches, saying so when there are more.
 */
const MAX_VISIBLE = 50;

export function CompanyPicker({
  companies,
  selectedSlugs,
  onToggle,
  describe,
  max,
  label = "Add companies",
}: {
  /** Already in the order the caller wants them offered. */
  companies: SalaryCompany[];
  selectedSlugs: Set<string>;
  onToggle: (slug: string) => void;
  describe?: (company: SalaryCompany) => string | null;
  /** How many can be compared at once; rows past it stop accepting clicks. */
  max: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return companies;
    return companies.filter(
      (company) =>
        company.canonicalName.toLowerCase().includes(needle) ||
        company.slug.includes(needle),
    );
  }, [companies, search]);
  const visible = matches.slice(0, MAX_VISIBLE);
  const full = selectedSlugs.size >= max;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
            <Plus className="size-3.5" /> {label}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search companies…"
          />
          <CommandList>
            {visible.length === 0 ? (
              <CommandEmpty>No company matches that search.</CommandEmpty>
            ) : (
              visible.map((company) => {
                const detail = describe?.(company) ?? null;
                const picked = selectedSlugs.has(company.slug);
                const locked = full && !picked;
                return (
                  <CommandItem
                    key={company.slug}
                    value={company.slug}
                    disabled={locked}
                    onSelect={() => {
                      if (locked) return;
                      onToggle(company.slug);
                      // Deliberately left open: choosing a set is several
                      // clicks, and reopening between each one was the whole
                      // complaint.
                    }}
                  >
                    <span
                      aria-hidden
                      className={`grid size-4 shrink-0 place-items-center rounded-[5px] ${
                        picked
                          ? "bg-eq-accent text-eq-accent-foreground"
                          : "shadow-[0_0_0_1px_rgb(26_25_23_/_18%)]"
                      }`}
                    >
                      {picked && <Check className="size-2.5" weight="bold" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{company.canonicalName}</span>
                      {detail !== null && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {detail}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })
            )}
          </CommandList>
          <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            {full
              ? `${selectedSlugs.size} of ${max} chosen — remove one to swap it out.`
              : matches.length > visible.length
                ? `Showing ${visible.length} of ${matches.length} matches — keep typing to narrow.`
                : `${selectedSlugs.size} of ${max} chosen.`}
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
