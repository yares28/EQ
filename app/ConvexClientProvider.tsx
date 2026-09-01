"use client";

import { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (convex === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-sm font-semibold text-foreground">Convex is not configured</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Set <code className="text-foreground">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
          <code className="text-foreground">.env.local</code>, then restart the dev server.
          Employer-posted salaries and career monitoring load from Convex.
        </p>
      </div>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
