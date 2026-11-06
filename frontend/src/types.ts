export type Kind = "benford" | "anomalies" | "mdna_diff";

export interface DigitRow {
  digit: number;
  count: number;
  observed: number;
  expected: number;
  z: number;
  significant: boolean;
}

export interface BenfordResult {
  digits: 1 | 2;
  n: number;
  excluded: number;
  mad: number;
  conformity: "close" | "acceptable" | "marginal" | "nonconformity";
  chi_square: number;
  dof: number;
  p_value: number;
  rows: DigitRow[];
  flagged_digits: number[];
  note: string;
}

export interface Finding {
  screen: string;
  severity: "info" | "low" | "medium" | "high";
  message: string;
  values: number[];
  metric: number | null;
}

export interface AnomalyResult {
  n: number;
  median: number;
  mad: number;
  findings: Finding[];
  outlier_indices: number[];
  summary: Record<string, number>;
}

export interface DiffItem {
  kind: "Matched" | "Modified" | "Added" | "Deleted";
  text: string;
  previous_text: string | null;
  similarity: number | null;
  inserted_words: string[];
  removed_words: string[];
  changed_numbers: { before: number; after: number; pct_change: number | null }[];
}

export interface DiffResult {
  items: DiffItem[];
  counts: Record<DiffItem["kind"], number>;
  old_paragraphs: number;
  new_paragraphs: number;
}

export type AnyResult = BenfordResult | AnomalyResult | DiffResult;

export interface Version {
  version: number;
  method_version: string;
  input_sha256: string;
  params: Record<string, unknown>;
  result: AnyResult;
  created_at: string;
}

export interface Analysis {
  id: number;
  kind: Kind;
  title: string;
  created_at: string;
  updated_at: string;
  versions: Omit<Version, "params" | "result">[];
  latest: Version;
}

export interface ListItem {
  id: number;
  kind: Kind;
  title: string;
  updated_at: string;
  latest_version: number;
}

export type Params =
  | { kind: "benford"; text: string; digits: 1 | 2 }
  | { kind: "anomalies"; text: string; z_threshold: number }
  | { kind: "mdna_diff"; before: string; after: string; similarity_threshold: number };
