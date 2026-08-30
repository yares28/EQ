"use client";

import { useRef } from "react";

import { Info, type EqIconComponent } from "@/components/eq/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
  width = "standard",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "standard" | "wide";
}) {
  return (
    <div
      className={cn(
        "mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-9",
        width === "wide" ? "max-w-[1420px]" : "max-w-6xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-border pb-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {meta && <div className="flex shrink-0 items-center gap-3">{meta}</div>}
        {action && <div className="shrink-0 lg:ml-auto">{action}</div>}
      </div>
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: EqIconComponent;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start gap-3", className)}>
      {Icon && (
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
          <Icon size={16} weight="regular" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function InfoDialog({
  title,
  description,
  children,
  label,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label ?? `About ${title}`}
            title={label ?? `About ${title}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Info size={16} weight="regular" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" initialFocus={contentRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div
          ref={contentRef}
          tabIndex={-1}
          className="max-h-[65vh] overflow-y-auto pr-1 text-sm leading-6 text-muted-foreground outline-none"
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 border-l border-border pl-4 first:border-l-0 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular">{value}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function MetricStrip({
  metrics,
}: {
  metrics: { label: string; value: string; detail?: string }[];
}) {
  return (
    <section className="mb-6 grid border-y border-border py-5 sm:grid-cols-3">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(index > 0 && "mt-4 border-t border-border pt-4 sm:mt-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4")}
        >
          <CompactMetric {...metric} />
        </div>
      ))}
    </section>
  );
}

export function PageLoading({
  title,
  description,
  rows = 3,
}: {
  title: string;
  description: string;
  rows?: number;
}) {
  return (
    <PageShell>
      <PageHeader title={title} description={description} />
      <div
        className="divide-y divide-border border-y border-border"
        aria-busy="true"
        aria-label={`Loading ${title}`}
      >
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-full max-w-64 rounded-sm" />
              <Skeleton className="h-2.5 w-full max-w-md rounded-sm" />
            </div>
            <Skeleton className="hidden h-7 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
