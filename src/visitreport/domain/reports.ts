import type { ReportPage, VrEvent, Report } from "../types.js";
import { normalizeStatus } from "./shared.js";

export function collectReportMatches(events: VrEvent[], results: PromiseSettledResult<ReportPage>[], status?: string) {
  const wanted = status ? normalizeStatus(status) : undefined;
  const failedEventIds: string[] = [];
  const eventsWithMoreMatches: string[] = [];
  const matches: { eventId: string; eventTitle: string; report: Report }[] = [];
  results.forEach((result, index) => {
    const event = events[index] as VrEvent;
    if (result.status === "rejected") {
      failedEventIds.push(event.id);
      return;
    }
    if (result.value.hasMore) eventsWithMoreMatches.push(event.id);
    for (const report of result.value.reports) {
      if (wanted && normalizeStatus(report.status) !== wanted) continue;
      matches.push({ eventId: event.id, eventTitle: event.title, report });
    }
  });
  return { failedEventIds, eventsWithMoreMatches, matches };
}