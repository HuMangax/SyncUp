import { CircleCheck, CircleAlert, OctagonAlert } from "lucide-react";
import type { RiskLevel } from "@/lib/types";

export function RiskChip({ level, hoursShort = 0 }: { level: RiskLevel; hoursShort?: number }) {
  if (level === "at_risk")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        <OctagonAlert size={12} aria-hidden /> At risk · {hoursShort} h short
      </span>
    );
  if (level === "tight")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        <CircleAlert size={12} aria-hidden /> Tight
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      <CircleCheck size={12} aria-hidden /> On track
    </span>
  );
}
