import type { DiffKind, PlannerState, StudySession } from "@/lib/types";
import { buildGrid, isFree, lockedSessions } from "@/lib/scheduler/availability";
import { effectiveDeadlineSlot } from "@/lib/scheduler/pace";
import { localDateKey, slotCeil, slotFloor } from "@/lib/time/slots";

export type Pair = { kind: DiffKind; before?: StudySession; after?: StudySession };

const byStart = (a: StudySession, b: StudySession) =>
  a.start_at.localeCompare(b.start_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const len = (s: StudySession) => Date.parse(s.end_at) - Date.parse(s.start_at);

/**
 * Turn a fresh scheduler output into a stable proposal against the previous movable sessions.
 *
 * 1. Exact match (same assignment, same time): kept, the old session object is reused.
 * 2. Stability pass: a new session snaps back to an old slot of the same assignment, on the same
 *    day and with the same length, when that slot is still valid (free, before the deadline,
 *    break respected). Kept.
 * 3. Remaining sessions pair up per assignment, same day first, then in time order: moved (old id,
 *    new time). Extra new ones are added; extra old ones are removed.
 */
export function reconcile(
  prev: StudySession[],
  next: StudySession[],
  state: PlannerState,
  now: string,
): { sessions: StudySession[]; pairs: Pair[]; isStillValid: (s: StudySession) => boolean } {
  const { settings } = state;
  const h0 = slotCeil(now);
  const brkMs = settings.break_min * 60_000;
  const zone = settings.timezone;
  const locked = lockedSessions(state.sessions, h0);
  const ends = [...prev, ...next].map((s) => slotCeil(s.end_at));
  const grid = buildGrid(settings, state.busy, locked, h0, Math.max(h0 + 1, ...ends) + 1);
  const deadline = new Map(state.assignments.map((a) => [a.id, effectiveDeadlineSlot(a)]));

  /** Hard-limit check for a slot ignoring other planned sessions. */
  const isStillValid = (s: StudySession) => {
    const a = slotFloor(s.start_at);
    const b = slotCeil(s.end_at);
    if (a < h0 || b > (deadline.get(s.assignment_id) ?? -Infinity)) return false;
    for (let t = a; t < b; t++) if (!isFree(grid, t)) return false;
    return true;
  };
  const clashes = (s: StudySession, others: StudySession[]) =>
    others.some(
      (o) => Date.parse(o.start_at) - brkMs < Date.parse(s.end_at) && Date.parse(s.start_at) < Date.parse(o.end_at) + brkMs,
    );

  const result = [...next].sort(byStart);
  const matchedOld = new Map<number, StudySession>(); // result index -> old session
  const usedOld = new Set<string>();
  const prevSorted = [...prev].sort(byStart);

  // 1. Exact matches
  result.forEach((n, i) => {
    const o = prevSorted.find(
      (x) => !usedOld.has(x.id) && x.assignment_id === n.assignment_id && x.start_at === n.start_at && x.end_at === n.end_at,
    );
    if (o) {
      matchedOld.set(i, o);
      usedOld.add(o.id);
    }
  });

  // 2. Stability pass
  result.forEach((n, i) => {
    if (matchedOld.has(i)) return;
    const day = localDateKey(n.start_at, zone);
    const candidates = prevSorted
      .filter(
        (o) =>
          !usedOld.has(o.id) &&
          o.assignment_id === n.assignment_id &&
          len(o) === len(n) &&
          localDateKey(o.start_at, zone) === day,
      )
      .sort(
        (x, y) =>
          Math.abs(Date.parse(x.start_at) - Date.parse(n.start_at)) - Math.abs(Date.parse(y.start_at) - Date.parse(n.start_at)) ||
          byStart(x, y),
      );
    const others = result.filter((_, j) => j !== i);
    const o = candidates.find((c) => isStillValid(c) && !clashes(c, others));
    if (o) {
      result[i] = { ...n, start_at: o.start_at, end_at: o.end_at };
      matchedOld.set(i, o);
      usedOld.add(o.id);
    }
  });

  const pairs: Pair[] = [];
  const sessions: StudySession[] = [];
  result.forEach((n, i) => {
    const o = matchedOld.get(i);
    if (o) {
      sessions.push(o);
      pairs.push({ kind: "kept", before: o, after: o });
    }
  });

  // 3. Pair the rest per assignment: same-day pairs first (closest start), then the rest in time order.
  const ids = [...new Set([...prevSorted, ...result].map((s) => s.assignment_id))].sort();
  for (const aid of ids) {
    const olds = prevSorted.filter((o) => o.assignment_id === aid && !usedOld.has(o.id));
    const news = result.filter((n, i) => n.assignment_id === aid && !matchedOld.has(i));
    const pairedOld = new Set<string>();
    const pairedNew = new Set<StudySession>();
    const emitMoved = (o: StudySession, n: StudySession) => {
      const moved = { ...n, id: o.id };
      sessions.push(moved);
      pairs.push({ kind: "moved", before: o, after: moved });
      pairedOld.add(o.id);
      pairedNew.add(n);
    };
    for (const n of news) {
      const day = localDateKey(n.start_at, zone);
      const o = olds
        .filter((x) => !pairedOld.has(x.id) && localDateKey(x.start_at, zone) === day)
        .sort(
          (x, y) =>
            Math.abs(Date.parse(x.start_at) - Date.parse(n.start_at)) - Math.abs(Date.parse(y.start_at) - Date.parse(n.start_at)) ||
            byStart(x, y),
        )[0];
      if (o) emitMoved(o, n);
    }
    const restOld = olds.filter((o) => !pairedOld.has(o.id));
    const restNew = news.filter((n) => !pairedNew.has(n));
    for (let j = 0; j < Math.max(restOld.length, restNew.length); j++) {
      if (j < restOld.length && j < restNew.length) emitMoved(restOld[j], restNew[j]);
      else if (j < restNew.length) {
        sessions.push(restNew[j]);
        pairs.push({ kind: "added", after: restNew[j] });
      } else pairs.push({ kind: "removed", before: restOld[j] });
    }
  }

  sessions.sort(byStart);
  const pos = (p: Pair) => (p.after ?? p.before)!;
  pairs.sort((x, y) => byStart(pos(x), pos(y)) || x.kind.localeCompare(y.kind));
  return { sessions, pairs, isStillValid };
}
