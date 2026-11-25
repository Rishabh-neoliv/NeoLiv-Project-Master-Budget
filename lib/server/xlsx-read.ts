// Reading .xlsx files on the server with JSZip (no extra library): cell values by address, and a plain-text
// copy of every sheet for the AI to read.
import "server-only";
import JSZip from "jszip";

type Cell = string | number | boolean | null;
export interface Workbook { sheets: string[]; cell: (sheet: string, addr: string) => Cell; rows: (sheet: string) => Cell[][] }

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colNum = (s: string) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };

export async function readWorkbook(data: Uint8Array | ArrayBuffer): Promise<Workbook> {
  const zip = await JSZip.loadAsync(data);
  const text = async (p: string) => (await zip.file(p)?.async("string")) ?? "";

  // shared strings (rich text runs joined)
  const sst = (await text("xl/sharedStrings.xml")).match(/<si>[\s\S]*?<\/si>/g)?.map((si) =>
    decode([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""))) ?? [];

  // sheet name -> XML part
  const wb = await text("xl/workbook.xml"), rels = await text("xl/_rels/workbook.xml.rels");
  const target: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) target[id] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
  }
  const parts: Record<string, string> = {};
  const sheets: string[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])?.[1] ?? ""), rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (name && rid && target[rid]) { parts[name] = target[rid]; sheets.push(name); }
  }

  // parse a sheet once, on first use
  const cache = new Map<string, Map<string, Cell>>();
  async function load(sheet: string) {
    const out = new Map<string, Cell>();
    const xml = parts[sheet] ? await text(parts[sheet]) : "";
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1], body = m[2] ?? "";
      const r = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!r) continue;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: Cell = null;
      if (t === "s" && v !== undefined) val = sst[Number(v)] ?? null;
      else if (t === "inlineStr") val = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "str") val = v !== undefined ? decode(v) : null;
      else if (t === "b") val = v === "1";
      else if (t === "e") val = null;
      else if (v !== undefined) val = Number(v);
      out.set(r, val);
    }
    cache.set(sheet, out);
  }
  for (const s of sheets) await load(s);

  return {
    sheets,
    cell: (sheet, addr) => cache.get(sheet)?.get(addr) ?? null,
    rows: (sheet) => {
      const m = cache.get(sheet);
      if (!m) return [];
      const grid: Cell[][] = [];
      for (const [addr, v] of m) {
        if (v === null || v === "") continue;
        const [, col, row] = /^([A-Z]+)(\d+)$/.exec(addr)!;
        const r = Number(row) - 1, c = colNum(col) - 1;
        (grid[r] ||= [])[c] = v;
      }
      return grid.filter(Boolean);
    },
  };
}

/** Every sheet as tab-separated text (for the AI), capped so very large workbooks stay readable. */
export function workbookAsText(wb: Workbook, maxChars = 200_000) {
  let out = "";
  for (const s of wb.sheets) {
    out += `### Sheet: ${s}\n`;
    for (const row of wb.rows(s)) {
      const line = Array.from(row, (v) => (v === undefined || v === null ? "" : typeof v === "number" ? String(+v.toFixed(6)) : String(v).replace(/\s+/g, " "))).join("\t").replace(/\t+$/, "");
      if (line) out += line + "\n";
      if (out.length > maxChars) return { text: out, truncated: true };
    }
    out += "\n";
  }
  return { text: out, truncated: false };
}

/** If this is one of our Master Budget workbooks (the app's own export or a master template), the sheet its inputs
 *  are on: "Project Inputs" from the version 2 master (25 Nov 2026), "Assumptions" before. Otherwise null. */
export const budgetInputSheet = (wb: Workbook) => {
  if (!wb.sheets.includes("Master Budget")) return null;
  for (const s of ["Project Inputs", "Assumptions"]) if (wb.sheets.includes(s) && String(wb.cell(s, "B8") ?? "").trim().toUpperCase() === "LOCATION") return s;
  return null;
};
export const isBudgetWorkbook = (wb: Workbook) => budgetInputSheet(wb) !== null;
