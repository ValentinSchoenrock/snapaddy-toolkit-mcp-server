import type { Config } from "../config.js";
import { EVENT_CONCURRENCY, mapLimited } from "../domain/shared.js";
import type { Report, ReportPage, VrEvent, Workflow, WorkflowTrigger } from "../types.js";

export interface Backend {
  listRecentEvents(opts: { limit: number; includeArchived: boolean }): Promise<VrEvent[]>;
  getEvent(id: string): Promise<VrEvent>;
  updateOptionValue(eventId: string, questionId: string, optionId: string, oldValue: string | undefined, newValue: string): Promise<void>;
  searchReports(eventId: string, opts: { query?: string; status?: string; limit: number }): Promise<ReportPage>;
  listWorkflows(eventIds?: string[]): Promise<Workflow[]>;
  getQuestionnaireWorkflows(eventId: string): Promise<Workflow[]>;
  searchWorkflowJobs(query: WorkflowJobSearch): Promise<unknown>;
  getWorkflowJobLogs(jobId: string): Promise<unknown>;
}

export type WorkflowJobFilter = { operator: "IS" | "IS_NOT"; value: string };
export type WorkflowJobSearch = {
  filters: {
    types: WorkflowJobFilter[];
    statuses: WorkflowJobFilter[];
    userIds: WorkflowJobFilter[];
    participantIds: WorkflowJobFilter[];
    workflowIds: WorkflowJobFilter[];
    questionnaireIds: WorkflowJobFilter[];
    jobGroupIds: WorkflowJobFilter[];
    dateRange: { from: string; to: string };
  };
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
};

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const REQUEST_TIMEOUT_MS = 15_000;

async function mapStrict<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = await mapLimited(items, EVENT_CONCURRENCY, fn);
  return results.map((r) => {
    if (r.status === "rejected") throw r.reason;
    return r.value;
  });
}

export class HttpBackend implements Backend {
  constructor(
    private readonly config: Config,
    private readonly fetchFn: FetchLike = fetch as unknown as FetchLike,
  ) { }

  private async get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: { "x-api-key": this.config.token, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Backend request ${path} failed with status ${res.status}`);
    return (await res.json()) as T;
  }

  async listRecentEvents({ limit, includeArchived }: { limit: number; includeArchived: boolean }) {
    const data = await this.get<{ questionnaires?: RawQuestionnaire[] } | RawQuestionnaire[]>(
      "/questionnaire/v1/questionnaire-management/find-questionnaires",
      {
        limit,
        sortOrder: "DESC",
        sortBy: "UPDATED_AT",
      },
    );
    const candidates = (Array.isArray(data) ? data : (data.questionnaires ?? []))
      .filter((item) => includeArchived || !item.archived)
      .slice(0, limit);
    return mapStrict(candidates, (item) => this.getEvent(item.id));
  }

  getEvent(id: string) {
    return this.get<RawQuestionnaire>(`/questionnaire/v1/${encodeURIComponent(id)}`).then(normalizeQuestionnaire);
  }

  async updateOptionValue(eventId: string, questionId: string, optionId: string, oldValue: string | undefined, newValue: string) {
    const raw = await this.get<RawQuestionnaire>(`/questionnaire/v1/${encodeURIComponent(eventId)}`);
    const findQuestion = (groups: RawGroup[]): RawQuestion | undefined => {
      for (const group of groups) {
        for (const question of group.questions ?? []) {
          if (question.id === questionId) return question;
          const nested = findQuestion(question.subQuestionGroup ? [question.subQuestionGroup] : []);
          if (nested) return nested;
        }
      }
      return undefined;
    };
    const option = findQuestion(raw.questionGroups ?? [])?.questionOptions?.find((item) => item.id === optionId);
    if (!option || option.value !== oldValue) throw new Error("Copy changed since preview; no update was made");
    await this.request(`/questionnaire/v1/question-option/${encodeURIComponent(optionId)}`, {
      method: "PUT", body: JSON.stringify({
        id: option.id, default: option.default, defaultValue: option.defaultValue,
        questionOptionAttachments: option.questionOptionAttachments, questionOptionType: option.questionOptionType,
        sequenceNumber: option.sequenceNumber, texts: option.texts, value: newValue,
      }),
    });
  }

  async searchReports(eventId: string, opts: { query?: string; status?: string; limit: number }) {
    const data = await this.request<{ reports?: Report[]; reportCount?: number }>(
      `/questionnaire/v1/${encodeURIComponent(eventId)}/reports/grid-view`,
      {
        method: "POST",
        body: JSON.stringify({
          order: { field: "index", sortDirection: "DESC" },
          pagination: { offset: 0, limit: opts.limit },
          searchTerm: opts.query ?? "",
        }),
      },
    );
    const reports = data.reports ?? [];
    return { reports, hasMore: (data.reportCount ?? reports.length) > reports.length };
  }

  async listWorkflows(eventIds: string[] = []) {
    const data = await this.get<{ workflows?: RawWorkflow[] } | RawWorkflow[]>("/workflow/v2/workflows", { workflowType: "visitreport_export" });
    const workflows = Array.isArray(data) ? data : (data.workflows ?? []);
    const assignments = await mapStrict(eventIds, async (eventId) => [eventId, await this.getWorkflowAssignment(eventId)] as const);
    return workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      status: workflow.state,
      eventIds: assignments.filter(([, assignment]) => assignment.workflows?.some((item) => item.workflowId === workflow.id)).map(([eventId]) => eventId),
      triggers: triggerTypes(workflow.id, assignments.map(([, assignment]) => assignment)),
    }));
  }

  async getQuestionnaireWorkflows(eventId: string) {
    const [data, assignment] = await Promise.all([
      this.get<{ workflows?: RawWorkflow[] } | RawWorkflow[]>("/workflow/v2/workflows", { workflowType: "visitreport_export" }),
      this.getWorkflowAssignment(eventId),
    ]);
    const workflows = Array.isArray(data) ? data : (data.workflows ?? []);
    return (assignment.workflows ?? []).map((item) => {
      const workflow = workflows.find((candidate) => candidate.id === item.workflowId);
      return {
        id: item.workflowId,
        name: workflow?.name ?? "Unknown Workflow",
        status: workflow?.state,
        eventIds: [eventId],
        triggers: triggerTypes(item.workflowId, [assignment]),
      };
    });
  }

  searchWorkflowJobs(query: WorkflowJobSearch) {
    return this.request<unknown>("/job-management/v2/jobs/workflow/search", { method: "POST", body: JSON.stringify(query) });
  }

  getWorkflowJobLogs(jobId: string) {
    return this.get<unknown>("/workflow/v1/logs", { jobId });
  }

  private async getWorkflowAssignment(eventId: string) {
    return this.get<RawWorkflowAssignment>(`/workflow/questionnaire/${encodeURIComponent(eventId)}`);
  }

  private async request<T>(path: string, init: { method: "POST" | "PUT"; body: string }): Promise<T> {
    const res = await this.fetchFn(new URL(path, this.config.baseUrl).toString(), {
      ...init,
      headers: { "x-api-key": this.config.token, Accept: "application/json", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Backend request ${path} failed with status ${res.status}`);
    return (await res.json()) as T;
  }
}

type RawQuestionnaire = {
  id: string;
  mappingId?: string;
  titles?: Record<string, unknown>;
  defaultLanguage?: string;
  archived?: boolean;
  finalized?: boolean;
  master?: boolean;
  questionGroups?: RawGroup[];
  customFields?: Record<string, unknown>;
};
type RawGroup = { id: string; titles?: Record<string, unknown>; questions?: RawQuestion[] };
type RawQuestion = { id: string; mappingId?: string; texts?: Record<string, unknown>; questionType?: string; questionOptions?: RawOption[]; subQuestionGroup?: RawGroup };
type RawOption = { id: string; mappingId?: string; value?: string; texts?: Record<string, unknown>; default?: boolean; defaultValue?: unknown; questionOptionAttachments?: unknown; questionOptionType?: string; sequenceNumber?: number };
type RawWorkflow = { id: string; name: string; state?: string };
type RawWorkflowAssignment = { workflows?: Array<{ workflowId: string }>; triggers?: Record<string, string> };

function label(labels: Record<string, unknown> | undefined, language: string | undefined): string {
  const preferred = language ? labels?.[language] : undefined;
  if (typeof preferred === "string") return preferred;
  return Object.values(labels ?? {}).find((value): value is string => typeof value === "string") ?? "";
}

function normalizeQuestion(raw: RawQuestion, language: string): import("../types.js").Question {
  return {
    id: raw.id,
    mappingId: raw.mappingId,
    title: label(raw.texts, language),
    type: raw.questionType,
    options: raw.questionOptions?.map((option) => ({ id: option.id, mappingId: option.mappingId, label: label(option.texts, language), value: option.value })),
    questions: raw.subQuestionGroup?.questions?.map((question) => normalizeQuestion(question, language)),
  };
}

function normalizeQuestionnaire(raw: RawQuestionnaire): VrEvent {
  const language = raw.defaultLanguage ?? "";
  const status = raw.archived ? "archived" : raw.finalized ? "live" : raw.master ? "master" : "draft";
  return {
    id: raw.id,
    mappingId: raw.mappingId,
    defaultLanguage: raw.defaultLanguage,
    title: label(raw.titles, language),
    status,
    groups: raw.questionGroups?.map((group) => ({ id: group.id, name: label(group.titles, language), questions: group.questions?.map((question) => normalizeQuestion(question, language)) })),
    customFields: Object.entries(raw.customFields ?? {}).map(([name, value]) => ({ name, value: String(value) })),
  };
}

function triggerTypes(workflowId: string, assignments: RawWorkflowAssignment[]): WorkflowTrigger[] {
  const names: Record<string, string> = { exportToDashboard: "Export to Dashboard", markAsChecked: "Mark as Checked", leadScoring: "Lead Scoring" };
  return Object.entries(names)
    .filter(([key]) => assignments.some((assignment) => assignment.triggers?.[key] === workflowId))
    .map(([, type]) => ({ type }));
}