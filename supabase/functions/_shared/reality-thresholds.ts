export const MIN_PUBLIC_GROUP_REPORTS = 5;
export function tierForApprovedReportCount(count: number): 0 | 5 | 15 | 25 | 200 {
  if (!Number.isFinite(count) || count < 5) return 0;
  if (count >= 200) return 200;
  if (count >= 25) return 25;
  if (count >= 15) return 15;
  return 5;
}
export function groupMeetsPublicThreshold(count: number): boolean {
  return Number.isFinite(count) && count >= MIN_PUBLIC_GROUP_REPORTS;
}
