/**
 * One-time bootstrap input for the initial Board reporting scope.
 *
 * Runtime reads never reconcile persisted content against this fixture. The
 * initialization marker is consumed after the first successful insert, so an
 * Admin's later edits remain authoritative.
 */
export const DEFAULT_BOARD_REPORTING_SCOPE = [
  {
    prioritySlug: "visitor-experience",
    displayTitle: "Priority 1: Reimagining the Visitor Experience",
    statements: [
      { text: "Reduce Visitor Experience budget impact by $200,000.", kpiSlugs: [] },
      { text: "Increase attendance by 15% to match 2024 attendance.", kpiSlugs: ["program-attendance-vs-baseline"] },
      { text: "Redesign 2 exhibits (synagogue and art installation).", kpiSlugs: ["exhibits-redesigned-or-installed", "artist-installations-visitor-feedback"] },
    ],
  },
  {
    prioritySlug: "historic-preservation",
    displayTitle: "Priority 2: Advancing Historic Preservation",
    statements: [
      { text: "Complete the assessment and outline phase of the Conservation Management Plan.", kpiSlugs: ["conservation-plan-revised"] },
      { text: "Assess and document 15% of historic structures to contribute to preservation guidelines and tools.", kpiSlugs: ["historic-structures-assessed"] },
      { text: "Achieve a 10% increase in preservation-specific funding.", kpiSlugs: ["conservation-funds-utilized", "preservation-campaign-donors"] },
    ],
  },
  {
    prioritySlug: "workforce-development",
    displayTitle: "Priority 3: Expand our Workforce Development Initiatives",
    statements: [
      { text: "Grow funding for 2026 and beyond.", kpiSlugs: [] },
      { text: "Build new partnership structures that replace Rebuild and expand from instructors to diverse job placements.", kpiSlugs: ["workforce-employer-partnerships", "workforce-graduates-employment"] },
      { text: "Build the physical and organizational capacity needed for stable, growing workforce-development initiatives, including the Education Center and staffing structures.", kpiSlugs: [] },
    ],
  },
  {
    prioritySlug: "justice-education",
    displayTitle: "Priority 4: Support Learning through Justice Education",
    statements: [
      { text: "Achieve a 10% increase in student and educator engagement across platforms.", kpiSlugs: ["justice-ed-total-participants", "justice-ed-teachers-pd"] },
      { text: "Achieve a 20% increase in online engagement with digital educational material, measured through webpage views, lesson downloads, and video views.", kpiSlugs: ["justice-ed-online-digital-attendance"] },
      { text: "Increase educator confidence by 20% and the school return rate by 15%.", kpiSlugs: ["justice-ed-educator-confidence", "justice-ed-returning-schools-educators"] },
    ],
  },
  {
    prioritySlug: "organizational-capacity",
    displayTitle: "Priority 5: Advancing Organizational Stability",
    statements: [
      { text: "Achieve a 20% year-over-year increase in earned income and increase multi-year grants or pledges from 5 to 7.", kpiSlugs: ["earned-income-yoy-growth", "multi-year-grants-pledges-value"] },
      { text: "Attain 100% Board participation in annual giving.", kpiSlugs: ["board-giving-participation"] },
      { text: "Implement a new budget and expense tracking system.", kpiSlugs: [] },
    ],
  },
] as const;
