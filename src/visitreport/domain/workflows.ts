import type { VrEvent, Workflow } from "../types.js";
import { normalizeStatus } from "./shared.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts a bare array or an object wrapping the list in `payload`, `jobs`, `items` or `data` (one level deep). */
function unwrapList(data: unknown, keys = ["payload", "jobs", "items", "data", "logs"]): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isObj(data)) return [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value;
    if (isObj(value)) {
      const nested = unwrapList(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function extractJobIds(searchResponse: unknown): string[] {
  const ids = unwrapList(searchResponse).map((job) => {
    if (!isObj(job)) return undefined;
    const id = job.id ?? job.jobId ?? (isObj(job.payload) ? job.payload.id ?? job.payload.jobId : undefined);
    return typeof id === "string" && id ? id : undefined;
  });
  return [...new Set(ids.filter((id): id is string => !!id))];
}

export type WorkflowJobError = { jobId: string; nodeId: string | null; nodeType: string | null; createdAt: string | null; error: string };

export function extractJobErrors(jobId: string, logsResponse: unknown): WorkflowJobError[] {
  return unwrapList(logsResponse).flatMap((entry) => {
    if (!isObj(entry) || !isObj(entry.payload) || entry.payload.error === undefined || entry.payload.error === null) return [];
    const error = entry.payload.error;
    return [{
      jobId: typeof entry.jobId === "string" ? entry.jobId : jobId,
      nodeId: typeof entry.nodeId === "string" ? entry.nodeId : null,
      nodeType: typeof entry.nodeType === "string" ? entry.nodeType : null,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
      error: typeof error === "string" ? error : JSON.stringify(error),
    }];
  });
}

export function workflowsForEvent(workflows: Workflow[], eventId: string) {
  return workflows
    .filter((w) => w.eventIds.includes(eventId))
    .map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      triggers: w.triggers.map((t) => t.type),
    }));
}

/** Status counts are computed only over the scanned events assigned to each workflow. */
export function summarizeWorkflows(workflows: Workflow[], scanned: VrEvent[]) {
  const byId = new Map(scanned.map((e) => [e.id, e]));
  return workflows.map((w) => {
    const assigned = w.eventIds.map((id) => byId.get(id)).filter((e): e is VrEvent => !!e);
    const statusCountsOverScannedEvents: Record<string, number> = {};
    for (const e of assigned) {
      const s = normalizeStatus(e.status);
      statusCountsOverScannedEvents[s] = (statusCountsOverScannedEvents[s] ?? 0) + 1;
    }
    return {
      id: w.id,
      name: w.name,
      status: w.status,
      triggerTypes: [...new Set(w.triggers.map((t) => t.type))],
      assignedEventIds: w.eventIds,
      assignedScannedEvents: assigned.map((e) => ({ id: e.id, title: e.title, status: e.status })),
      statusCountsOverScannedEvents,
    };
  });
}