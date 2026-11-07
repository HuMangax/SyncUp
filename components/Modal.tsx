"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Accessible modal: labelled, Escape closes, focus moves in and returns on close. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 md:items-center md:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl md:rounded-2xl ${wide ? "md:max-w-2xl" : "md:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button data-close aria-label="Close" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const field = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground";
export const labelCls = "block text-sm font-medium";
export const primaryBtn = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
export const secondaryBtn = "rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-black/5";
