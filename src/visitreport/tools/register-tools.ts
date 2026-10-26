import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storeApiKey } from "../../api-key-store.js";
import { AuthError, type Backend, type WorkflowJobSearch } from "../backend/client.js";
import { diffEvents } from "../domain/diff.js";
import { eventMatches, questionsForEvent } from "../domain/questionnaires.js";
import { collectReportMatches } from "../domain/reports.js";
import {
  EVENT_CONCURRENCY, MAX_EVENTS, MAX_MATCHES, MAX_REPORTS_PER_EVENT,
  capMatches, mapLimited,
} from "../domain/shared.js";
import { extractJobErrors, extractJobIds, summarizeWorkflows, workflowsForEvent } from "../domain/workflows.js";

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const TOOL_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tool call timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
const errorResult = (e: unknown) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : "Unknown error" }],
});
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const limitSchema = z.number().int().min(1).max(MAX_EVENTS).default(MAX_EVENTS)
  .describe(`Number of most recently updated events to scan (max ${MAX_EVENTS})`);
const idSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

async function scanEvents(backend: Backend, limit: number, includeArchived: boolean) {
  const events = await backend.listRecentEvents({ limit: Math.min(limit, MAX_EVENTS), includeArchived });
  return events.slice(0, Math.min(limit, MAX_EVENTS));
}

let authContext: { server: McpServer; backend: Backend } | undefined;

// Asks the user for a new API key via elicitation, stores it and applies it to the running backend
async function promptForApiKey(): Promise<boolean> {
  if (!authContext) return false;
  const { server, backend } = authContext;
  try {
    const result = await server.server.elicitInput({
      message: "The snapAddy API key is missing or invalid (403). Please enter a valid API key; it will be stored for future use.",
      requestedSchema: {
        type: "object",
        properties: { apiKey: { type: "string", title: "snapAddy API key", minLength: 1 } },
        required: ["apiKey"],
      },
    });
    const key = typeof result.content?.apiKey === "string" ? result.content.apiKey.trim() : "";
    if (result.action !== "accept" || !key) return false;
    storeApiKey(key);
    process.env.SNAPADDY_API_KEY = key;
    backend.setToken?.(key);
    return true;
  } catch (e) {
    console.error("API key prompt failed:", e instanceof Error ? e.message : "Unknown error");
    return false;
  }
}

function guard<A>(toolName: string, fn: (a: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      try {
        return text(await withTimeout(fn(args)));
      } catch (e) {
        if (!(e instanceof AuthError) || !(await promptForApiKey())) throw e;
        return text(await withTimeout(fn(args)));
      }
    } catch (e) {
      console.error(`[${toolName}]`, e instanceof Error ? e.message : "Unknown error");
      return errorResult(e);
    }
  };
}

export function registerTools(server: McpServer, backend: Backend) {
  authContext = { server, backend };
  server.registerTool(
    "get_event_questions",
    {
      description: "List all questions for one VisitReport event, including nested questions. Read-only.",
      inputSchema: { eventId: idSchema },
      annotations: readOnly,
    },
    guard("get_event_questions", async ({ eventId }: { eventId: string }) => {
      const event = await backend.getEvent(eventId);
      return {
        eventId,
        questions: questionsForEvent(event).map(({ id, mappingId, title, type }) => ({ id, mappingId, title, type })),
      };
    }),
  );

  server.registerTool(
    "get_question_options",
    {
      description: "List all options for a question ID in a VisitReport event, including nested questions. Read-only.",
      inputSchema: { eventId: idSchema, questionId: idSchema },
      annotations: readOnly,
    },
    guard("get_question_options", async ({ eventId, questionId }: { eventId: string; questionId: string }) => {
      const event = await backend.getEvent(eventId);
      const question = questionsForEvent(event).find((item) => item.id === questionId);
      if (!question) throw new Error(`Question ${questionId} not found in event ${eventId}`);
      return { eventId, questionId, options: question.options ?? [] };
    }),
  );

  if (process.env.VISITREPORT_ENABLE_WRITE_TOOLS === "true") {
    server.registerTool(
      "set_option_value",
      {
        description: "Change one option value in a draft VisitReport questionnaire. Shows the exact change and requires manual confirmation via MCP elicitation before writing.",
        inputSchema: { eventId: idSchema, questionId: idSchema, optionId: idSchema, value: z.string().max(1000) },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      guard("set_option_value", async ({ eventId, questionId, optionId, value }: { eventId: string; questionId: string; optionId: string; value: string }) => {
        const event = await backend.getEvent(eventId);
        const question = questionsForEvent(event).find((item) => item.id === questionId);
        const option = question?.options?.find((item) => item.id === optionId);
        if (!option) throw new Error(`Option ${optionId} not found in question ${questionId} of event ${eventId}`);
        if (option.value === value) return { changed: false, reason: "Value already matches" };
        const confirmation = await server.server.elicitInput({
          message: `Option Value ändern? Event: ${event.title} (${eventId}); Frage: ${question?.title} (${questionId}); Option: ${option.label} (${optionId}); bisher: ${JSON.stringify(option.value ?? null)}; neu: ${JSON.stringify(value)}. Nur mit Ja wird diese Änderung ausgeführt.`,
          requestedSchema: { type: "object", properties: { confirm: { type: "string", title: "Änderung bestätigen", enum: ["Ja", "Nein"] } }, required: ["confirm"] },
        });
        if (confirmation.action !== "accept" || confirmation.content?.confirm !== "Ja") return { changed: false, reason: "Not confirmed" };
        await backend.updateOptionValue(eventId, questionId, optionId, option.value, value);
        return { changed: true, eventId, questionId, optionId, oldValue: option.value ?? null, newValue: value };
      }),
    );

    server.registerTool(
      "set_option_values",
      {
        description: "Change multiple option values in a draft VisitReport questionnaire. Shows all changes and requires one manual confirmation via MCP elicitation before writing.",
        inputSchema: {
          eventId: idSchema,
          changes: z.array(z.object({
            questionId: idSchema,
            optionId: idSchema,
            value: z.string().max(1000),
          })).min(2).max(100),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      guard("set_option_values", async ({ eventId, changes }: {
        eventId: string;
        changes: { questionId: string; optionId: string; value: string }[];
      }) => {
        const event = await backend.getEvent(eventId);
        const questions = questionsForEvent(event);
        const pending = changes.map((change) => {
          const question = questions.find((item) => item.id === change.questionId);
          const option = question?.options?.find((item) => item.id === change.optionId);
          if (!question || !option) throw new Error(`Option ${change.optionId} not found in question ${change.questionId} of event ${eventId}`);
          return { ...change, questionTitle: question.title, optionLabel: option.label, oldValue: option.value };
        }).filter((change) => change.oldValue !== change.value);

        if (!pending.length) return { changed: false, reason: "All values already match" };

        const preview = pending.map((change, index) =>
          `${index + 1}. Frage: ${change.questionTitle} (${change.questionId}); Option: ${change.optionLabel} (${change.optionId}); bisher: ${JSON.stringify(change.oldValue ?? null)}; neu: ${JSON.stringify(change.value)}`,
        ).join("\n");
        const confirmation = await server.server.elicitInput({
          message: `Option Values ändern? Event: ${event.title} (${eventId})\n${preview}\nNur mit Ja werden alle Änderungen ausgeführt.`,
          requestedSchema: { type: "object", properties: { confirm: { type: "string", title: "Änderungen bestätigen", enum: ["Ja", "Nein"] } }, required: ["confirm"] },
        });
        if (confirmation.action !== "accept" || confirmation.content?.confirm !== "Ja") return { changed: false, reason: "Not confirmed" };

        for (const change of pending) {
          await backend.updateOptionValue(eventId, change.questionId, change.optionId, change.oldValue, change.value);
        }
        return {
          changed: true,
          eventId,
          changes: pending.map(({ questionId, optionId, oldValue, value }) => ({ questionId, optionId, oldValue: oldValue ?? null, newValue: value })),
        };
      }),
    );
  }

  server.registerTool(
    "event_diff",
    {
      description: "Compare two VisitReport events by mapping ID, default language, title, questions (including nested), and option values and titles. Returns differences only. Read-only.",
      inputSchema: {
        baseEventId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
        compareEventId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
      },
      annotations: readOnly,
    },
    guard("event_diff", async ({ baseEventId, compareEventId }: { baseEventId: string; compareEventId: string }) => {
      const [base, compare] = await Promise.all([backend.getEvent(baseEventId), backend.getEvent(compareEventId)]);
      return diffEvents(base, compare);
    }),
  );

  server.registerTool(
    "find_questionnaires",
    {
      description: "Search recent VisitReport events (questionnaires) by title, IDs, groups, questions (incl. nested), options and custom fields. Read-only.",
      inputSchema: { query: z.string().max(200).default(""), limit: limitSchema },
      annotations: readOnly,
    },
    guard("find_questionnaires", async ({ query, limit }: { query: string; limit: number }) => {
      const events = await scanEvents(backend, limit, false);
      const matches = events
        .map((e) => ({ id: e.id, title: e.title, status: e.status, matchedOn: eventMatches(e, query) }))
        .filter((m) => m.matchedOn.length > 0);
      const capped = capMatches(matches);
      return { scannedEvents: events.length, matchLimit: MAX_MATCHES, truncated: capped.truncated, totalMatches: capped.totalMatches, matches: capped.items };
    }),
  );

  server.registerTool(
    "find_reports",
    {
      description: "Search reports across recent live events (optionally archived too). Read-only. Reports which events had more matches than returned.",
      inputSchema: {
        query: z.string().max(200).default(""),
        status: z.string().max(50).optional(),
        includeArchived: z.boolean().default(false),
        limit: limitSchema,
      },
      annotations: readOnly,
    },
    guard("find_reports", async ({ query, status, includeArchived, limit }: { query: string; status?: string; includeArchived: boolean; limit: number }) => {
      const events = await scanEvents(backend, limit, includeArchived);
      const results = await mapLimited(events, EVENT_CONCURRENCY, (e) =>
        backend.searchReports(e.id, { query: query || undefined, status, limit: MAX_REPORTS_PER_EVENT }),
      );
      const { failedEventIds, eventsWithMoreMatches, matches } = collectReportMatches(events, results, status);
      const capped = capMatches(matches);
      return {
        scannedEvents: events.length, failedEventIds, eventsWithMoreMatches,
        perEventLimit: MAX_REPORTS_PER_EVENT, matchLimit: MAX_MATCHES,
        truncated: capped.truncated, totalMatchesFetched: capped.totalMatches, matches: capped.items,
      };
    }),
  );

  server.registerTool(
    "list_workflows",
    {
      description: "List VisitReport workflows with assigned events, trigger types and event-status counts. Counts are over the scanned recent events only.",
      inputSchema: { limit: limitSchema },
      annotations: readOnly,
    },
    guard("list_workflows", async ({ limit }: { limit: number }) => {
      const events = await scanEvents(backend, limit, false);
      const workflows = await backend.listWorkflows(events.map((event) => event.id));
      return {
        scannedEvents: events.length,
        countsNote: "statusCountsOverScannedEvents only counts assigned events among the scanned recent events, not all assigned events.",
        workflows: summarizeWorkflows(workflows, events),
      };
    }),
  );

  server.registerTool(
    "get_questionnaire_workflows",
    {
      description: "Return named workflow assignments and triggers for one VisitReport event ID. Read-only.",
      inputSchema: { eventId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) },
      annotations: readOnly,
    },
    guard("get_questionnaire_workflows", async ({ eventId }: { eventId: string }) => {
      const workflows = await backend.getQuestionnaireWorkflows(eventId);
      return { eventId, workflows: workflowsForEvent(workflows, eventId) };
    }),
  );

  const jobFilterSchema = z.array(z.union([
    z.string().min(1).max(100),
    z.object({ operator: z.enum(["IS", "IS_NOT"]).default("IS"), value: z.string().min(1).max(100) }),
  ])).max(50).default([]);
  type JobFilterInput = (string | { operator: "IS" | "IS_NOT"; value: string })[];
  const toFilters = (items: JobFilterInput) =>
    items.map((item) => (typeof item === "string" ? { operator: "IS" as const, value: item } : item));

  server.registerTool(
    "find_workflow_logs",
    {
      description: "Search workflow jobs (job-management), fetch each job's activity logs and return the error messages (payload.error) together with jobId, nodeId and nodeType. Filter by status (e.g. failed, success), job type, user, participant, workflow, questionnaire/event and job group IDs within a date range. Each filter accepts plain values (operator IS) or {operator: IS|IS_NOT, value}. Defaults to the last 30 days, newest first. Read-only.",
      inputSchema: {
        statuses: jobFilterSchema.describe("Job statuses, e.g. [\"failed\"]"),
        types: jobFilterSchema,
        userIds: jobFilterSchema,
        participantIds: jobFilterSchema,
        workflowIds: jobFilterSchema,
        questionnaireIds: jobFilterSchema.describe("VisitReport event/questionnaire IDs"),
        jobGroupIds: jobFilterSchema,
        from: z.iso.datetime({ offset: true }).optional().describe("ISO start of date range (default: 30 days ago)"),
        to: z.iso.datetime({ offset: true }).optional().describe("ISO end of date range (default: now)"),
        sortDirection: z.enum(["ASC", "DESC"]).default("DESC"),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: readOnly,
    },
    guard("find_workflow_logs", async (args: {
      statuses: JobFilterInput; types: JobFilterInput; userIds: JobFilterInput; participantIds: JobFilterInput;
      workflowIds: JobFilterInput; questionnaireIds: JobFilterInput; jobGroupIds: JobFilterInput;
      from?: string; to?: string; sortDirection: "ASC" | "DESC"; offset: number; limit: number;
    }) => {
      const to = args.to ? new Date(args.to) : new Date();
      const from = args.from ? new Date(args.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (from > to) throw new Error("'from' must not be after 'to'");
      const query: WorkflowJobSearch = {
        filters: {
          types: toFilters(args.types),
          statuses: toFilters(args.statuses),
          userIds: toFilters(args.userIds),
          participantIds: toFilters(args.participantIds),
          workflowIds: toFilters(args.workflowIds),
          questionnaireIds: toFilters(args.questionnaireIds),
          jobGroupIds: toFilters(args.jobGroupIds),
          dateRange: { from: from.toISOString(), to: to.toISOString() },
        },
        sortDirection: args.sortDirection,
        offset: args.offset,
        limit: args.limit,
      };
      const searchResult = await backend.searchWorkflowJobs(query);
      const jobIds = extractJobIds(searchResult);
      const logs = await mapLimited(jobIds, EVENT_CONCURRENCY, (jobId) => backend.getWorkflowJobLogs(jobId));
      const failedJobIds: string[] = [];
      const jobIdsWithoutError: string[] = [];
      const errors = logs.flatMap((r, i) => {
        const jobId = jobIds[i]!;
        if (r.status === "rejected") {
          failedJobIds.push(jobId);
          return [];
        }
        const found = extractJobErrors(jobId, r.value);
        if (!found.length) jobIdsWithoutError.push(jobId);
        return found;
      });
      return { query, jobCount: jobIds.length, errorCount: errors.length, errors, jobIdsWithoutError, failedJobIds };
    }),
  );
}