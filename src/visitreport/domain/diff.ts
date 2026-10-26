import type { Option, Question, VrEvent } from "../types.js";

type Change<T> = { baseEvent: T; compareEvent: T };
type OptionDiff = {
  mappingId: string;
  status: "added" | "removed" | "changed";
  title?: Change<string | undefined>;
  value?: Change<string | undefined>;
};
type QuestionDiff = {
  mappingId: string;
  status: "added" | "removed" | "changed";
  title?: Change<string | undefined>;
  type?: Change<string | undefined>;
  options?: OptionDiff[];
};

function allQuestions(event: VrEvent): Question[] {
  const questions: Question[] = [];
  const visit = (question: Question): void => {
    questions.push(question);
    for (const nested of question.questions ?? []) visit(nested);
  };
  for (const group of event.groups ?? []) for (const question of group.questions ?? []) visit(question);
  for (const question of event.questions ?? []) visit(question);
  return questions;
}

function changed<T>(baseEvent: T, compareEvent: T): Change<T> | undefined {
  return baseEvent === compareEvent ? undefined : { baseEvent, compareEvent };
}

function diffOptions(base: Option[], compare: Option[]): OptionDiff[] {
  const baseById = new Map(base.map((option) => [option.mappingId ?? option.id, option]));
  const compareById = new Map(compare.map((option) => [option.mappingId ?? option.id, option]));
  const differences: OptionDiff[] = [];
  for (const mappingId of new Set([...baseById.keys(), ...compareById.keys()])) {
    const before = baseById.get(mappingId);
    const after = compareById.get(mappingId);
    if (!before || !after) {
      differences.push({ mappingId, status: before ? "removed" : "added", title: { baseEvent: before?.label, compareEvent: after?.label }, value: { baseEvent: before?.value, compareEvent: after?.value } });
      continue;
    }
    const title = changed(before.label, after.label);
    const value = changed(before.value, after.value);
    if (title || value) differences.push({ mappingId, status: "changed", ...(title && { title }), ...(value && { value }) });
  }
  return differences;
}

export function diffEvents(base: VrEvent, compare: VrEvent) {
  const baseById = new Map(allQuestions(base).map((question) => [question.mappingId ?? question.id, question]));
  const compareById = new Map(allQuestions(compare).map((question) => [question.mappingId ?? question.id, question]));
  const questions: QuestionDiff[] = [];
  for (const mappingId of new Set([...baseById.keys(), ...compareById.keys()])) {
    const before = baseById.get(mappingId);
    const after = compareById.get(mappingId);
    if (!before || !after) {
      questions.push({ mappingId, status: before ? "removed" : "added", title: { baseEvent: before?.title, compareEvent: after?.title }, type: { baseEvent: before?.type, compareEvent: after?.type } });
      continue;
    }
    const title = changed(before.title, after.title);
    const type = changed(before.type, after.type);
    const options = diffOptions(before.options ?? [], after.options ?? []);
    if (title || type || options.length) questions.push({ mappingId, status: "changed", ...(title && { title }), ...(type && { type }), ...(options.length && { options }) });
  }
  const mappingId = changed(base.mappingId, compare.mappingId);
  const defaultLanguage = changed(base.defaultLanguage, compare.defaultLanguage);
  const title = changed(base.title, compare.title);
  return {
    baseEventId: base.id, compareEventId: compare.id,
    hasChanges: !!(mappingId || defaultLanguage || title || questions.length),
    mappingId, defaultLanguage, title, questions,
  };
}