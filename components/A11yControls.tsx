"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { TextSize, useA11y } from "@/store/a11y";

/** Applies the saved display preferences to <html> so CSS can react to them. */
export function A11yApplier() {
  const { textSize, highContrast, reduceMotion } = useA11y();
  useEffect(() => {
    void Promise.resolve(useA11y.persist.rehydrate());
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.text = textSize;
    el.dataset.contrast = highContrast ? "high" : "normal";
    el.dataset.motion = reduceMotion ? "reduce" : "auto";
  }, [textSize, highContrast, reduceMotion]);
  return null;
}

const SIZES: { v: TextSize; label: string; sample: string }[] = [
  { v: "normal", label: "Normal", sample: "text-base" },
  { v: "large", label: "Large", sample: "text-xl" },
  { v: "xlarge", label: "Largest", sample: "text-2xl" },
];

export function A11yControls() {
  const { textSize, highContrast, reduceMotion, set, reset } = useA11y();
  const motionOn = reduceMotion ?? false;
  const toggle = "relative h-8 w-14 shrink-0 rounded-full transition-colors";
  return (
    <div className="space-y-6">
      <div>
        <p id="ts-h" className="font-bold">Text size</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="ts-h">
          {SIZES.map((s) => (
            <button
              key={s.v}
              type="button"
              role="radio"
              aria-checked={textSize === s.v}
              onClick={() => set({ textSize: s.v })}
              className={`rounded-2xl border-2 p-3 text-center font-bold transition ${textSize === s.v ? "border-blue-600 bg-blue-50" : "border-border bg-white hover:border-blue-300"}`}
            >
              <span className={`block ${s.sample}`}>Aa</span>
              <span className="flex items-center justify-center gap-1 text-xs text-muted">{textSize === s.v && <Check size={12} aria-hidden />}{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {[
        { id: "hc", label: "High contrast", hint: "Darker text and stronger borders.", on: highContrast, flip: () => set({ highContrast: !highContrast }) },
        { id: "rm", label: "Reduce motion", hint: reduceMotion === null ? "Following your device setting." : "Turns off animations.", on: motionOn, flip: () => set({ reduceMotion: !motionOn }) },
      ].map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-4">
          <div>
            <p id={`${o.id}-l`} className="font-bold">{o.label}</p>
            <p className="text-sm text-muted">{o.hint}</p>
          </div>
          <button type="button" role="switch" aria-checked={o.on} aria-labelledby={`${o.id}-l`} onClick={o.flip} className={`${toggle} ${o.on ? "bg-blue-600" : "bg-slate-400"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${o.on ? "left-7" : "left-1"}`} />
          </button>
        </div>
      ))}

      <button type="button" onClick={reset} className="text-sm font-semibold text-blue-700 hover:underline">Reset to defaults</button>
    </div>
  );
}
