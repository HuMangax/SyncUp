import { DateTime } from "luxon";

const dt = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);

export const fmtTime = (iso: string, zone: string) => dt(iso, zone).toFormat("h:mm a");
export const fmtDayTime = (iso: string, zone: string) => dt(iso, zone).toFormat("ccc, LLL d · h:mm a");
export const fmtRange = (s: { start_at: string; end_at: string }, zone: string) =>
  `${dt(s.start_at, zone).toFormat("ccc, LLL d · h:mm")}–${dt(s.end_at, zone).toFormat("h:mm a")}`;
export const fmtDue = (iso: string, zone: string) => dt(iso, zone).toFormat("ccc, LLL d · h:mm a");
export const fmtHours = (h: number) => `${Math.round(h * 100) / 100} h`;
