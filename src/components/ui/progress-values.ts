export function normalizeProgressValue(value: number, max = 100): {
  value: number;
  max: number;
  percentage: number;
} {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? value : 0;
  const clampedValue = Math.max(0, Math.min(safeMax, safeValue));
  return {
    value: clampedValue,
    max: safeMax,
    percentage: (clampedValue / safeMax) * 100,
  };
}
