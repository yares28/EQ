"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHubHome = pathname === "/";

  return (
    <main
      className={cn(
        "box-border min-w-0 pt-[5.25rem]",
        isHubHome
          ? "h-dvh overflow-hidden bg-hub"
          : "min-h-0 flex-1 overflow-auto bg-background"
      )}
    >
      {children}
    </main>
  );
}
