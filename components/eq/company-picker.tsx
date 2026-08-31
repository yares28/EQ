"use client";

import { useMemo, useState } from "react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus } from "@/components/eq/icon";
import type { SalaryCompany } from "@/lib/salary-data";

/**
 * Pick one company out of the whole catalog.
 *
 * The plain Select this replaces rendered every catalog company as an option,
 * with no search: fine at thirteen companies, and a scrolling wall the moment
 * the catalog grows. Two things keep this bounded — the list is filtered here
 * rather than by rendering everything and hiding the misses, and it renders at
 * most `MAX_VISIBLE` matches, saying so when it has more.
 */
const MAX_VISIBLE = 50;

export function CompanyPicker({
  companies,
  excludeSlugs,
  onSelect,
  describe,
  label = "Add company",
}: {
  /** Already in the order the caller wants them offered. */
  companies: SalaryCompany[];
  excludeSlugs: Set<string>;
  onSelect: (slug: string) => void;
  describe?: (company: SalaryCompany) => string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const available = useMemo(
    () => companies.filter((company) => !excludeSlugs.has(company.slug)),
    [companies, excludeSlugs],
  );
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return available;
    return available.filter(
      (company) =>
        company.canonicalName.toLowerCase().includes(needle) ||
        company.slug.includes(needle),
    );
  }, [available, search]);
  const visible = matches.slice(0, MAX_VISIBLE);

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
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> {label}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search companies…"
          />
          <CommandList>
            {visible.length === 0 ? (
              <CommandEmpty>
                {available.length === 0
                  ? "Every company is already in the comparison."
                  : "No company matches that search."}
              </CommandEmpty>
            ) : (
              visible.map((company) => {
                const detail = describe?.(company) ?? null;
                return (
                  <CommandItem
                    key={company.slug}
                    value={company.slug}
                    onSelect={() => {
                      onSelect(company.slug);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
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
          {matches.length > visible.length && (
            <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
              {`Showing ${visible.length} of ${matches.length} matches — keep typing to narrow.`}
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
