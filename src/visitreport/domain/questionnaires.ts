import type { Question, VrEvent } from "../types.js";

const norm = (s: unknown) => String(s ?? "").toLowerCase();
const has = (s: unknown, q: string) => norm(s).includes(q);

export function questionMatches(question: Question, query: string): string[] {
  const hits: string[] = [];
  if (has(question.id, query) || has(question.mappingId, query) || has(question.title, query)) hits.push(`question:${question.id}`);
  for (const o of question.options ?? []) {
    if (has(o.id, query) || has(o.mappingId, query) || has(o.label, query)) hits.push(`option:${question.id}/${o.id}`);
  }
  for (const child of question.questions ?? []) hits.push(...questionMatches(child, query));
  return hits;
}

/** Returns the reasons an event matches the query (empty if no match). */
export function eventMatches(event: VrEvent, rawQuery: string): string[] {
  const query = norm(rawQuery).trim();
  if (!query) return ["all"];
  const hits: string[] = [];
  if (has(event.id, query) || has(event.mappingId, query)) hits.push("id");
  if (has(event.title, query)) hits.push("title");
  for (const g of event.groups ?? []) {
    if (has(g.id, query) || has(g.name, query)) hits.push(`group:${g.id}`);
    for (const q of g.questions ?? []) hits.push(...questionMatches(q, query));
  }
  for (const q of event.questions ?? []) hits.push(...questionMatches(q, query));
  for (const f of event.customFields ?? []) {
    if (has(f.id, query) || has(f.name, query) || has(f.value, query)) hits.push(`customField:${f.name}`);
  }
  return hits;
}

export function questionsForEvent(event: VrEvent): Question[] {
  const flatten = (questions: Question[]): Question[] =>
    questions.flatMap((question) => [question, ...flatten(question.questions ?? [])]);
  return [
    ...event.groups?.flatMap((group) => flatten(group.questions ?? [])) ?? [],
    ...flatten(event.questions ?? []),
  ];
}