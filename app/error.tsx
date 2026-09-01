"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/eq/page-shell";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <PageHeader
        title="Something went wrong"
        description="This view hit an unexpected error. Your data is safe — try again, or head back to the salary ranking."
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        {/* base-ui's Button asserts a native <button> unless told otherwise;
            rendering an anchor without this logs an accessibility warning. */}
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/salary-intel" />}
        >
          Back to salary ranking
        </Button>
      </div>
    </PageShell>
  );
}
