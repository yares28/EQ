"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, X } from "@/components/eq/icon";
import { api } from "@/convex/_generated/api";

export function QueueBanner() {
  const [dismissed, setDismissed] = useState(false);
  const pending = useQuery(api.ingests.listPending);
  const count = pending?.length ?? 0;
  const open = !dismissed && count > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 32 }}
          className="mb-5 flex items-center gap-3 overflow-hidden rounded-xl bg-primary/[0.07] px-4 py-2.5 ring-1 ring-primary/20"
        >
          <span className="pulse-dot size-2 shrink-0 rounded-full bg-primary" />
          <p className="shimmer-text min-w-0 truncate text-[13px] font-medium">
            {count} {count === 1 ? "job" : "jobs"} waiting for research — run
            /process in Claude Code
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 shrink-0 rounded-lg px-2 text-[11.5px] text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => {
              navigator.clipboard.writeText("/process");
              toast.success("Copied — paste it in Claude Code");
            }}
          >
            <Copy className="size-3" /> Copy command
          </Button>
          <button
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
