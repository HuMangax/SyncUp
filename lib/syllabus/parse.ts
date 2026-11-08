import type { AssignmentType } from "@/lib/types";

/**
 * Pull deadlines out of pasted syllabus text. Deterministic and AI-free, and built to cope with
 * the ways courses lay this out: one line per item, tables, a date heading with items beneath it,
 * a title with "Due:" on the next line, ranges, "assigned ... due ..." pairs and weekday names.
 * `now` is an argument so the same text always gives the same result.
 */
export type SyllabusItem = {
  title: string;
  type: AssignmentType;
  /** Local "YYYY-MM-DD" */
  date: string;
  /** Local "HH:mm" */
  time: string;
  estimate_hours: number;
  /** Share of the final grade, when the line says so. */
  weight?: number;
  /** The year was not written down and was inferred. */
  guessed_year: boolean;
  /** The date came from a neighbouring line, or there were several dates. Worth a look. */
  check: boolean;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const monthNum = (w: string) => MONTHS[w.slice(0, 3).toLowerCase()] ?? MONTHS[w.toLowerCase()];

type Raw = { y: number | null; m: number; d: number; start: number; end: number };

/** Every date written in a line, left to right. */
function findDates(line: string): Raw[] {
  const out: Raw[] = [];
  const taken = (i: number, e: number) => out.some((o) => i < o.end && e > o.start);
  const add = (r: Raw) => !taken(r.start, r.end) && out.push(r);
  let m: RegExpExecArray | null;

  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(line))) add({ y: +m[1], m: +m[2], d: +m[3], start: m.index, end: m.index + m[0].length });

  // "Oct 14", "October 14th, 2026", and day ranges "Oct 14-16" (the end of the range is kept).
  const mf = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?![\\d:]|\\s*[-–]\\s*\\d|\\s*(?:am|pm)))?(?:,?\\s+(20\\d{2}))?`, "gi");
  while ((m = mf.exec(line))) add({ y: m[4] ? +m[4] : null, m: monthNum(m[1]), d: +(m[3] ?? m[2]), start: m.index, end: m.index + m[0].length });

  // "14 Oct 2026"
  const df = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?(?:,?\\s+(20\\d{2}))?`, "gi");
  while ((m = df.exec(line))) add({ y: m[3] ? +m[3] : null, m: monthNum(m[2]), d: +m[1], start: m.index, end: m.index + m[0].length });

  // "10/14", "10/14/26"
  const sl = /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/g;
  while ((m = sl.exec(line))) {
    if (+m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) continue;
    add({ y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, m: +m[1], d: +m[2], start: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

const KEYWORDS: [RegExp, AssignmentType, number][] = [
  [/\b(final exam|midterm|mid-term|exam|test)\b/i, "exam", 10],
  [/\bquiz(zes)?\b/i, "exam", 2],
  [/\b(project|presentation|proposal|capstone|portfolio|deliverable|milestone|prototype|poster|workplan|work plan|pitch|speech|slides)\b/i, "project", 8],
  [/\b(assignment|assn|paper|essay|report|homework|hw|lab|case|problem set|pset|reflection|response|worksheet|journal|draft|submission|bibliography|discussion post|reading quiz|written)\b/i, "assignment", 4],
];
/** Lines that mention a date but are not work the student has to hand in. */
const NOT_WORK = /\b(no class|class cancel+ed|holiday|reading week|spring break|fall break|winter break|term break|office hours?|last day to (?:drop|withdraw)|withdraw(?:al)?|drop deadline|grades? (?:posted|released)|statutory|campus closed|registration|tuition|lecture:|guest speaker)\b|\b(late (?:work|assignments?|submissions?)|penalt(?:y|ies)|per day|each day late|extension)\b/i;
const ASSIGNED = /\b(assigned|released|posted|handed out|available|opens?|starts?|begins?|out)\b/i;
const FINAL_EXAM = /\bfinal\b.*\bexam\b|\bexam\b.*\bfinal\b|\bfinal exam\b/i;

const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Year the syllabus belongs to ("Fall 2026"). A fall term runs into the new year. */
function termHint(text: string): { year: number; fall: boolean } | null {
  const head = text.split(/\r?\n/).slice(0, 25).join(" ");
  const t = /\b(fall|autumn|winter|spring|summer)\b[^\n]{0,12}?(20\d{2})/i.exec(head) ?? /(20\d{2})\s*(fall|autumn|winter|spring|summer)\b/i.exec(head);
  if (t) {
    const season = (isNaN(+t[1]) ? t[1] : t[2]).toLowerCase();
    const year = +(isNaN(+t[1]) ? t[2] : t[1]);
    return { year, fall: season === "fall" || season === "autumn" };
  }
  const y = /\b(20\d{2})\b/.exec(head);
  return y ? { year: +y[1], fall: false } : null;
}

function parseTime(line: string): string | null {
  const range = /\b(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)\b/i.exec(line);
  if (range) {
    let h = +range[1] % 12;
    if (range[4].toLowerCase() === "pm" && +range[1] < +range[3] + (+range[3] === 12 ? 12 : 0)) h += 12;
    return `${pad(h)}:${range[2] ?? "00"}`;
  }
  const t = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(line);
  if (t) {
    let h = +t[1] % 12;
    if (t[3][0].toLowerCase() === "p") h += 12;
    return `${pad(h)}:${t[2] ?? "00"}`;
  }
  if (/\bmidnight\b/i.test(line)) return "23:59";
  if (/\bnoon\b/i.test(line)) return "12:00";
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(line);
  return h24 ? `${pad(+h24[1])}:${h24[2]}` : null;
}

/** Which of several dates in one line is the deadline. */
function pickDate(line: string, dates: Raw[]): { d: Raw; unsure: boolean } {
  if (dates.length === 1) return { d: dates[0], unsure: false };
  const before = (d: Raw) => line.slice(Math.max(0, d.start - 18), d.start);
  const dueOnes = dates.filter((d) => /\b(due|deadline|submit(?:ted)?|by)\W*(?:on\W*)?$/i.test(before(d)));
  if (dueOnes.length) return { d: dueOnes[dueOnes.length - 1], unsure: false };
  const notAssigned = dates.filter((d) => !ASSIGNED.test(before(d)));
  if (notAssigned.length === 1) return { d: notAssigned[0], unsure: false };
  const pool = notAssigned.length ? notAssigned : dates;
  return { d: pool[pool.length - 1], unsure: true };
}

const stripDate = (line: string, dates: Raw[]) => {
  let out = line;
  for (const d of [...dates].sort((a, b) => b.start - a.start)) out = out.slice(0, d.start) + " " + out.slice(d.end);
  return out;
};

function cleanTitle(raw: string): string {
  return raw
    .replace(/\|/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b/gi, " ")
    .replace(/\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b\.?,?/gi, " ")
    .replace(/\b(?:due|deadline|submit(?:ted)?|hand[- ]?in|turn[- ]?in|assigned|released)\b\W*(?:on|by)?/gi, " ")
    .replace(/\(?\s*\d{1,3}(?:\.\d+)?\s*%\s*\)?/g, " ")
    .replace(/^\s*\d{1,2}[A-Za-z]\b\s*/, "")
    .replace(/\bno class(?: in lieu of)?\b/gi, " ")
    .replace(/(?:\s+(?:before|by|to|on|at|in|for))+\s*$/i, "")
    .replace(/^\s*(?:week|wk)\s*\d+\s*[:\-–—.]?\s*/i, "")
    .replace(/^[\s\-–—•*·▪◦>#\d.)\]:]+(?=[A-Za-z])/, "")
    .replace(/[\s\-–—:|,;(\[]+$/, "")
    .replace(/^[\s\-–—:|,;)\]]+/, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120);
}

export function parseSyllabus(text: string, nowLocalDate: string): SyllabusItem[] {
  const [ny, nm, nd] = nowLocalDate.split("-").map(Number);
  const hint = termHint(text);
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, " | ").replace(/\s+/g, " ").trim());
  // Page headers and footers ("COMM 396 4 October 26, 2026") repeat on every page. They are not deadlines.
  const shape = (l: string) => l.replace(/\d+/g, "#");
  const seenShape = new Map<string, number>();
  for (const l of rawLines) if (findDates(l).length) seenShape.set(shape(l), (seenShape.get(shape(l)) ?? 0) + 1);
  const lines = rawLines.map((l) => ((seenShape.get(shape(l)) ?? 0) >= 3 ? "" : l));

  const resolveYear = (r: Raw): { y: number; guessed: boolean } => {
    if (r.y != null) return { y: r.y, guessed: false };
    if (hint) return { y: hint.fall && r.m <= 4 ? hint.year + 1 : hint.year, guessed: true };
    return { y: r.m > nm || (r.m === nm && r.d >= nd) ? ny : ny + 1, guessed: true };
  };
  const kindOf = (line: string) => KEYWORDS.find(([re]) => re.test(line));

  const out: SyllabusItem[] = [];
  const seen = new Set<string>();
  const inferredKeys = new Set<string>();
  const push = (line: string, titleSource: string, d: Raw, unsure: boolean, inferred: boolean, timeLine: string, viaDue = false) => {
    const kw = kindOf(line);
    if (!kw || d.d < 1 || d.d > 31 || d.m < 1 || d.m > 12) return;
    const { y, guessed } = resolveYear(d);
    if (!valid(y, d.m, d.d)) return;
    const type = kw[1];
    let hours = kw[2];
    if (FINAL_EXAM.test(line)) hours = 12;
    const w = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
    const weight = w && +w[1] <= 100 ? +w[1] : undefined;
    if (weight && weight >= 25 && type === "assignment") hours += 2;
    if (weight && weight >= 25 && type === "project") hours += 4;
    // Table rows: the title is the cell that names the work, not the whole row.
    let source = titleSource;
    if (source.includes("|")) {
      const cells = source.split("|").map((c) => c.trim()).filter(Boolean);
      const work = cells.filter((c) => kindOf(c));
      if (work.length) source = work[work.length - 1];
    }
    let title = cleanTitle(source);
    if (!title) title = type === "exam" ? "Exam" : "Assignment";
    const date = `${y}-${pad(d.m)}-${pad(d.d)}`;
    const key = `${title.toLowerCase()}|${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ title, type, date, time: parseTime(timeLine) ?? "17:00", estimate_hours: hours, weight, guessed_year: guessed, check: unsure || inferred });
    if (inferred && !viaDue) inferredKeys.add(key);
  };

  let header: { d: Raw; at: number } | null = null; // a date heading that owns the lines beneath it
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 3) {
      header = null;
      continue;
    }
    let dates = findDates(line);
    // "9B Nov 5 ..." is a schedule row: that date is the class day, not a deadline.
    const rowDate = /^\d{1,2}[A-Za-z]\s+/.exec(line);
    if (rowDate && dates.length && dates[0].start === rowDate[0].length) dates = dates.slice(1);
    if (rowDate && dates.length === 0) continue;
    const kw = kindOf(line);
    const worthless = NOT_WORK.test(line.replace(/no class in lieu of/i, " ")) && !/\bdue\b/i.test(line);

    const dueAt = line.search(/\bdue\b/i);
    if (dueAt >= 0 && !dates.some((d) => d.start > dueAt)) continue; // "... DUE Sunday Sept" with the day on the next line
    if (dates.length && kw && !worthless) {
      const { d, unsure } = pickDate(line, dates);
      push(line, stripDate(line, findDates(line)), d, unsure, false, line, false);
      continue;
    }
    if (dates.length && !kw) {
      // A date heading ("Oct 14", "Week 6 - Tue, Oct 14:") with the work listed below it.
      const rest = cleanTitle(stripDate(line, dates));
      if (rest.length <= 25 && !worthless) header = { d: pickDate(line, dates).d, at: i };
      continue;
    }
    if (kw && !worthless && !dates.length) {
      // Title on one line, "Due: Oct 14" on the next one or two.
      let found: { d: Raw; unsure: boolean; at: number } | null = null;
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const nd2 = findDates(lines[j]);
        if (nd2.length && /\b(due|deadline|submit(?:ted)?|date)\b/i.test(lines[j]) && !kindOf(stripDate(lines[j], nd2))) {
          found = { ...pickDate(lines[j], nd2), at: j };
          break;
        }
        if (kindOf(lines[j])) break;
      }
      if (found) {
        push(line, line, found.d, found.unsure, true, `${line} ${lines[found.at]}`);
        continue;
      }
      if (header && i - header.at <= 5) push(line, line, header.d, false, true, line);
    }
  }

  // Pass 2: deadlines announced with the word "due", wherever the table put the pieces.
  const anchored = dueAnchored(lines, resolveYear, kindOf);
  const sameWork = (a: string, b: string) => {
    const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tb = b.toLowerCase().split(/\W+/).filter(Boolean);
    return tb.length > 0 && tb.filter((w) => ta.has(w)).length / Math.min(ta.size || 1, tb.length) >= 0.5;
  };
  let merged = out;
  if (anchored.length >= 3) merged = out.filter((i) => !inferredKeys.has(`${i.title.toLowerCase()}|${i.date}`)); // the table made header guesses unreliable
  for (const a of anchored) {
    const dup = merged.findIndex((m) => m.date === a.date && sameWork(m.title, a.title));
    if (dup < 0) merged.push(a);
    else if (a.title.split(/\s+/).length > merged[dup].title.split(/\s+/).length) merged[dup] = { ...merged[dup], title: a.title };
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

type KindOf = (line: string) => [RegExp, AssignmentType, number] | undefined;

/**
 * Real syllabi often flatten a schedule table into interleaved lines: the title in one column,
 * "DUE Sunday Sept" at the end of a line and "27 11:59 pm" at the start of the next. Every "due"
 * is an anchor; the date is the one after it, found on this line or the next few, and the title
 * is the work named before it.
 */
function dueAnchored(lines: string[], resolveYear: (r: Raw) => { y: number; guessed: boolean }, kindOf: KindOf): SyllabusItem[] {
  const out: SyllabusItem[] = [];
  const monthEnd = new RegExp(`${MON}\\.?\\s*$`, "i");
  const hasTime = (t: string) => /\d{1,2}(?::\d{2})?\s*(?:am|pm)|\b(?:before|by)\b|\b11:59/i.test(t);

  lines.forEach((line, i) => {
    const m = /\bdue\b/i.exec(line);
    if (!m || NOT_WORK.test(line)) return;
    const before = line.slice(0, m.index);
    const after = line.slice(m.index + m[0].length);
    // "due dates", "will be due at 11:59 pm": talking about due dates, not announcing one.
    if (/^\s*(?:dates?\b|at\b|in\b|within\b|on the\b)/i.test(after) || /\b(?:the|are|be|is|when)\s*$/i.test(before)) return;
    let raw: Raw | null = null;
    let from = line;
    let viaNeighbour = false;
    let unsure = false;

    const same = findDates(after);
    if (same.length) raw = same[0];
    else {
      const tail = monthEnd.exec(after.trim());
      if (tail) {
        // "DUE Sunday Sept" and the day number starts one of the next lines.
        for (let j = i + 1; j <= i + 2 && j < lines.length && !raw; j++) {
          const n = /\b(\d{1,2})(?:st|nd|rd|th)?(?=\s+\d{1,2}:\d{2}|\s+to\b|\s*$|\s+(?:before|by)\b)/.exec(lines[j]);
          if (n && +n[1] >= 1 && +n[1] <= 31) {
            raw = { y: null, m: monthNum(tail[1]), d: +n[1], start: 0, end: 0 };
            from = `${line} ${lines[j]}`;
            viaNeighbour = true;
          }
        }
      }
      if (!raw) {
        // Dates on the following lines: the one with a weekday or a time next to it is the deadline.
        let best: { r: Raw; score: number; line: string } | null = null;
        let ties = 0;
        for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
          if (/\bdue\b/i.test(lines[j])) break;
          for (const r of findDates(lines[j])) {
            const left = lines[j].slice(Math.max(0, r.start - 12), r.start);
            const right = lines[j].slice(r.end, r.end + 24);
            const score = (/\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)[a-z]*\.?,?\s*$/i.test(left) ? 1 : 0) + (hasTime(right) ? 2 : 0);
            if (!best || score > best.score) {
              best = { r, score, line: lines[j] };
              ties = 0;
            } else if (score === best.score) ties++;
          }
        }
        if (best && best.score >= 1) {
          raw = best.r;
          from = `${line} ${best.line}`;
          viaNeighbour = true;
          unsure = ties > 0 && best.score === 0;
        }
      }
    }
    if (!raw) return;
    const { y, guessed } = resolveYear(raw);
    if (!valid(y, raw.m, raw.d)) return;

    // Title: the work named before "due". A reading-list fragment or a lone word borrows from the line above.
    const clean = (t: string) => cleanTitle(stripDate(t, findDates(t)).replace(/^\s*\d{1,2}[A-Z]\b/, " "));
    let title = clean(before);
    const words = title.split(/\s+/).filter(Boolean);
    let borrowed = false;
    const goodAlone = words.length >= 2 && (words.length <= 4 || !!kindOf(title));
    if (!goodAlone) {
      for (let k = i - 1; k >= Math.max(0, i - 2); k--) {
        if (/\bdue\b/i.test(lines[k])) break;
        const cand = clean(lines[k]);
        if (cand && kindOf(cand) && !/https?:|www\./i.test(cand)) {
          title = words.length === 1 ? `${cand} ${title}` : cand;
          borrowed = true;
          break;
        }
      }
    } else if (words.length > 4) {
      title = words.slice(-3).join(" ");
    }
    if (!title) title = "Deadline";
    const kw = kindOf(title) ?? kindOf(before) ?? KEYWORDS[3];
    const w = /(\d{1,3})\s*%/.exec(from);
    out.push({
      title: title.slice(0, 120),
      type: kw[1],
      date: `${y}-${pad(raw.m)}-${pad(raw.d)}`,
      time: parseTime(from.slice(from.search(/\bdue\b/i))) ?? "23:59",
      estimate_hours: kw[2],
      weight: w && +w[1] <= 100 ? +w[1] : undefined,
      guessed_year: guessed,
      check: true && (viaNeighbour || borrowed || unsure || guessed),
    });
  });
  return out;
}

/** Example text whose dates are offsets from today, so the demo never goes stale. */
export function sampleSyllabus(todayLocal: string): string {
  const [y, m, d] = todayLocal.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const at = (days: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${names[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  };
  return `PSYC 201: Intro to Cognition
Week 2 - Reading response due ${at(6)}
Week 4 - Memory lab report due ${at(13)} by 11:59 pm
Week 6: Midterm exam on ${at(20)}
Group project proposal due ${at(27)}
Week 10 - Final paper: ${at(40)}
Final exam: ${at(52)}, 9:00 am`;
}
