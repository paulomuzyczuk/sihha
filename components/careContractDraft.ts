// The editor's working copy of a care agreement, and the pure operations on it.
//
// Split from the component so the manipulations that can silently corrupt an
// agreement — reordering, dropping a clause — are plain functions with tests
// rather than behaviour buried in event handlers.
//
// A draft carries no row ids: a save always publishes a NEW version, so nothing
// here needs to match existing rows. That is the versioning paying for itself.

import type { CareContractVersion } from '../lib/careContract/types';

export interface DraftContractSection {
  groupTitle: string;
  title: string;
  clauses: string[];
}

export interface CareContractDraft {
  agreedOn: string;
  monthlyAllowance: string;
  sections: DraftContractSection[];
  witnesses: string[];
}

/** Today, as YYYY-MM-DD — the default date for a newly published version. */
export function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Seed the form from the version in force, so publishing an amendment means
 * editing the current text rather than retyping the whole agreement.
 */
export function toContractDraft(
  version: CareContractVersion | null,
  today: string,
): CareContractDraft {
  if (!version) {
    return {
      agreedOn: today,
      monthlyAllowance: '',
      sections: [],
      witnesses: [],
    };
  }
  return {
    // The NEW version's date defaults to today, not the old version's date —
    // an amendment agreed today should not silently claim the old date.
    agreedOn: today,
    monthlyAllowance: version.monthlyAllowance ?? '',
    sections: version.sections.map((section) => ({
      groupTitle: section.groupTitle ?? '',
      title: section.title,
      clauses: section.clauses.map((c) => c.text),
    })),
    witnesses: [...version.witnesses],
  };
}

export function emptyContractSection(): DraftContractSection {
  return { groupTitle: '', title: '', clauses: [] };
}

/** Move an item within a list; out-of-range moves are a no-op, never a drop. */
export function moveContractItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The PUT payload: blank optional fields become null, empties are dropped. */
export function toContractPayload(draft: CareContractDraft) {
  const trimmedOrNull = (v: string) => {
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  return {
    agreedOn: draft.agreedOn,
    monthlyAllowance: trimmedOrNull(draft.monthlyAllowance),
    sections: draft.sections.map((section) => ({
      groupTitle: trimmedOrNull(section.groupTitle),
      title: section.title.trim(),
      // A blank clause row is an unfinished edit, not a clause. Dropping it
      // beats failing the whole publish on a validation error the editor
      // cannot point at.
      clauses: section.clauses.map((c) => c.trim()).filter((c) => c.length > 0),
    })),
    witnesses: draft.witnesses.map((w) => w.trim()).filter((w) => w.length > 0),
  };
}
