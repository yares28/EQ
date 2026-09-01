"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { MatchCv } from "@/lib/cv-match";

/**
 * The imported CV, in the shape the scorer consumes.
 *
 * One hook so every surface — the role dialog, the company filter, the Scores
 * page and its charts — scores against exactly the same CV. Two of them
 * building this object separately is how the same role ends up with two
 * different scores on two pages.
 *
 * Nothing is precomputed or cached: this reads the profile row, and a new
 * import changes that row, so every score recomputes on the next render with
 * nothing to invalidate.
 */
export function useCvMatch(): { cv: MatchCv | null; ready: boolean } {
  const profile = useQuery(api.profile.get);

  const cv = useMemo<MatchCv | null>(() => {
    if (profile === undefined || profile === null) return null;
    // A profile row can exist with no CV yet — the settings panel writes a base
    // location or target level before any file is imported. Scoring against no
    // skills would report every role as a total mismatch, which is a claim
    // about the CV rather than about the roles.
    if (profile.cvText === undefined || profile.skills.length === 0) return null;
    return {
      skills: profile.skills.map((skill) => skill.name),
      languages: profile.languages,
      text: profile.cvText,
      baseLocation: profile.baseLocation,
      level: profile.targetLevel ?? "junior",
    };
  }, [profile]);

  return { cv, ready: profile !== undefined };
}
