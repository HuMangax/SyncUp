import Link from "next/link";

const ITEMS: [string, string][] = [
  ["Never colour alone", "Every block on the calendar has an icon and a label as well as a colour. Fixed and movable sessions use a lock and an open lock. Before/after changes use an arrow, plus and minus."],
  ["Keyboard all the way", "Every button, switch, task and calendar block can be reached and used with the keyboard. A skip link jumps past the menu. Focus is always visible."],
  ["Screen readers", "Progress bars, meters and switches have names and values. Warnings are announced. Dialogs close with Escape."],
  ["Readable by default", "Body text and controls aim for WCAG AA contrast. Targets are large. Text can go up to 133% larger, or switch on high contrast."],
  ["Calm motion", "Motion only shows what changed, such as a moved session. Reduce motion turns it all off, and your device's setting is respected."],
  ["Works on a phone", "At phone width the calendar becomes a single day with a date strip, and the menu moves to the bottom."],
  ["Plain wording", "Short sentences and the same word for the same action everywhere. Errors say what to do next."],
];

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Accessibility</h1>
        <p className="mt-1 text-base text-muted">A planner is only useful if everyone can use it, especially when stressed.</p>
      </header>
      <ul className="space-y-3">
        {ITEMS.map(([h, p]) => (
          <li key={h} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border">
            <h2 className="text-lg font-bold">{h}</h2>
            <p className="mt-1 text-base text-muted">{p}</p>
          </li>
        ))}
      </ul>
      <p><Link href="/settings" className="font-bold text-blue-700 underline">Change display settings</Link></p>
    </div>
  );
}
