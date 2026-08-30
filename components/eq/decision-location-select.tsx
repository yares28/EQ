"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import {
  DECISION_LOCATION_SELECT,
  decisionLocationLabel,
  type DecisionLocation,
} from "@/lib/salary-decision-context";

export function DecisionLocationSelect({
  value,
  onValueChange,
  className,
  contentAlign = "start",
}: {
  value: DecisionLocation;
  onValueChange: (value: DecisionLocation) => void;
  className?: string;
  contentAlign?: "start" | "center" | "end";
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as DecisionLocation)}>
      <SelectTrigger className={className} aria-label="Location">
        <span className="truncate text-left">{decisionLocationLabel(value)}</span>
      </SelectTrigger>
      <SelectContent align={contentAlign} sideOffset={6}>
        {DECISION_LOCATION_SELECT.map((entry) => (
          <SelectGroup key={entry.label}>
            <SelectLabel>{entry.label}</SelectLabel>
            {entry.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
