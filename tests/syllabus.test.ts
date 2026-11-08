import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSyllabus, sampleSyllabus } from "@/lib/syllabus/parse";

describe("parseSyllabus", () => {
  it("finds every line of the sample, with type, time and inferred year", () => {
    const items = parseSyllabus(sampleSyllabus("2026-11-09"), "2026-11-09");
    expect(items.map((i) => [i.date, i.type])).toEqual([
      ["2026-11-15", "assignment"],
      ["2026-11-22", "assignment"],
      ["2026-11-29", "exam"],
      ["2026-12-06", "project"],
      ["2026-12-19", "assignment"],
      ["2026-12-31", "exam"],
    ]);
    expect(items).toHaveLength(6);
    expect(items[1].time).toBe("23:59");
    expect(items[5].time).toBe("09:00");
    expect(items[0].guessed_year).toBe(true);
  });

  it("rolls dates that already passed into next year, keeps explicit years", () => {
    expect(parseSyllabus("Essay due Jan 5", "2026-11-01")[0].date).toBe("2027-01-05");
    expect(parseSyllabus("Essay due Jan 5, 2026", "2026-11-01")[0].date).toBe("2026-01-05");
  });

  it("handles numeric dates and is deterministic", () => {
    const a = parseSyllabus("Quiz 1 - 10/14\nHW 3 due 2026-10-21", "2026-10-01");
    expect(a.map((i) => i.date)).toEqual(["2026-10-14", "2026-10-21"]);
    expect(parseSyllabus("Quiz 1 - 10/14\nHW 3 due 2026-10-21", "2026-10-01")).toEqual(a);
  });

  it("returns nothing for text without dates", () => {
    expect(parseSyllabus("Welcome to class. Homework is important.", "2026-10-01")).toEqual([]);
  });
});

describe("different syllabus styles", () => {
  const rows = (t: string, now = "2026-09-01") => parseSyllabus(t, now).map((i) => `${i.date} ${i.type} ${i.title}`);

  it("tables", () => {
    const t = `Date | Topic | Deliverable
Sep 14 | Intro | Assignment 1 (10%)
Oct 5 | Midterm review | Midterm exam (30%)
Oct 19 | Lecture: Memory | Reading: Ch 4`;
    expect(rows(t)).toEqual(["2026-09-14 assignment Assignment 1", "2026-10-05 exam Midterm exam"]);
  });

  it("date headings with items beneath", () => {
    const t = `Week 6 - Tue, Oct 14:
 - Essay 2 draft
 - Lab report 3
Week 7 - Oct 21
 - Group project proposal`;
    expect(rows(t)).toEqual(["2026-10-14 assignment Essay 2 draft", "2026-10-14 assignment Lab report 3", "2026-10-21 project Group project proposal"]);
  });

  it("title with Due on the next line", () => {
    const t = `Research paper
Due: November 3, 11:59 PM
Final exam
Date: December 10`;
    const items = parseSyllabus(t, "2026-09-01");
    expect(items.map((i) => [i.title, i.date, i.time])).toEqual([
      ["Research paper", "2026-11-03", "23:59"],
      ["Final exam", "2026-12-10", "17:00"],
    ]);
    expect(items.every((i) => i.check)).toBe(true);
  });

  it("picks the due date when a line has an assigned date too, and ignores non-work lines", () => {
    const t = `Case study 2 (assigned Oct 1, due Oct 15)
Reading week: Oct 20-24, no class
Last day to withdraw: Oct 31
Late assignments lose 10% per day after Nov 5`;
    expect(rows(t)).toEqual(["2026-10-15 assignment Case study 2"]);
  });

  it("uses the term year and rolls a fall term into January", () => {
    const t = `PSYC 201 - Fall 2026
Essay due Dec 4
Final exam Jan 12`;
    expect(rows(t, "2026-01-01")).toEqual(["2026-12-04 assignment Essay", "2027-01-12 exam Final exam"]);
  });
});

describe("a real syllabus whose schedule table was flattened into lines", () => {
  const table = readFileSync(new URL("./fixtures/flattened-schedule-table.txt", import.meta.url), "utf8");
  const items = parseSyllabus(table, "2026-09-01");

  it("finds the deadlines announced with DUE, with the right dates and times", () => {
    const got = items.map((i) => `${i.date} ${i.time} ${i.title}`);
    expect(got).toContain("2026-09-27 23:59 FN Readings assignment");
    expect(got).toContain("2026-10-04 23:59 Community Assessment");
    expect(got).toContain("2026-10-06 23:59 Pitch Session Deliverable");
    expect(got).toContain("2026-10-18 23:59 First Nations Proposal");
    expect(got).toContain("2026-10-20 23:59 Group Workplan");
    expect(got).toContain("2026-10-28 22:00 Group Presentation slides");
    expect(got).toContain("2026-11-04 19:00 Midterm");
    expect(got).toContain("2026-11-15 23:59 Minor Assignment #3");
    expect(got).toContain("2026-11-30 17:00 Personal Commitment Speech slides");
  });

  it("does not turn class days, page footers or reading titles into deadlines", () => {
    expect(items).toHaveLength(11);
    expect(items.some((i) => i.date === "2026-10-26")).toBe(false); // the footer date
    expect(items.some((i) => i.date === "2026-09-08" || i.date === "2026-09-10")).toBe(false); // class days
  });
});

describe("a syllabus that keeps its dates on another page", () => {
  it("returns nothing instead of guessing", () => {
    const t = `See the assessment schedule on the course homepage for homework due dates.
Registration will close by the end of the day on Wednesday September 16th.
Homework 5 is excluded from the drop grade policy.
Assignments will be due at 11:59 PM on the due date.`;
    expect(parseSyllabus(t, "2026-09-01")).toEqual([]);
  });
});
