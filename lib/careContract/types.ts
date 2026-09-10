// Shapes for the care agreement ("contrato de convivência") — what the
// recipient commits to, what the care team commits to in return, and what
// happens if either side does not hold up their end. Types only, never
// content: the agreement is recipient-specific DATA held in recipient-scoped
// tables, so nothing here names a person or states a term.

export interface CareContractClause {
  text: string;
}

export interface CareContractSection {
  // Sections sharing a groupTitle render under one card; null stands alone.
  // Grouping is data, so the view hardcodes no section names.
  groupTitle: string | null;
  title: string;
  clauses: CareContractClause[];
}

/** One entry in the version picker — enough to choose, not the whole text. */
export interface CareContractVersionSummary {
  id: string;
  versionNumber: number;
  agreedOn: string;
  /** True for the highest version number, i.e. the agreement in force. */
  isCurrent: boolean;
}

export interface CareContractVersion {
  id: string;
  versionNumber: number;
  agreedOn: string;
  isCurrent: boolean;
  monthlyAllowance: string | null;
  sections: CareContractSection[];
  witnesses: string[];
}

export interface CareContract {
  /** Null when the recipient has no agreement recorded at all. */
  version: CareContractVersion | null;
  /** Newest first. Every party may read the whole history, not just the current. */
  versions: CareContractVersionSummary[];
}
