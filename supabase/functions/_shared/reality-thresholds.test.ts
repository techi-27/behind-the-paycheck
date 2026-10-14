import { assertEquals } from "jsr:@std/assert";
import { groupMeetsPublicThreshold, tierForApprovedReportCount } from "./reality-thresholds.ts";

Deno.test("tier thresholds do not unlock early", () => {
  assertEquals(tierForApprovedReportCount(0), 0);
  assertEquals(tierForApprovedReportCount(4), 0);
  assertEquals(tierForApprovedReportCount(5), 5);
  assertEquals(tierForApprovedReportCount(14), 5);
  assertEquals(tierForApprovedReportCount(15), 15);
  assertEquals(tierForApprovedReportCount(24), 15);
  assertEquals(tierForApprovedReportCount(25), 25);
  assertEquals(tierForApprovedReportCount(199), 25);
  assertEquals(tierForApprovedReportCount(200), 200);
});

Deno.test("every individual chart group requires five usable reports", () => {
  assertEquals(groupMeetsPublicThreshold(0), false);
  assertEquals(groupMeetsPublicThreshold(4), false);
  assertEquals(groupMeetsPublicThreshold(5), true);
  assertEquals(groupMeetsPublicThreshold(6), true);
  assertEquals(groupMeetsPublicThreshold(Number.NaN), false);
});
