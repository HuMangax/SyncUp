import { BookOpen, Briefcase, PartyPopper, Pencil, Star } from "lucide-react";
import type { EventKind } from "@/lib/types";

/** One look per kind of block, shared by Home and Calendar. Classes stay grey so they recede. */
export const KIND_STYLE = {
  study: { label: "Study", Icon: Pencil, card: "bg-blue-600 text-white border-blue-800", chip: "bg-blue-600 text-white" },
  class: { label: "Class", Icon: BookOpen, card: "bg-slate-100 text-slate-600 border-slate-300", chip: "bg-slate-200 text-slate-700" },
  work: { label: "Work", Icon: Briefcase, card: "bg-amber-100 text-amber-950 border-amber-500", chip: "bg-amber-100 text-amber-900" },
  social: { label: "Hangout", Icon: PartyPopper, card: "bg-teal-100 text-teal-950 border-teal-500", chip: "bg-teal-100 text-teal-900" },
  other: { label: "Event", Icon: Star, card: "bg-violet-100 text-violet-950 border-violet-500", chip: "bg-violet-100 text-violet-900" },
} satisfies Record<"study" | EventKind, { label: string; Icon: typeof Pencil; card: string; chip: string }>;
