"use client";

import { useState } from "react";
import { initialsOf } from "@/lib/score";

/**
 * Known company → domain overrides. Anything not listed falls back to a
 * slugified guess (e.g. "Foo Bar Inc" → "foobarinc.com"), and if every logo
 * source 404s we render initials — so an unknown company never breaks.
 */
const DOMAINS: Record<string, string> = {
  airbus: "airbus.com",
  mapfre: "mapfre.com",
  hilton: "hilton.com",
  uber: "uber.com",
  alstom: "alstom.com",
};

function domainFor(company: string): string {
  const key = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  return DOMAINS[key] ?? `${key}.com`;
}

/**
 * Company logo via public logo APIs, most-branded first:
 *   1. Clearbit Logo API  — clean transparent brand logos, no key
 *   2. Google favicon     — reliable fallback for anything Clearbit misses
 *   3. initials           — final graceful fallback
 */
export function CompanyLogo({
  company,
  size = 40,
}: {
  company: string;
  size?: number;
}) {
  const domain = domainFor(company);
  const sources = [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
  const [failuresByCompany, setFailuresByCompany] = useState<
    Record<string, number>
  >({});
  const idx = failuresByCompany[company] ?? 0;

  if (idx >= sources.length) {
    return (
      <span
        style={{ width: size, height: size }}
        className="grid shrink-0 place-items-center rounded-xl border border-border bg-muted/40 text-[12px] font-bold text-foreground/70"
      >
        {initialsOf(company)}
      </span>
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sources[idx]}
        alt={`${company} logo`}
        width={size}
        height={size}
        loading="lazy"
        onError={() =>
          setFailuresByCompany((current) => ({
            ...current,
            [company]: (current[company] ?? 0) + 1,
          }))
        }
        className="size-full object-contain p-1.5"
      />
    </span>
  );
}
