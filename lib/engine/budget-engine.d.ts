// Types for the formula engine carried over unchanged from the original app (budget-engine.js).
export class XErr {
  constructor(code: string);
  code: string;
}
export class BudgetEngine {
  constructor(model: unknown);
  setInputs(inputs: Record<string, unknown>): void;
  value(sheet: string, addr: string): unknown;
}
export function isErr(v: unknown): v is XErr;
export function colName(n: number): string;
export function splitAddr(a: string): [number, number];
declare const api: { BudgetEngine: typeof BudgetEngine; XErr: typeof XErr; isErr: typeof isErr; colName: typeof colName; splitAddr: typeof splitAddr };
export default api;
