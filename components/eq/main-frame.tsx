"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHubHome = pathname === "/";

  return (
    <main
      className={cn(
        // The hub used to sit on --hub (#cfc6ba), a saturated tan used on this
        // one route and nowhere else in the app — a fifth beige, and the most
        // conspicuous one on a phone, where the tiles cover less of it. The
        // overview now sits on the same paper as every other page, so the
        // ground is no longer part of what distinguishes this route.
        "box-border min-w-0 bg-background pt-[5.25rem]",
        isHubHome ? "h-dvh overflow-hidden" : "min-h-0 flex-1 overflow-auto"
      )}
    >
      {children}
    </main>
  );
}
