import type { Option, Question, VrEvent } from "../types.js";

type Change<T> = {
  baseEvent: T;
  compareEvent: T;
};
type DiffStatus = "added" | "removed" | "changed";
type OptionDiff = {
  mappingId: string;
  status: DiffStatus;
  title?: Change<string | undefined>;
  value?: Change<string | undefined>;
};
type QuestionDiff = {
  mappingId: string;
  status: DiffStatus;
  title?: Change<string | undefined>;
  type?: Change<string | undefined>;
  options?: OptionDiff[];
};
export type EventDiff = {
  baseEventId: string;
  compareEventId: string;
  hasChanges: boolean;
  mappingId?: Change<string | undefined>;
  defaultLanguage?: Change<string | undefined>;
  title?: Change<string>;
  questions: QuestionDiff[];
};

function allQuestions(event: VrEvent): Question[] {
  const questions: Question[] = [];
  const visit = (question: Question): void => {
    questions.push(question);
    for (const nested of question.questions ?? []) {
      visit(nested);
    }
  };
  for (const group of event.groups ?? []) {
    for (const question of group.questions ?? []) {
      visit(question);
    }
  }
  for (const question of event.questions ?? []) {
    visit(question);
  }
  return questions;
}

function indexByMappingId<T extends { id: string; mappingId?: string }>(
  values: T[],
): Map<string, T> {
  return new Map(values.map((value) => [value.mappingId ?? value.id, value]));
}

function changed<T>(baseEvent: T, compareEvent: T): Change<T> | undefined {
  return baseEvent === compareEvent ? undefined : { baseEvent, compareEvent };
}

function diffOptions(base: Option[], compare: Option[]): OptionDiff[] {
  const baseById = indexByMappingId(base);
  const compareById = indexByMappingId(compare);
  const differences: OptionDiff[] = [];
  const mappingIds = new Set([...baseById.keys(), ...compareById.keys()]);

  for (const mappingId of mappingIds) {
    const before = baseById.get(mappingId);
    const after = compareById.get(mappingId);

    if (!before || !after) {
      differences.push({
        mappingId,
        status: before ? "removed" : "added",
        title: { baseEvent: before?.label, compareEvent: after?.label },
        value: { baseEvent: before?.value, compareEvent: after?.value },
      });
      continue;
    }

    const title = changed(before.label, after.label);
    const value = changed(before.value, after.value);
    if (title || value) {
      differences.push({
        mappingId,
        status: "changed",
        ...(title && { title }),
        ...(value && { value }),
      });
    }
  }

  return differences;
}

export function diffEvents(base: VrEvent, compare: VrEvent): EventDiff {
  const baseById = indexByMappingId(allQuestions(base));
  const compareById = indexByMappingId(allQuestions(compare));
  const questions: QuestionDiff[] = [];
  const mappingIds = new Set([...baseById.keys(), ...compareById.keys()]);

  for (const mappingId of mappingIds) {
    const before = baseById.get(mappingId);
    const after = compareById.get(mappingId);

    if (!before || !after) {
      questions.push({
        mappingId,
        status: before ? "removed" : "added",
        title: { baseEvent: before?.title, compareEvent: after?.title },
        type: { baseEvent: before?.type, compareEvent: after?.type },
      });
      continue;
    }

    const title = changed(before.title, after.title);
    const type = changed(before.type, after.type);
    const options = diffOptions(before.options ?? [], after.options ?? []);
    if (title || type || options.length) {
      questions.push({
        mappingId,
        status: "changed",
        ...(title && { title }),
        ...(type && { type }),
        ...(options.length && { options }),
      });
    }
  }

  const mappingId = changed(base.mappingId, compare.mappingId);
  const defaultLanguage = changed(base.defaultLanguage, compare.defaultLanguage);
  const title = changed(base.title, compare.title);

  return {
    baseEventId: base.id,
    compareEventId: compare.id,
    hasChanges: !!(mappingId || defaultLanguage || title || questions.length),
    mappingId, defaultLanguage, title, questions,
  };
}