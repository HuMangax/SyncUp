import type { BreakdownResult } from "./breakdown";

/**
 * Pre-cached breakdowns for the three demo assignments, so the demo needs no network and no key.
 * Keyed by lower-cased title.
 */
const CACHE: Record<string, Omit<BreakdownResult, "source">> = {
  "marketing paper": {
    subtasks: [
      { title: "Pick the product and gather sources", description: "Choose the brand and collect 4 to 6 credible sources on its positioning.", estimateHours: 1.5, order: 1 },
      { title: "Map the positioning", description: "Build a perceptual map and note competitors and target segment.", estimateHours: 1, order: 2 },
      { title: "Outline the argument", description: "Thesis, three supporting points and a recommendation.", estimateHours: 1, order: 3 },
      { title: "Write the first draft", description: "Draft all sections from the outline without polishing.", estimateHours: 2.5, order: 4 },
      { title: "Edit and cite", description: "Tighten the argument, fix citations and formatting.", estimateHours: 1.5, order: 5 },
      { title: "Final read-through", description: "Read aloud once and check against the rubric.", estimateHours: 0.5, order: 6 },
    ],
    assumptions: ["Paper is around 2,000 words with APA citations."],
  },
  "statistics midterm": {
    subtasks: [
      { title: "Rebuild the formula sheet", description: "Hypothesis tests, regression and ANOVA in one page.", estimateHours: 1.5, order: 1 },
      { title: "Hypothesis testing practice", description: "Work through past problems on t-tests and p-values.", estimateHours: 3, order: 2 },
      { title: "Regression practice", description: "Interpret coefficients, R-squared and residual plots.", estimateHours: 3, order: 3 },
      { title: "ANOVA practice", description: "One-way ANOVA problems and post-hoc reasoning.", estimateHours: 2, order: 4 },
      { title: "Timed mock exam", description: "Full past paper under exam conditions, then mark it.", estimateHours: 2.5, order: 5 },
    ],
    assumptions: ["A past paper or practice set is available from the course site."],
  },
  "operations case": {
    subtasks: [
      { title: "Read the case and pull the numbers", description: "Note demand, lead times and holding costs.", estimateHours: 1, order: 1 },
      { title: "Model inventory options", description: "Compare EOQ and a periodic review policy in a spreadsheet.", estimateHours: 1.5, order: 2 },
      { title: "Write the recommendation", description: "One-page recommendation with the key trade-offs.", estimateHours: 1.5, order: 3 },
      { title: "Check and submit", description: "Verify calculations and format exhibits.", estimateHours: 1, order: 4 },
    ],
    assumptions: ["Deliverable is a short written recommendation with exhibits."],
  },
};

export function cachedBreakdown(title: string): BreakdownResult | null {
  const hit = CACHE[title.trim().toLowerCase()];
  return hit ? { ...hit, subtasks: hit.subtasks.map((s) => ({ ...s })), assumptions: [...hit.assumptions], source: "cache" } : null;
}
