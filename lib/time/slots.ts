import { DateTime } from "luxon";
import type { ISO, Slot } from "@/lib/types";

/** 15-minute grid. Slot index = floor(epoch ms / SLOT_MS). Absolute, so DST-safe. */
export const SLOT_MINUTES = 15;
export const SLOT_MS = SLOT_MINUTES * 60_000;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

export const isoToMs = (iso: ISO): number => Date.parse(iso);

/** Slot containing the instant (floor). */
export const slotFloor = (iso: ISO): Slot => Math.floor(isoToMs(iso) / SLOT_MS);

/** First slot that starts at or after the instant (ceil). */
export const slotCeil = (iso: ISO): Slot => Math.ceil(isoToMs(iso) / SLOT_MS);

export const slotToIso = (slot: Slot): ISO => new Date(slot * SLOT_MS).toISOString();

export const hoursToSlots = (hours: number): number => Math.round(hours * SLOTS_PER_HOUR);
export const minutesToSlots = (minutes: number): number => Math.round(minutes / SLOT_MINUTES);
export const slotsToHours = (slots: number): number => slots / SLOTS_PER_HOUR;
export const roundUpToSlots = (hours: number): number => Math.ceil(hours * SLOTS_PER_HOUR - 1e-9);

// ---------- wall-clock helpers (zone-aware) ----------

export const parseHM = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "YYYY-MM-DD" local date for an instant. */
export const localDateKey = (iso: ISO, zone: string): string =>
  DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toISODate() as string;

export const slotLocalDateKey = (slot: Slot, zone: string): string =>
  localDateKey(slotToIso(slot), zone);

/** 0 = Sunday ... 6 = Saturday for a local "YYYY-MM-DD". */
export const weekdayOf = (dateKey: string): number =>
  DateTime.fromISO(dateKey, { zone: "utc" }).weekday % 7;

export const addDays = (dateKey: string, n: number): string =>
  DateTime.fromISO(dateKey, { zone: "utc" }).plus({ days: n }).toISODate() as string;

export const diffDays = (fromKey: string, toKey: string): number =>
  Math.round(
    DateTime.fromISO(toKey, { zone: "utc" }).diff(DateTime.fromISO(fromKey, { zone: "utc" }), "days").days,
  );

/** Local wall-clock "HH:mm" on a local date -> UTC ISO. A 9:00 class stays 9:00 across DST. */
export const localToUtc = (dateKey: string, hm: string, zone: string): ISO => {
  const mins = parseHM(hm);
  const dt = DateTime.fromISO(dateKey, { zone }).plus({ minutes: 0 }).set({
    hour: Math.floor(mins / 60),
    minute: mins % 60,
    second: 0,
    millisecond: 0,
  });
  return dt.toUTC().toISO() as ISO;
};

/** Slot range [start, end) of a local calendar day (23 or 25 hours on DST days). */
export const dayRange = (dateKey: string, zone: string): { start: Slot; end: Slot } => {
  const start = DateTime.fromISO(dateKey, { zone }).startOf("day");
  const end = start.plus({ days: 1 }).startOf("day");
  return { start: Math.floor(start.toMillis() / SLOT_MS), end: Math.floor(end.toMillis() / SLOT_MS) };
};

/** Slot for local wall-clock hm on a local date. */
export const localSlot = (dateKey: string, hm: string, zone: string): Slot =>
  slotFloor(localToUtc(dateKey, hm, zone));

/** Local wall-clock "HH:mm" for display. */
export const formatLocal = (iso: ISO, zone: string, fmt = "h:mm a"): string =>
  DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toFormat(fmt);

/** Local "HH:mm" minutes-from-midnight of a slot. */
export const slotLocalMinutes = (slot: Slot, zone: string): number => {
  const dt = DateTime.fromMillis(slot * SLOT_MS, { zone });
  return dt.hour * 60 + dt.minute;
};

/** The Monday (local) on or after/containing the given instant's local date. */
export const mondayOnOrBefore = (dateKey: string): string => {
  const wd = weekdayOf(dateKey); // 0 Sun
  const back = (wd + 6) % 7; // days since Monday
  return addDays(dateKey, -back);
};
