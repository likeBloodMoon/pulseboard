export function normalizeMemory(
  used?: number,
  total?: number
): { usedGb?: number; totalGb?: number; percent?: number } {
  if (used === undefined || used === null || total === undefined || total === null) {
    return {};
  }

  const usedGb = total > 1024 ? used / 1024 : used;
  const totalGb = total > 1024 ? total / 1024 : total;
  const percent = totalGb > 0 ? (usedGb / Math.max(totalGb, 0.01)) * 100 : undefined;

  return { usedGb, totalGb, percent };
}
