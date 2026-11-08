"use client";

import { useId } from "react";

/** SyncUp mark: two sync arrows circling an up arrow. The arrows turn on hover and on first load. */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  // Unique per instance: a shared id would point at a copy inside a hidden sidebar and paint nothing.
  const gid = `syncup-g-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`logo-mark ${className}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gid})`} />
      <g className="logo-arcs" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.2 21.9 A11 11 0 0 1 28.4 12.9" />
        <path d="M23.9 12.2 L28.4 12.9 L28.5 8.3" />
        <path d="M30.8 18.1 A11 11 0 0 1 11.6 27.1" />
        <path d="M16.1 27.8 L11.6 27.1 L11.5 31.7" />
      </g>
      <g className="logo-up" fill="none" stroke="#fde68a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 25 V15" />
        <path d="M16 19 L20 15 L24 19" />
      </g>
    </svg>
  );
}

export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="logo inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
        Sync<span className={light ? "text-amber-300" : "text-blue-600"}>Up</span>
      </span>
    </span>
  );
}
