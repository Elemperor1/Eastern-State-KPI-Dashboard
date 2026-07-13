/**
 * Compatibility exports for the UI download component. CSV serialization is
 * domain-neutral so server and client exports share the same safety policy.
 */
export {
  buildCSV,
  ensureCsvExt,
  escapeCell,
  inferColumns,
  neutralizeFormulaPrefix,
} from "@/lib/csv";
