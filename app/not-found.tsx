import Link from "next/link";

import { PageHeader, PageShell } from "@/components/eq/page-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell>
      <PageHeader
        title="Page not found"
        description="Nothing lives at this address. It may have moved, or the link is stale."
      />
      <Button nativeButton={false} render={<Link href="/salary-intel" />}>
        Back to salary ranking
      </Button>
    </PageShell>
  );
}
