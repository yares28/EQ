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
        {/* This screen is the whole app when the variable is missing, and it
            is as likely to be read on a deployment as on a laptop — where
            "restart the dev server" is advice for a machine nobody is sitting
            at. Name both places instead. */}
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Set <code className="text-foreground">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
          <code className="text-foreground">.env.local</code> and restart the dev
          server, or in the host&apos;s environment variables and redeploy.
          Employer-posted salaries and career monitoring load from Convex.
        </p>
      </div>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
