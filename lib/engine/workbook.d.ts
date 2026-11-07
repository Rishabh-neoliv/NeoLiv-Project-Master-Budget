// Types for the Excel builder carried over unchanged from the original app (workbook.js).
import type { BudgetEngine } from "./budget-engine";

export interface WorkbookInfo {
  projectName: string;
  history?: { label: string; at: string; by: string; status: string; reason: string; total: number | string }[];
  overrides?: Record<string, Record<string, unknown>>;
  clean?: boolean;
  trim?: Record<string, string>;
  unhide?: Record<string, string[]>;
  restyle?: Record<string, { cells: string[]; format: string; align: string }>;
  hideRows?: Record<string, number[]>;
  outputType?: "blob" | "uint8array" | "nodebuffer" | "arraybuffer";
}
export function buildWorkbook(
  JSZip: unknown,
  template: ArrayBuffer | Uint8Array,
  engine: BudgetEngine,
  inputs: Record<string, unknown>,
  info: WorkbookInfo,
): Promise<Blob | Uint8Array | ArrayBuffer>;
declare const api: { buildWorkbook: typeof buildWorkbook };
export default api;
