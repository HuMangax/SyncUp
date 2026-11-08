"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, Upload } from "lucide-react";
import { usePlanner } from "@/store/planner";
import { localDateKey } from "@/lib/time/slots";
import { pdfToText } from "@/lib/syllabus/pdf";
import { parseSyllabus, sampleSyllabus, type SyllabusItem } from "@/lib/syllabus/parse";
import { AssignmentInput } from "@/lib/validation";
import { field } from "@/components/Modal";

type Row = SyllabusItem & { on: boolean };
const TYPES = [["assignment", "Assignment"], ["project", "Project"], ["exam", "Exam"]] as const;

export default function SyllabusPage() {
  const router = useRouter();
  const { now, settings, addAssignments } = usePlanner();
  const today = localDateKey(now, settings.timezone);
  const [text, setText] = useState("");
  const [course, setCourse] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const guessCourse = (t: string) => /^\s*([A-Z]{2,5}\s?\d{3}[A-Z]?)/m.exec(t)?.[1] ?? "";
  const find = () => {
    const items = parseSyllabus(text, today);
    if (!course) setCourse(guessCourse(text));
    setError(items.length === 0 ? "No deadlines found. Each one needs a date and a word like “due”, “paper” or “exam”. If your syllabus points to a separate schedule page, paste that too." : null);
    setRows(items.length ? items.map((i) => ({ ...i, on: i.date >= today })) : null);
  };
  const [reading, setReading] = useState(false);
  const load = async (f: File) => {
    setError(null);
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setError("Please choose a PDF file.");
    setReading(true);
    let t = "";
    try {
      t = await pdfToText(f);
    } catch {
      setReading(false);
      return setError("Couldn’t read that PDF. Try pasting the text instead.");
    }
    setReading(false);
    if (!t.trim()) return setError("That PDF has no readable text (it may be a scan). Try pasting the text instead.");
    setText(t);
    setRows(null);
    if (!course) setCourse(guessCourse(t));
  };
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const chosen = useMemo(() => (rows ?? []).filter((r) => r.on), [rows]);

  const add = () => {
    const inputs: AssignmentInput[] = [];
    for (const r of chosen) {
      const p = AssignmentInput.safeParse({
        title: r.title,
        course: course.trim(),
        type: r.type,
        due_local: `${r.date}T${r.time}`,
        estimate_hours: r.estimate_hours,
        difficulty: r.type === "exam" ? 3 : 2,
        priority: r.type === "exam" ? 3 : 2,
        description: "",
        ai_enabled: null,
      });
      if (!p.success) return setError(`${r.title}: ${p.error.issues[0].message}`);
      inputs.push(p.data);
    }
    addAssignments(inputs);
    router.push("/preview");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Add a syllabus</h1>
        <p className="mt-1 text-base text-muted">Upload a PDF or paste the text. We’ll find the deadlines.</p>
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-50">
            <Upload size={16} aria-hidden /> {reading ? "Reading PDF…" : "Upload PDF"}
          </button>
          <button onClick={() => { setText(sampleSyllabus(today)); setRows(null); setCourse("PSYC 201"); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            <FileText size={16} aria-hidden /> Try an example
          </button>
          <input ref={file} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="Upload syllabus PDF" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
        </div>
        <label className="mt-4 block text-sm font-semibold">
          Syllabus text
          <textarea className={`${field} h-56 text-base`} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} placeholder={"Week 3 - Essay due Oct 14\nMidterm exam: Oct 30"} />
        </label>
        <label className="mt-3 block max-w-xs text-sm font-semibold">
          Course
          <input className={`${field} text-base`} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. PSYC 201" />
        </label>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <button onClick={find} disabled={!text.trim()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          <Sparkles size={18} aria-hidden /> Find deadlines
        </button>
      </section>

      {rows && (
        <section aria-labelledby="found-h" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border">
          <h2 id="found-h" className="text-xl font-bold">We found {rows.length}</h2>
          <p className="text-sm text-muted">Fix anything that looks off, and untick what you don’t want.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-100 px-4 py-3">
            <label className="flex items-center gap-3 font-bold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-blue-600"
                checked={chosen.length === rows.length}
                ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && chosen.length < rows.length; }}
                onChange={(e) => setRows((r) => r && r.map((x) => ({ ...x, on: e.target.checked })))}
              />
              Select all
            </label>
            <span className="text-sm font-semibold text-blue-900">{chosen.length} of {rows.length} selected</span>
          </div>
          <ul className="mt-4 space-y-3">
            {rows.map((r, i) => (
              <li key={i} className={`grid items-center gap-3 rounded-2xl bg-blue-50 p-4 md:grid-cols-[auto_1fr_auto_auto_auto] ${r.on ? "" : "opacity-60"}`}>
                <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={r.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label={`Include ${r.title}`} />
                <div className="min-w-0">
                  <input className={`${field} !mt-0 font-semibold`} value={r.title} onChange={(e) => patch(i, { title: e.target.value })} aria-label="Title" />
                  {(r.check || r.guessed_year || r.weight || r.date < today) && (
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                      {r.date < today && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-800">Already passed</span>}
                      {r.check && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Check the date</span>}
                      {r.guessed_year && !r.check && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-900">Year guessed</span>}
                      {r.weight && <span className="rounded-full bg-white px-2 py-0.5 text-blue-900">{r.weight}% of grade</span>}
                    </p>
                  )}
                </div>
                <select className={`${field} !mt-0`} value={r.type} onChange={(e) => patch(i, { type: e.target.value as Row["type"] })} aria-label="Type">
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input type="date" className={`${field} !mt-0`} value={r.date} onChange={(e) => patch(i, { date: e.target.value })} aria-label="Due date" />
                <label className="flex items-center gap-1.5 text-sm font-medium">
                  <input type="number" min={0.5} step={0.5} className={`${field} !mt-0 w-20`} value={r.estimate_hours} onChange={(e) => patch(i, { estimate_hours: Number(e.target.value) })} aria-label="Hours needed" /> h
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={add} disabled={chosen.length === 0} className="rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              Add {chosen.length} to my plan
            </button>
            <p className="text-sm text-muted">You’ll review the new schedule before it changes.</p>
          </div>
        </section>
      )}
    </div>
  );
}
