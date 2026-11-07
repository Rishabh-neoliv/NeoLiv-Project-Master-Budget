// What the app read from an uploaded file. Shared by the server (which fills it) and the screens (which
// show it for review). Nothing here changes a budget: a person reviews the suggestions and applies them.
import type { CellValue } from "./budget";

export interface FieldSuggestion {
  cell: string;              // e.g. "C9" or "Additional Inputs!C6"
  label: string;
  value: CellValue;
  /** where in the document it came from (sheet/cell, page, or a short quote) */
  source: string;
  /** exact = read from a budget workbook; high/medium/low = the AI's confidence */
  confidence: "exact" | "high" | "medium" | "low";
}

export interface Decision {
  item: string;
  discussion: string;
  decision: "approved" | "rejected" | "to_be_determined" | "parked" | "other";
  cost_cr: number | null;    // cost impact in ₹ crore, when the document gives one
}

export interface Extraction {
  method: "exact" | "ai";
  doc_type: string;          // e.g. "Master Budget workbook", "Minutes of meeting", "Invoice"
  summary: string;
  /** false when the document doesn't look like it belongs to a project budget (wrong upload?) */
  relevant: boolean;
  relevance_note: string;
  suggestions: FieldSuggestion[];
  decisions: Decision[];
  /** notes for the team: things the document says that don't map to an input field */
  notes: string[];
  model?: string;
  truncated?: boolean;
}

export const DECISION_LABEL: Record<Decision["decision"], string> = {
  approved: "Approved", rejected: "Rejected", to_be_determined: "To be determined", parked: "Parked", other: "Other",
};
